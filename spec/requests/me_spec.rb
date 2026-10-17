require "rails_helper"

# One owner spec per HTTP path (docs/conventions/testing.md): GET /me is covered here only
# (auth_spec covers POST/DELETE /session).
RSpec.describe "GET /api/v1/me", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let!(:owner) { create(:user, email: "erin@harbor.test", name: "Erin Walsh", password: "simbe-dev-pass") }

  def sign_in
    post "/api/v1/session", params: { email: owner.email, password: "simbe-dev-pass" }, headers: headers, as: :json
  end

  it "returns the Me contract for a signed-in owner" do
    sign_in
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

  it "rejects a forged session cookie with 401, never 500" do
    get "/api/v1/me", headers: { "Cookie" => "simbe_session=forged-not-signed" }
    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body.dig("error", "code")).to eq("unauthenticated")
  end

  it "rejects an expired session with 401" do
    sign_in
    AuthSession.order(created_at: :desc).first.update!(expires_at: 1.minute.ago)
    get "/api/v1/me"
    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body.dig("error", "code")).to eq("unauthenticated")
  end
end
