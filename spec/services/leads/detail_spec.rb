require "rails_helper"

RSpec.describe Leads::Detail do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  def lead(first_name) = Lead.find_by!(first_name: first_name)

  it "masks the phone for the owner and shows it to the assigned coordinator" do
    owner_view = described_class.call(user: owner, id: lead("L4").id)
    expect(owner_view[:contact][:phone]).to match(/\A•••-••••-\d{4}\z/)
    dana_view = described_class.call(user: dana, id: lead("L4").id)
    expect(dana_view[:contact][:phone]).to eq(lead("L4").phone)
    expect([ owner_view[:contact][:can_contact], dana_view[:contact][:can_contact] ]).to eq([ false, true ])
  end

  it "shows raw screener answers only to the assigned coordinator" do
    expect(described_class.call(user: owner, id: lead("L4").id)[:screener][:items].first.keys).not_to include(:answer)
    expect(described_class.call(user: dana, id: lead("L4").id)[:screener][:items].first).to include(:answer)
  end

  it "shows the age to both roles" do
    expect(described_class.call(user: owner, id: lead("L4").id)[:contact][:age]).to eq(28)
    expect(described_class.call(user: dana, id: lead("L4").id)[:contact][:age]).to eq(28)
  end

  it "404s a lead outside the coordinator's scope" do
    other = lead("L1") # Jess Kim
    expect { described_class.call(user: dana, id: other.id) }.to raise_error(ActiveRecord::RecordNotFound)
  end

  it "builds counts, process, status and a newest-first activity timeline" do
    detail = described_class.call(user: owner, id: lead("L4").id)
    expect(detail[:screener][:counts]).to eq(met: 10, review: 0, not_met: 0, unanswered: 0, total: 10)
    expect(detail[:process].map { | step | [ step[:key], step[:state] ] }).to eq(
      [ [ "screener", "complete" ], [ "application", "ongoing" ], [ "consult", "upcoming" ],
        [ "records", "upcoming" ], [ "accepted", "upcoming" ] ])
    expect(detail[:process].find { | step | step[:key] == "application" }[:detail]).to eq("40% - stopped at pregnancy history")
    expect(detail[:activity].map { | item | item[:at] }).to eq(detail[:activity].map { | item | item[:at] }.sort.reverse)
    expect(detail[:status]).to eq(key: "nudge", label: "Nudge", tone: "warning")
    expect(detail[:queue]).to eq("nudge_applications")
    expect(detail[:done]).to be(false)
    expect(detail[:summary][:text]).to eq("L4 reached the application on Sep 24 and has not finished it.")
    expect(detail[:summary][:next_step]).to match(/finish the application/)
  end

  it "shows the no-show consult" do
    detail = described_class.call(user: dana, id: lead("L3").id)
    expect(detail[:consult][:status]).to eq("no_show")
    expect(detail[:process].find { | step | step[:key] == "consult" }[:state]).to eq("ongoing")
  end

  it "renders a lead with no appointment, application or contacts" do
    expect { described_class.call(user: owner, id: lead("L7").id) }.not_to raise_error
  end

  it "does not leak answers to the owner" do
    expect(described_class.call(user: owner, id: lead("L4").id).to_json).not_to match(/"answer"/)
  end
end
