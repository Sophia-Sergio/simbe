require "rails_helper"

RSpec.describe "GET /api/v1/me", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let!(:owner) { create(:user, email: "erin@harbor.test", name: "Erin Walsh", password: "simbe-dev-pass") }

  it "returns the Me contract for a signed-in owner" do
    post "/api/v1/session", params: { email: owner.email, password: "simbe-dev-pass" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)

    get "/api/v1/me"
    expect(response).to have_http_status(:ok)

    body = response.parsed_body
    expect(body.dig("user", "role")).to eq("owner")
    expect(body.dig("agency", "qualified_milestone")).to eq("consult_attended")
  end

  it "requires a session" do
    get "/api/v1/me"
    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body.dig("error", "code")).to eq("unauthenticated")
  end
end
