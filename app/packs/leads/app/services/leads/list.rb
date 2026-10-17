# The lead list and ⌘K search (spec 2008 decisions 5 and 10): role-scoped, filtered by status,
# keyset-paged by (lead_created_at desc, id) and searched by a literal, wildcard-escaped
# name/email contains. Membership + the next-action queue come from the shared
# `Leads::Queues::SQL_CTE`; the page is then hydrated with the lead's card data.
module Leads
  module List
    DEFAULT_PER = 50
    MAX_PER = 50
    SEARCH_LIMIT = 8

    # Status filter -> SQL over the `queued` CTE's `q`. Unknown values fall back to "open"
    # (the contract only documents this enum).
    STATUSES = {
      "open" => "q.outcome = 'open'",
      "paused" => "q.outcome = 'paused'",
      "accepted" => "q.outcome = 'accepted'",
      "closed" => "q.outcome IN ('not_eligible', 'withdrew', 'unresponsive')",
      "all" => "true"
    }.freeze

    # `{{status}}` is replaced (from STATUSES, never from user input) before the binds are
    # quoted, so the status filter cannot inject SQL.
    SQL = <<~SQL.freeze
      #{Leads::Queues::SQL_CTE}
      SELECT q.id, q.queue, q.lead_created_at
      FROM queued q
      JOIN leads l ON l.id = q.id
      WHERE ({{status}})
        AND (:q::text IS NULL OR l.first_name ILIKE :q OR l.last_name ILIKE :q OR l.email ILIKE :q)
        AND (:cursor_at::timestamptz IS NULL OR (q.lead_created_at, q.id) < (:cursor_at::timestamptz, :cursor_id::uuid))
      ORDER BY q.lead_created_at DESC, q.id DESC
      LIMIT :limit
    SQL

    # -> { leads: [LeadCard], next_cursor: }. `coordinator` filters for owners only.
    def self.call(user:, status: "open", coordinator: nil, q: nil, cursor: nil, per: DEFAULT_PER)
      coordinator = user.owner? ? coordinator.presence : user.coordinator_name
      search = q.presence
      limit = search && cursor.blank? ? SEARCH_LIMIT : normalize_per(per)

      rows = query(coordinator: coordinator, status: status, q: search, cursor: cursor, limit: limit)
      leads = load_leads(rows)
      { leads: cards(rows, leads), next_cursor: next_cursor(search, rows, leads, limit) }
    end

    def self.cards(rows, leads)
      rows.filter_map do |row|
        lead = leads[row["id"]]
        LeadCardSerializer.call(lead: lead, queue: row["queue"]) if lead
      end
    end

    def self.next_cursor(search, rows, leads, limit)
      return nil if search

      last = leads[rows.last["id"]] if rows.size == limit && rows.any?
      last && "#{last.lead_created_at.utc.iso8601(6)}|#{last.id}"
    end

    def self.query(coordinator:, status:, q:, cursor:, limit:)
      agency = Current.agency
      as_of = Leads::Queues.latest_as_of(agency)
      return [] if as_of.nil?

      cursor_at, cursor_id = decode_cursor(cursor)
      binds = {
        agency_id: agency.id,
        as_of: as_of,
        as_of_date: as_of.in_time_zone(agency.timezone).to_date,
        coordinator: coordinator,
        q: q && "%#{ActiveRecord::Base.sanitize_sql_like(q)}%",
        cursor_at: cursor_at,
        cursor_id: cursor_id,
        limit: limit
      }
      statement = SQL.sub("{{status}}", STATUSES.fetch(status, STATUSES.fetch("open")))
      ActiveRecord::Base.connection.select_all(
        ActiveRecord::Base.sanitize_sql_array([ statement, binds ]), "Leads::List"
      ).to_a
    end

    def self.load_leads(rows)
      ids = rows.map { |row| row["id"] }
      return {} if ids.empty?

      Lead.where(id: ids).includes(:lead_fact, :screener_answers).index_by(&:id)
    end

    def self.normalize_per(per)
      value = per.to_i
      value.positive? ? [ value, MAX_PER ].min : DEFAULT_PER
    end

    def self.decode_cursor(cursor)
      return [ nil, nil ] if cursor.blank?

      at, id = cursor.split("|", 2)
      return [ nil, nil ] if at.blank? || id.blank?

      [ Time.iso8601(at).utc, id ]
    rescue ArgumentError
      [ nil, nil ]
    end
  end
end
