require "rails_helper"

# One owner spec for GET/PATCH /api/v1/agency (docs/conventions/testing.md, metrics plan task 7).
RSpec.describe "Agency", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "harbor", name: "Harbor Surrogacy") }
  let!(:owner) { create(:user, agency: agency, email: "erin@harbor.test", password: "secret-pass-1") }
  let!(:coordinator) { create(:user, :coordinator, agency: agency, email: "dana@harbor.test") }

  def sign_in(user = owner)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  it "returns the agency in the contract shape" do
    sign_in
    get "/api/v1/agency"

    expect(response).to have_http_status(:ok)
    body = response.parsed_body
    example = JSON.parse(Rails.root.join("contracts/examples/account/agency.json").read)

    expect(body.keys).to eq(example.keys)
    expect(body).to include(
      "name" => "Harbor Surrogacy", "slug" => "harbor",
      "timezone" => "America/Los_Angeles", "qualified_milestone" => "consult_attended"
    )
  end

  it "updates the qualified definition and saves immediately" do
    sign_in
    patch "/api/v1/agency", params: { qualified_milestone: "records" }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["qualified_milestone"]).to eq("records")
    expect(agency.reload.qualified_milestone).to eq("records")
  end

  it "updates the time zone" do
    sign_in
    patch "/api/v1/agency", params: { timezone: "America/Chicago" }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["timezone"]).to eq("America/Chicago")
    expect(agency.reload.timezone).to eq("America/Chicago")
  end

  it "rejects an invalid milestone" do
    sign_in
    # The contract closes the milestone enum, so this deliberately invalid payload opts out
    # of request validation; the 422 response is documented.
    patch "/api/v1/agency", params: { qualified_milestone: "vibes" },
         headers: headers.merge("X-Simbe-Contract-Probe" => "1"), as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_agency")
    expect(agency.reload.qualified_milestone).to eq("consult_attended")
  end

  it "forbids coordinators on update" do
    sign_in(coordinator)

    patch "/api/v1/agency", params: { qualified_milestone: "records" }, headers: headers, as: :json
    expect(response).to have_http_status(:forbidden)
  end
end
