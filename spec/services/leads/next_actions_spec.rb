require "rails_helper"

# The next-actions read-model (detail reference task 4). Queue membership itself is covered in
# queues_spec; the done/undo toggle over HTTP is owned by spec/requests/next_actions_spec.rb.
RSpec.describe Leads::NextActions do
  let(:agency) { create(:agency, slug: "alpha", timezone: "America/Los_Angeles") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }

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

  # The done/undo toggle itself (happy path, double POST/DELETE idempotence, bad_queue, 404s) is
  # owned by spec/requests/next_actions_spec.rb (docs/conventions/testing.md: one owner per
  # behaviour). Kept here: the read-model, and edges the request spec cannot reach.
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

  it "rejects completing a lead that is in scope but not currently in that queue" do
    l1 = Lead.find_by!(first_name: "L1") # accepted, not queued
    expect { described_class.complete!(user: owner, lead_id: l1.external_id, queue: "text_back_now") }
      .to raise_error(ActiveRecord::RecordNotFound)
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
