# The coordinator's daily "Next actions" screen (spec 2008, decisions 7-8): the four queues
# from Leads::Queues with per-item done state and progress, plus the idempotent done/undo
# toggles. Queue membership is the shared read-model; this service only shapes it and tracks
# completions.
#
# Completions are keyed by (user, lead_external_id, queue, snapshot_as_of) so a new snapshot
# naturally resets the day (docs/superpowers/specs/2026-10/2026-10-14-2008-leads-workflow-design.md).
# `Leads` is the pack namespace; `Lead`/`ActionCompletion` are models.
module Leads
  module NextActions
    # A queue key that is not one of Leads::Queues::KEYS -> the API renders 422 bad_queue.
    BadQueue = Class.new(StandardError)

    # Fixed order and copy (spec 2008 decision 8). `tone` maps to the UI's status colors.
    QUEUES = [
      { key: "text_back_now", title: "Text back now", hint: "New leads, no message sent yet", tone: "danger" },
      { key: "nudge_applications", title: "Nudge applications", hint: "Quiet 24h+ mid-application", tone: "warning" },
      { key: "rebook_consults", title: "Rebook consults", hint: "No-show with no new booking", tone: "violet" },
      { key: "paused_due_back", title: "Paused, due back", hint: "Return date has passed", tone: "neutral" }
    ].freeze

    # -> { as_of:, progress: { done:, total: }, queues: [{ key:, title:, hint:, tone:, count:, items: [...] }] }
    # Always the four queues, in fixed order; `count` is the not-done items, items are oldest first.
    def self.call(user:, coordinator: nil)
      agency = user.agency
      as_of = Queues.latest_as_of(agency)
      rows = Queues.call(agency: agency, coordinator: visible_coordinator(user, coordinator), as_of: as_of)
      completed = completed_keys(user, as_of)
      sections = nudge_sections(rows)

      queues = QUEUES.map do |meta|
        items = rows.select { |row| row[:queue] == meta[:key] }.map do |row|
          {
            # The API's lead id is the export's external_id (contracts/examples and the frontend
            # take item.lead_id straight into /leads/:id and the completion URL); the surrogate
            # DB id never leaves the server.
            lead_id: row[:external_id],
            name: row[:name],
            age_minutes: row[:age_minutes],
            age_label: age_label(row[:age_minutes]),
            reason: reason(row, sections),
            done: completed.include?([ row[:external_id], row[:queue] ])
          }
        end
        meta.merge(count: items.count { |item| !item[:done] }, items: items)
      end

      {
        as_of: as_of,
        progress: {
          done: queues.sum { |queue| queue[:items].count { |item| item[:done] } },
          total: queues.sum { |queue| queue[:items].size }
        },
        queues: queues
      }
    end

    # Idempotent: completing twice leaves exactly one row. Raises BadQueue for an unknown queue
    # and ActiveRecord::RecordNotFound when the lead is outside the user's scope or not currently
    # in that queue (docs/superpowers/plans/2026-10/2026-10-14-2009-leads-workflow-api.md, task 4).
    def self.complete!(user:, lead_id:, queue:)
      row = membership_row(user, lead_id, queue)
      completion = ActionCompletion.find_or_initialize_by(
        user_id: user.id, lead_external_id: row[:external_id], queue: queue,
        snapshot_as_of: Queues.latest_as_of(user.agency)
      )
      completion.completed_at ||= Time.current
      completion.save!
      true
    end

    # Idempotent undo: removing a completion that is not there is a no-op.
    def self.undo!(user:, lead_id:, queue:)
      row = membership_row(user, lead_id, queue)
      ActionCompletion.where(
        user_id: user.id, lead_external_id: row[:external_id], queue: queue,
        snapshot_as_of: Queues.latest_as_of(user.agency)
      ).delete_all
      false
    end

    # A coordinator only ever sees (and completes) their own leads; an owner may narrow the list
    # to one coordinator and otherwise sees every queue (spec 2008 decision 8).
    def self.visible_coordinator(user, requested)
      user.coordinator? ? user.coordinator_name : requested.presence
    end

    # The queue row for a lead in the user's scope, or RecordNotFound. Queue validity is checked
    # first so an unknown queue is a 422 even for an id that does not exist. `lead_id` is the
    # export's external_id (what the API hands out as lead_id).
    def self.membership_row(user, lead_id, queue)
      raise BadQueue, "unknown queue #{queue.inspect}" unless Queues::KEYS.include?(queue)

      lead = Access.relation(user).find_by!(external_id: lead_id)
      row = Queues.call(agency: user.agency, coordinator: visible_coordinator(user, nil),
                        as_of: Queues.latest_as_of(user.agency))
                  .find { |queued| queued[:external_id] == lead.external_id }
      raise ActiveRecord::RecordNotFound, "lead is not in queue #{queue}" unless row && row[:queue] == queue

      row
    end

    # The API reason for a queue row. Spec 2008 decision 2 names the application's last completed
    # section on a nudge ("Application 40% · quiet 8d · last section pregnancy history"), which
    # Leads::Queues' own summary reason stops short of; the queue-facing services append it here
    # rather than editing the shared read-model. Shared with the coordinator detail (same wording).
    def self.reason(row, sections)
      return row[:reason] unless row[:queue] == "nudge_applications"

      section = sections[row[:external_id]]
      section ? "#{row[:reason]} · last section #{section.tr('_', ' ')}" : row[:reason]
    end

    # external_id => last_section_completed of the lead's latest unsubmitted application, for the
    # rows currently in the nudge queue ({} when there are none). Only nudge leads are queried, and
    # a lead in that queue has its latest application unsubmitted, so this matches Leads::Queues.
    def self.nudge_sections(rows)
      external_ids = rows.select { |row| row[:queue] == "nudge_applications" }.map { |row| row[:external_id] }
      return {} if external_ids.empty?

      lead_ids = Lead.where(external_id: external_ids).pluck(:external_id, :id).to_h
      sections = Application.where(lead_id: lead_ids.values, submitted_at: nil)
                            .order(:started_at)
                            .pluck(:lead_id, :last_section_completed).to_h
      lead_ids.to_h { |external_id, lead_id| [ external_id, sections[lead_id] ] }
    end

    # [[external_id, queue], ...] the signed-in user completed for this snapshot; [] without one.
    def self.completed_keys(user, as_of)
      return Set.new if as_of.nil?

      ActionCompletion.where(user_id: user.id, snapshot_as_of: as_of)
                      .pluck(:lead_external_id, :queue).to_set
    end

    # <60m -> "38m", <24h -> "5h", else "2d" (whole units, the plan's labels).
    def self.age_label(minutes)
      return "#{minutes}m" if minutes < 60
      return "#{minutes / 60}h" if minutes < 1440

      "#{minutes / 1440}d"
    end
  end
end
