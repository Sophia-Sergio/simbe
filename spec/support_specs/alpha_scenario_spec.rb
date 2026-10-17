require "rails_helper"

RSpec.describe AlphaScenario do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended", timezone: "America/Los_Angeles") }

  it "writes seven CSVs with the export headers" do
    dir = described_class.copy_dir
    expect(Dir.children(dir)).to match_array(Snapshot::Constants::REQUIRED_FILES)
    expect(File.readlines(File.join(dir, "leads.csv")).first.strip).to eq(Snapshot::Constants::HEADERS.fetch("leads.csv").join(","))
    expect(File.readlines(File.join(dir, "leads.csv")).size).to eq(11)
  end

  it "loads v1 with the derived truths" do
    Current.agency = agency; snap = described_class.load!(agency)
    expect(snap.as_of).to eq(AlphaScenario::AS_OF)
    expect(Lead.count).to eq(10)
    expect(Lead.group(:channel).count).to eq("Facebook" => 3, "Instagram" => 1, "Google" => 3, "Referral" => 1, "TikTok" => 1, "Unknown" => 1)
    expect(LeadFact.where.not(consult_attended_at: nil).count).to eq(3)   # L1, L2, L8
    expect(LeadFact.where.not(records_at: nil).count).to eq(2)            # L1, L8
    expect(LeadFact.where.not(application_submitted_at: nil).count).to eq(4)  # L1, L2, L3, L8
    expect(LeadFact.where.not(accepted_at: nil).count).to eq(1)
  end

  it "replaces on reload and supports v2" do
    Current.agency = agency; described_class.load!(agency); described_class.load!(agency, :v2)
    expect(Lead.count).to eq(12); expect(Snapshot.where(agency_id: agency.id).count).to eq(2)
    expect(Lead.find_by!(first_name: "L4").current_stage).to eq("consult")
  end

  it "never mixes agencies" do
    other = create(:agency); Current.agency = other; described_class.load!(other)
    Current.agency = agency; described_class.load!(agency)
    expect(Lead.count).to eq(10); Current.agency = other; expect(Lead.count).to eq(10)
  end
end
