require "rails_helper"

# AgentMessage has no agency_id; it must still only ever be read/written through the signed-in
# agency's conversations (docs/conventions/multi-tenancy.md).
RSpec.describe AgentMessage do
  let(:a) { create(:agency) }
  let(:b) { create(:agency) }

  it "scopes messages to the signed-in agency's conversations" do
    Current.agency = a
    conversation = AgentConversation.create!(user: create(:user, agency: a), title: "a")
    AgentMessage.create!(conversation: conversation, role: "user", body: { "text" => "hi" })

    Current.agency = b
    expect(AgentMessage.count).to eq(0)

    Current.agency = a
    expect(AgentMessage.count).to eq(1)
  end

  it "raises without a current agency" do
    Current.agency = nil
    expect { AgentMessage.count }.to raise_error(Agency::MissingContext)
  end
end
