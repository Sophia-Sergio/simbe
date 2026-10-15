require "rails_helper"

RSpec.describe "Auth", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let!(:user) { create(:user, email: "erin@harbor.test", password: "secret-pass-1") }

  it "signs in and sets the session cookie" do
    post "/api/v1/session", params: { email: "erin@harbor.test", password: "secret-pass-1" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
    expect(response.cookies["simbe_session"]).to be_present
    expect(response.parsed_body.dig("user", "role")).to eq("owner")
  end

  it "rejects a wrong password with 401 invalid_credentials" do
    post "/api/v1/session", params: { email: "erin@harbor.test", password: "nope" }, headers: headers, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_credentials")
  end

  it "rejects an unknown email with 401 invalid_credentials (no user enumeration)" do
    post "/api/v1/session", params: { email: "nobody@harbor.test", password: "secret-pass-1" }, headers: headers, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_credentials")
  end

  it "requires the CSRF header on non-GET" do
    post "/api/v1/session", params: { email: "erin@harbor.test", password: "secret-pass-1" }, as: :json
    expect(response).to have_http_status(:forbidden)
    expect(response.parsed_body.dig("error", "code")).to eq("csrf")
  end

  it "signs out" do
    post "/api/v1/session", params: { email: "erin@harbor.test", password: "secret-pass-1" }, headers: headers, as: :json
    delete "/api/v1/session", headers: headers
    expect(response).to have_http_status(:no_content)
  end
end
