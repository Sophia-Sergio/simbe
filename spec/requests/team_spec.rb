require "rails_helper"

# One owner spec for GET /team and GET /coordinator_names (docs/conventions/testing.md).
RSpec.describe "Team", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", name: "Alpha Surrogacy") }
  let!(:owner) { create(:user, agency: agency, email: "owner@alpha.test", name: "Erin Walsh") }
  let!(:coordinator) do
    create(:user, :coordinator, agency: agency, email: "dana@alpha.test", name: "Dana Ortiz",
                                coordinator_name: "Dana Ortiz")
  end
  let!(:invitation) do
    Current.set(agency: agency) do
      Invitation.create!(
        agency: agency, email: "maya@alpha.test", coordinator_name: "Jess Kim",
        token_digest: SecureRandom.hex(32), expires_at: 7.days.from_now
      )
    end
  end

  before { AlphaScenario.load!(agency) }

  def sign_in(user = owner)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  it "lists the agency's users and pending invitations in the Team contract shape" do
    sign_in
    get "/api/v1/team"

    expect(response).to have_http_status(:ok)
    team = response.parsed_body
    example = JSON.parse(Rails.root.join("contracts/examples/account/team.json").read)

    expect(team.keys).to eq(example.keys)
    expect(team["users"].map { |user| user.keys }).to all(eq(example["users"].first.keys))
    expect(team["invitations"].first.keys).to eq(example["invitations"].first.keys)

    expect(team["users"].find { |user| user["role"] == "owner" }).to include(
      "name" => "Erin Walsh", "email" => "owner@alpha.test", "coordinator_name" => nil
    )
    expect(team["users"].find { |user| user["role"] == "coordinator" }).to include(
      "name" => "Dana Ortiz", "email" => "dana@alpha.test", "coordinator_name" => "Dana Ortiz"
    )
    expect(team["invitations"].first).to include(
      "email" => "maya@alpha.test", "role" => "coordinator",
      "coordinator_name" => "Jess Kim", "status" => "pending"
    )
    expect(team["invitations"].first["expires_at"]).to be_present
  end

  it "never lists another agency's users or invitations" do
    beta = create(:agency)
    create(:user, agency: beta, email: "beta@other.test", name: "Beta Owner")
    Current.set(agency: beta) do
      Invitation.create!(
        agency: beta, email: "beta-invite@other.test", coordinator_name: "Beta Coordinator",
        token_digest: SecureRandom.hex(32), expires_at: 7.days.from_now
      )
    end
    sign_in

    get "/api/v1/team"
    expect(response.parsed_body["users"].map { |user| user["email"] }).not_to include("beta@other.test")
    expect(response.parsed_body["invitations"].map { |row| row["email"] }).not_to include("beta-invite@other.test")
  end

  it "forbids coordinators" do
    sign_in(coordinator)
    get "/api/v1/team"
    expect(response).to have_http_status(:forbidden)
  end

  it "lists the coordinator names present in the agency's leads" do
    sign_in
    get "/api/v1/coordinator_names"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["names"]).to match_array([ "Dana Ortiz", "Jess Kim", "Priya Shah" ])
  end

  it "allows only the owner to read coordinator names" do
    sign_in(coordinator)
    get "/api/v1/coordinator_names"
    expect(response).to have_http_status(:forbidden)
  end
end
