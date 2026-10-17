# The rule-based lead summary (spec 2008 decision 6) — no LLM in this feature. The text
# names the furthest stage the lead reached and what that means for their state; the
# next step comes from the lead's next-action queue (the same queues as Leads::Queues).
module Leads
  module Summarizer
    STAGE_LABELS = {
      "inquiry" => "inquiry",
      "pre_screen" => "the screener",
      "application" => "the application",
      "consult" => "the consult",
      "records" => "medical records",
      "accepted" => "acceptance"
    }.freeze

    NO_ACTION = "No action needed right now."

    # Queue -> closing clause of the text (the fixture's "and …"/"but …" phrasing).
    CLAUSES = {
      "text_back_now" => "and no message has been sent yet.",
      "nudge_applications" => "and has not finished it.",
      "rebook_consults" => "but missed the consult.",
      "paused_due_back" => "and is due back."
    }.freeze

    # Outcome -> closing clause for a lead that is not queued.
    OUTCOME_CLAUSES = {
      "accepted" => "and has been accepted.",
      "not_eligible" => "and was not eligible.",
      "withdrew" => "and withdrew.",
      "unresponsive" => "and has not responded."
    }.freeze

    # -> { text:, next_step: }.
    def self.call(lead:, queue: nil, application: nil)
      stage, at = furthest(lead)
      { text: text(lead, queue, stage, at), next_step: next_step(queue, application) }
    end

    def self.furthest(lead)
      stage = lead.lead_fact&.furthest_stage || lead.current_stage
      event = lead.stage_events.find { |item| item.stage == stage }
      [ stage, event&.entered_at || lead.lead_created_at ]
    end

    def self.text(lead, queue, stage, at)
      "#{lead.first_name} reached #{STAGE_LABELS.fetch(stage, stage)} on #{short_date(at)} #{clause(lead, queue)}"
    end

    def self.clause(lead, queue)
      CLAUSES[queue] || OUTCOME_CLAUSES[lead.outcome] || "and is on track."
    end

    # Gender-neutral wording: the data carries no gender, so the next step never assumes one
    # ("them"/"their"). A missing application falls back to 0% instead of rendering "(…% complete)".
    def self.next_step(queue, application)
      case queue
      when "text_back_now" then "Text them back now — no message has been sent."
      when "nudge_applications" then "Nudge them to finish the application (#{application&.percent_complete || 0}% complete)."
      when "rebook_consults" then "Offer a new consult time."
      when "paused_due_back" then "Reach out — their return date has passed."
      else NO_ACTION
      end
    end

    # Dates in the agency's time zone (docs/conventions/database.md).
    def self.short_date(time)
      time.in_time_zone(Current.agency.timezone).strftime("%b %-d")
    end
  end
end
