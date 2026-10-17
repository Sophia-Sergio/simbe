require "rails_helper"

# One owner spec for the invitation paths: POST /invitations, DELETE /invitations/:id,
# GET /invitations/:token/preview and POST /invitations/:token/accept
# (docs/conventions/testing.md). GET /team and GET /coordinator_names live in team_spec.
RSpec.describe "Invitations", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", name: "Alpha Surrogacy") }
  let!(:owner) { create(:user, agency: agency, email: "owner@alpha.test", password: "secret-pass-1") }

  before { AlphaScenario.load!(agency) }

  def sign_in(user = owner)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  def invite(email: "maya@alpha.test", coordinator_name: "Jess Kim")
    post "/api/v1/invitations", params: { email: email, coordinator_name: coordinator_name },
         headers: headers, as: :json
  end

  it "invites a coordinator tied to a real coordinator name and accepts the invite" do
    sign_in
    invite
    expect(response).to have_http_status(:created)
    expect(response.parsed_body).to include(
      "role" => "coordinator", "coordinator_name" => "Jess Kim", "status" => "pending"
    )
    token = response.parsed_body["accept_url"].split("/").last

    delete "/api/v1/session", headers: headers

    get "/api/v1/invitations/#{token}/preview"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("agency_name" => "Alpha Surrogacy", "email" => "maya@alpha.test")

    post "/api/v1/invitations/#{token}/accept",
         params: { name: "Maya Chen", password: "long-enough-pass" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
    expect(response.parsed_body["user"]).to include("role" => "coordinator", "coordinator_name" => "Jess Kim")
    expect(response.cookies["simbe_session"]).to be_present

    # The token is single use: preview and a second accept both answer 410.
    get "/api/v1/invitations/#{token}/preview"
    expect(response).to have_http_status(:gone)
    post "/api/v1/invitations/#{token}/accept",
         params: { name: "Maya Chen", password: "long-enough-pass" }, headers: headers, as: :json
    expect(response).to have_http_status(:gone)
  end

  it "rejects unknown coordinator names with the valid list" do
    sign_in
    invite(email: "x@alpha.test", coordinator_name: "Nobody")

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("unknown_coordinator")
    expect(response.parsed_body["valid_names"]).to match_array([ "Dana Ortiz", "Jess Kim", "Priya Shah" ])
  end

  it "410s an expired token" do
    sign_in
    invite(email: "e@alpha.test")
    token = response.parsed_body["accept_url"].split("/").last

    travel_to(8.days.from_now) do
      get "/api/v1/invitations/#{token}/preview"
      expect(response).to have_http_status(:gone)
      expect(response.parsed_body.dig("error", "code")).to eq("invitation_expired")
    end
  end

  it "revokes a pending invitation" do
    sign_in
    invite
    id = response.parsed_body["id"]

    expect { delete "/api/v1/invitations/#{id}", headers: headers }.to change(Invitation.unscoped, :count).by(-1)
    expect(response).to have_http_status(:no_content)
  end

  it "404s another agency's invitation on delete" do
    beta = create(:agency)
    foreign = Current.set(agency: beta) do
      Invitation.create!(
        agency: beta, email: "beta@other.test", coordinator_name: "Beta Coordinator",
        token_digest: SecureRandom.hex(32), expires_at: 7.days.from_now
      )
    end
    sign_in

    delete "/api/v1/invitations/#{foreign.id}", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "forbids coordinators on the team routes" do
    coordinator = create(:user, :coordinator, agency: agency)
    sign_in(coordinator)

    get "/api/v1/team"
    expect(response).to have_http_status(:forbidden)

    invite
    expect(response).to have_http_status(:forbidden)
  end
end
