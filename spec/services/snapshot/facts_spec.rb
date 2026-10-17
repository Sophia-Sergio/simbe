require "rails_helper"

RSpec.describe Snapshot::Facts do
  let(:agency) { create(:agency) }
  let(:created) { Time.utc(2026, 9, 20, 10, 0, 0) }

  before { Current.agency = agency }

  def stage_offsets
    { "inquiry" => 0, "pre_screen" => 10.minutes, "application" => 1.day,
      "consult" => 2.days, "records" => 4.days, "accepted" => 6.days }
  end

  def make_lead(attrs = {})
    Lead.create!({ external_id: SecureRandom.uuid, lead_created_at: created, channel: "Unknown",
                   current_stage: "inquiry", outcome: "open" }.merge(attrs))
  end

  # Walks the same 10-agency Alpha shape: inquiry → accepted, an application submitted,
  # an attended consult, and screener answers across yes/review/no.
  let!(:accepted) do
    lead = make_lead(current_stage: "accepted", outcome: "accepted")
    stage_offsets.each { |stage, offset| StageEvent.create!(lead: lead, stage: stage, entered_at: created + offset) }
    Application.create!(lead: lead, started_at: created + 1.day, submitted_at: created + 2.days,
                        percent_complete: 100, last_section_completed: "review_and_sign")
    Appointment.create!(lead: lead, booked_at: created + 2.days, scheduled_for: created + 3.days, status: "attended")
    [ [ "How old are you?", "34", "yes" ], [ "Do you smoke?", "no", "yes" ],
      [ "Household income?", "60000", "review" ], [ "Prior surrogacy?", "no", "no" ] ].each do |question, answer, verdict|
      ScreenerAnswer.create!(lead: lead, submitted_at: created + 1.hour, question: question, answer: answer,
                             meets_requirement: verdict)
    end
    lead
  end

  let!(:contacted) do
    lead = make_lead(lead_created_at: Time.utc(2026, 9, 21, 10, 0, 0))
    Contact.create!(lead: lead, contacted_at: lead.lead_created_at + 30.minutes, direction: "outbound", channel: "text")
    lead
  end

  let!(:silent) { make_lead(lead_created_at: Time.utc(2026, 9, 22, 10, 0, 0)) }

  before { described_class.call(agency.id) }

  def fact(lead) = LeadFact.find_by!(lead_id: lead.id)

  it "derives the accepted milestones and the furthest stage with exact timestamps" do
    f = fact(accepted)
    expect(f.application_submitted_at).to eq(created + 2.days)
    expect(f.consult_attended_at).to eq(created + 3.days)
    expect(f.records_at).to eq(created + 4.days)
    expect(f.accepted_at).to eq(created + 6.days)
    expect(f.furthest_stage).to eq("accepted")
  end

  it "derives first response minutes from the first outbound contact" do
    f = fact(contacted)
    expect(f.first_outbound_at).to be_present
    expect(f.first_response_minutes).to eq(30)
  end

  it "leaves the response fields nil when the lead has no contacts" do
    f = fact(silent)
    expect(f.first_outbound_at).to be_nil
    expect(f.first_response_minutes).to be_nil
  end

  it "counts screener answers by requirement" do
    f = fact(accepted)
    expect([ f.screener_met, f.screener_review, f.screener_not_met, f.screener_total ]).to eq([ 2, 1, 1, 4 ])
  end

  it "uses the FIRST submission when a lead has several applications" do
    lead = make_lead
    Application.create!(lead: lead, started_at: created, submitted_at: created + 1.day, percent_complete: 100)
    Application.create!(lead: lead, started_at: created + 2.days, submitted_at: created + 3.days, percent_complete: 100)
    described_class.call(agency.id)
    expect(fact(lead).application_submitted_at).to eq(created + 1.day)
  end

  it "counts an attended appointment with no scheduled_for (the oracle counts it as attended)" do
    lead = make_lead
    Appointment.create!(lead: lead, booked_at: created + 1.day, status: "attended")
    described_class.call(agency.id)
    expect(fact(lead).consult_attended_at).to eq(created + 1.day)
  end

  it "replaces the agency's facts instead of duplicating them on a second run" do
    described_class.call(agency.id)
    expect(LeadFact.where(agency_id: agency.id).count).to eq(3)
    expect(LeadFact.where(agency_id: agency.id).distinct.count(:lead_id)).to eq(3)
  end

  it "never touches another agency's facts" do
    other = create(:agency)
    Current.agency = other
    other_lead = Lead.create!(external_id: SecureRandom.uuid, lead_created_at: created, channel: "Unknown",
                              current_stage: "inquiry", outcome: "open")
    other_fact = LeadFact.create!(lead: other_lead, furthest_stage: "inquiry", first_response_minutes: 7)

    Current.agency = agency
    described_class.call(agency.id)

    expect(LeadFact.unscoped.where(agency_id: other.id).count).to eq(1)
    expect(LeadFact.unscoped.find(other_fact.id).first_response_minutes).to eq(7)
  end
end
