# The JSON card both the board and the list render (contracts/openapi/schemas/leads.yaml
# #/LeadCard). Age is the only screener answer a card exposes: it comes from
# "How old are you?" and only that answer is read/decrypted here
# (docs/conventions/sensitive-data.md). `Leads` is the pack namespace; `Lead` is the model.
class LeadCardSerializer
  AGE_QUESTION = "How old are you?"
  CLOSED_OUTCOMES = %w[not_eligible withdrew unresponsive].freeze

  # -> Hash. `queue` is the lead's next-action queue (nil when it is not queued).
  def self.call(lead:, queue: nil)
    {
      id: lead.external_id,
      name: name(lead),
      channel: lead.channel,
      status: Leads::Status.call(outcome: lead.outcome, queue: queue),
      state: lead.state,
      age: age(lead),
      date: lead.lead_created_at,
      coordinator: lead.coordinator_name,
      stage: lead.current_stage,
      segments: segments(lead.lead_fact&.furthest_stage, queue: queue, outcome: lead.outcome)
    }
  end

  def self.name(lead)
    [ lead.first_name, lead.last_name ].compact_blank.join(" ")
  end

  # Nil when the lead has no age answer or it is not a number.
  def self.age(lead)
    answer = lead.screener_answers.find { |item| item.question == AGE_QUESTION }&.answer
    Integer(answer, exception: false)
  end

  # Six segments (spec 2008 decision 4): everything before the furthest stage is `done`, the
  # furthest stage is `action` (queued), `closed` (a closed outcome) or `current`, and the
  # later stages are `todo`.
  def self.segments(furthest_stage, queue:, outcome:)
    index = Lead::STAGES.index(furthest_stage) || 0
    Lead::STAGES.each_index.map do |position|
      if position < index
        "done"
      elsif position > index
        "todo"
      elsif queue
        "action"
      elsif CLOSED_OUTCOMES.include?(outcome)
        "closed"
      else
        "current"
      end
    end
  end
end
