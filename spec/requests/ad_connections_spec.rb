require "rails_helper"

# One owner spec for GET/POST /ad_connections and DELETE /ad_connections/:platform.
# Spend::SampleGenerator ships with B-METRICS; this lane stubs the constant until it merges
# (lane plan override 4), then asserts the connect step asked it for sample spend.
RSpec.describe "Ad connections", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha") }
  let!(:owner) { create(:user, agency: agency, email: "owner@alpha.test") }
  let!(:coordinator) { create(:user, :coordinator, agency: agency, email: "dana@alpha.test") }
  let(:sample_generator) { double("Spend::SampleGenerator", call: true) }

  before do
    stub_const("Spend", Module.new) unless defined?(Spend)
    stub_const("Spend::SampleGenerator", sample_generator)
  end

  def sign_in(user = owner)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  def connect(platform:)
    post "/api/v1/ad_connections", params: { platform: platform }, headers: headers, as: :json
  end

  it "connects a platform, creates sample spend once and is idempotent" do
    sign_in

    connect(platform: "meta")
    expect(response).to have_http_status(:created)
    expect(response.parsed_body).to include("platform" => "meta", "status" => "connected")
    expect(response.parsed_body["connected_at"]).to be_present
    expect(sample_generator).to have_received(:call).with(agency: agency)

    connect(platform: "meta")
    expect(response).to have_http_status(:ok)
    expect(sample_generator).to have_received(:call).once
    expect(AdConnection.unscoped.where(agency_id: agency.id).count).to eq(1)
  end

  it "lists only the signed-in agency's connections" do
    sign_in
    connect(platform: "meta")
    connect(platform: "google")

    get "/api/v1/ad_connections"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["connections"].map { |row| row["platform"] }).to eq(%w[meta google])
    expect(response.parsed_body["connections"].map { |row| row.keys })
      .to all(eq(%w[platform status connected_at]))
  end

  it "rejects an unknown platform" do
    sign_in
    # The contract closes the platform enum; the 422 response is documented.
    post "/api/v1/ad_connections", params: { platform: "tiktok" },
         headers: headers.merge("X-Simbe-Contract-Probe" => "1"), as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_platform")
  end

  it "disconnects a platform idempotently" do
    sign_in
    connect(platform: "meta")

    delete "/api/v1/ad_connections/meta", headers: headers
    expect(response).to have_http_status(:no_content)

    get "/api/v1/ad_connections"
    expect(response.parsed_body["connections"]).to be_empty

    delete "/api/v1/ad_connections/meta", headers: headers
    expect(response).to have_http_status(:no_content)
  end

  it "forbids coordinators" do
    sign_in(coordinator)

    get "/api/v1/ad_connections"
    expect(response).to have_http_status(:forbidden)

    connect(platform: "meta")
    expect(response).to have_http_status(:forbidden)

    delete "/api/v1/ad_connections/meta", headers: headers
    expect(response).to have_http_status(:forbidden)
  end
end
