require "rails_helper"

# The next-actions read-model and the done/undo toggles (detail reference task 4). Queue
# membership itself is covered in queues_spec; this file covers the shaping, progress, scoping
# and idempotent completions that Leads::Queues does not.
RSpec.describe Leads::NextActions do
  let(:agency) { create(:agency, slug: "alpha", timezone: "America/Los_Angeles") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  let!(:priya) { create(:user, :coordinator, agency: agency, coordinator_name: "Priya Shah") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
  end

  it "returns four queues in order with counts and progress" do
    result = described_class.call(user: owner)
    expect(result[:queues].map { _1[:key] }).to eq(%w[text_back_now nudge_applications rebook_consults paused_due_back])
    expect(result[:queues].map { _1[:count] }).to eq([ 1, 1, 1, 1 ])
    expect(result[:progress]).to eq(done: 0, total: 4)
    expect(result[:queues].first[:items].first).to include(name: "L7 Alpha", age_label: "2d", done: false)
    expect(result[:as_of]).to eq(AlphaScenario::AS_OF)
  end

  it "scopes a coordinator to their own leads and ignores an explicit coordinator" do
    expect(described_class.call(user: dana)[:queues].sum { _1[:items].size }).to eq(3) # L3, L4, L10
    expect(described_class.call(user: dana, coordinator: "Priya Shah")[:queues].sum { _1[:items].size }).to eq(3)
  end

  it "lets an owner narrow to one coordinator" do
    names = described_class.call(user: owner, coordinator: "Priya Shah")[:queues].flat_map { _1[:items] }.map { _1[:name] }
    expect(names).to eq([ "L7 Alpha" ])
  end

  it "completes and undoes idempotently" do
    l7 = Lead.find_by!(first_name: "L7")
    2.times { described_class.complete!(user: owner, lead_id: l7.external_id, queue: "text_back_now") }
    result = described_class.call(user: owner)
    expect(result[:progress]).to eq(done: 1, total: 4)
    expect(result[:queues].first[:count]).to eq(0)
    expect(result[:queues].first[:items].first[:done]).to be(true)
    expect(ActionCompletion.count).to eq(1)

    2.times { described_class.undo!(user: owner, lead_id: l7.external_id, queue: "text_back_now") }
    expect(described_class.call(user: owner)[:progress][:done]).to eq(0)
    expect(ActionCompletion.count).to eq(0)
  end

  it "rejects completing a lead that is not in that queue" do
    expect { described_class.complete!(user: owner, lead_id: Lead.find_by!(first_name: "L1").external_id, queue: "text_back_now") }
      .to raise_error(ActiveRecord::RecordNotFound)
  end

  it "rejects a coordinator completing someone else's lead" do
    l7 = Lead.find_by!(first_name: "L7") # Priya's
    expect { described_class.complete!(user: dana, lead_id: l7.external_id, queue: "text_back_now") }
      .to raise_error(ActiveRecord::RecordNotFound)
  end

  it "rejects a queue outside the known keys" do
    expect { described_class.complete!(user: owner, lead_id: Lead.find_by!(first_name: "L7").external_id, queue: "nope") }
      .to raise_error(Leads::NextActions::BadQueue)
  end

  it "stays idempotent when the insert loses a race on the unique index" do
    l7 = Lead.find_by!(first_name: "L7")
    # A concurrent POST has already committed this completion...
    ActionCompletion.create!(user_id: owner.id, lead_external_id: l7.external_id, queue: "text_back_now",
                             snapshot_as_of: AlphaScenario::AS_OF, completed_at: Time.current)
    # ...and this call's INSERT then loses on the unique index (forced here).
    allow_any_instance_of(ActionCompletion).to receive(:save!)
      .and_raise(ActiveRecord::RecordNotUnique.new("duplicate key value violates unique constraint"))

    expect { described_class.complete!(user: owner, lead_id: l7.external_id, queue: "text_back_now") }.not_to raise_error
    expect(ActionCompletion.where(lead_external_id: l7.external_id, queue: "text_back_now").count).to eq(1)
  end

  it "resets when a newer snapshot is loaded" do
    described_class.complete!(user: owner, lead_id: Lead.find_by!(first_name: "L7").external_id, queue: "text_back_now")
    AlphaScenario.load!(agency, :v2)
    expect(described_class.call(user: owner)[:progress][:done]).to eq(0)
  end

  it "returns four empty queues without a snapshot" do
    Current.agency = create(:agency, slug: "no-snapshot")
    result = described_class.call(user: create(:user, agency: Current.agency))
    expect(result[:as_of]).to be_nil
    expect(result[:queues].map { _1[:count] }).to eq([ 0, 0, 0, 0 ])
    expect(result[:progress]).to eq(done: 0, total: 0)
  end
end
