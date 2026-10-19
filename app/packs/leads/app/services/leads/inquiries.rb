# A person's other inquiries, for the lead panel (linked-inquiries spec, decisions 4-5). A lead is one
# inquiry; the same person (same email in the agency) can have several. Only what the viewer may see
# is listed (an owner: all; a coordinator: their own leads), yet `open_overlap` looks at all of them
# and exposes nothing but a boolean, so a coordinator learns nothing else about the person.
module Leads
  module Inquiries
    EMPTY = { other_inquiries: [].freeze, open_overlap: false }.freeze

    # -> { other_inquiries: [{ id:, created_at:, stage:, status:, outcome_reason:, channel:, campaign:,
    #      coordinator: }], open_overlap: Boolean }
    def self.call(user:, lead:)
      everyone = Lead.where(person_id: lead.person_id).to_a
      return EMPTY if everyone.size < 2

      visible = Leads::Access.relation(user).where(person_id: lead.person_id).where.not(id: lead.id)
                             .order(:lead_created_at, :external_id)
      { other_inquiries: visible.map { |other| item(other) }, open_overlap: overlaps?(everyone, lead) }
    end

    def self.item(lead)
      {
        id: lead.external_id, created_at: lead.lead_created_at, stage: lead.current_stage,
        status: Leads::Status.call(outcome: lead.outcome, queue: nil), outcome_reason: lead.outcome_reason,
        channel: lead.channel, campaign: lead.campaign, coordinator: lead.coordinator_name
      }
    end

    def self.overlaps?(everyone, lead)
      inquiries = everyone.map do |each|
        { id: each.external_id, created_at: each.lead_created_at, outcome: each.outcome,
          outcome_updated_at: each.outcome_updated_at }
      end
      Leads::Overlap.pairs(inquiries).any? { |pair| pair.include?(lead.external_id) }
    end
  end
end
