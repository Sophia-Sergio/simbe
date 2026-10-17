# Lead detail (spec 2008 decision 6): role-scoped (a coordinator only ever sees their own
# leads, others 404), with the raw screener answers only for the assigned coordinator and
# the phone masked for everyone else. The shaping lives in LeadDetailSerializer; this service
# loads the lead and its children (preloaded, one query per table) and resolves the lead's
# next-action queue and Done toggle.
module Leads
  module Detail
    ASSOCIATIONS = %i[lead_fact stage_events contacts screener_answers web_sessions appointments applications].freeze

    # -> Hash (LeadDetailSerializer#call), or raises ActiveRecord::RecordNotFound outside the
    # user's scope.
    def self.call(user:, id:)
      lead = Leads::Access.relation(user).includes(*ASSOCIATIONS).find(id)
      queue = queue_for(lead)
      LeadDetailSerializer.call(user: user, lead: lead, queue: queue, done: done?(user, lead, queue))
    end

    # The lead's queue, decided by the shared CTE (one row, not the whole agency).
    def self.queue_for(lead)
      agency = Current.agency
      as_of = Leads::Queues.latest_as_of(agency)
      return nil if as_of.nil?

      binds = { agency_id: agency.id, as_of: as_of,
                as_of_date: as_of.in_time_zone(agency.timezone).to_date,
                coordinator: nil, lead_id: lead.id }
      sql = "#{Leads::Queues::SQL_CTE} SELECT queue FROM queued WHERE id = :lead_id AND queue IS NOT NULL"
      row = ActiveRecord::Base.connection.select_one(ActiveRecord::Base.sanitize_sql_array([ sql, binds ]), "Leads::Detail")
      row && row["queue"]
    end

    # The Done toggle for the current snapshot: keyed by external_id + as_of, so a newer
    # snapshot resets the day (spec decision 7).
    def self.done?(user, lead, queue)
      return false if queue.nil? || lead.external_id.nil?

      as_of = Leads::Queues.latest_as_of(Current.agency)
      return false if as_of.nil?

      ActionCompletion.exists?(user_id: user.id, lead_external_id: lead.external_id, queue: queue, snapshot_as_of: as_of)
    end
  end
end
