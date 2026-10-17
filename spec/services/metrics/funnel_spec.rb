require "rails_helper"

RSpec.describe Metrics::Funnel do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  subject(:funnel) { described_class.call(agency: agency, range: "30d") }

  it "counts each funnel row and its share of the previous row and the total" do
    expect(funnel[:total]).to eq(10)
    expect(funnel[:stages].map { _1[:count] }).to eq([ 10, 5, 4, 3, 2, 1 ])
    expect(funnel[:stages].map { _1[:pct_of_previous] }).to eq([ nil, 50.0, 80.0, 75.0, 66.7, 50.0 ])
    expect(funnel[:stages].map { _1[:pct_of_total] }).to eq([ 100.0, 50.0, 40.0, 30.0, 20.0, 10.0 ])
    expect(funnel[:stages].find { _1[:qualified] }[:key]).to eq("consult_attended")
  end

  it "lists the top two exit reasons for the row a closed lead reached" do
    inquiry = funnel[:stages].first
    expect(inquiry[:exit_reasons]).to eq([ { reason: "age", count: 1 }, { reason: "bmi", count: 1 } ])
  end

  it "reports an unsubmitted application with no section as (none)" do
    Application.where(lead_id: Lead.find_by!(first_name: "L4").id).update_all(last_section_completed: nil)
    expect(funnel[:form_dropoff]).to eq([ { section: "(none)", count: 1, pct: 100.0 } ])
  end

  it "finds the biggest leak by absolute loss" do
    expect(described_class.leak(funnel[:stages])).to eq(from_stage: "Inquiry", to_stage: "Application", lost: 5, pct_lost: 50.0)
  end

  it "breaks down unsubmitted applications by last section" do
    expect(funnel[:form_dropoff]).to eq([ { section: "pregnancy_history", count: 1, pct: 100.0 } ])
  end

  it "uses the records milestone flag when the agency changes definition" do
    agency.update!(qualified_milestone: "records")
    expect(described_class.call(agency: agency, range: "30d")[:stages].find { _1[:qualified] }[:key]).to eq("records")
  end

  it "returns an all-zero funnel and no leak without a snapshot" do
    empty = described_class.call(agency: create(:agency), range: "30d")
    expect(empty[:total]).to eq(0)
    expect(empty[:stages].map { _1[:count] }).to eq([ 0, 0, 0, 0, 0, 0 ])
    expect(empty[:form_dropoff]).to eq([])
    expect(described_class.leak(empty[:stages])).to be_nil
  end
end
