require "rails_helper"

# One owner spec for the invitation paths: POST /invitations, DELETE /invitations/:id,
# GET /invitations/:token/preview and POST /invitations/:token/accept
# (docs/conventions/testing.md). GET /team and GET /coordinator_names live in team_spec.
RSpec.describe "Invitations", type: :request do
  include ActiveSupport::Testing::TimeHelpers
  include ActiveJob::TestHelper

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

    # The mail goes out through a job: plain arguments, so the AgencyScoped record is never
    # looked up outside a tenant context.
    expect { perform_enqueued_jobs }.to change { ActionMailer::Base.deliveries.size }.by(1)
    mail = ActionMailer::Base.deliveries.last
    expect(mail.to).to eq([ "maya@alpha.test" ])
    expect(mail.body.encoded).to include(token)

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

  it "enqueues the invitation mail without the raw token in the job arguments" do
    sign_in
    invite
    token = response.parsed_body["accept_url"].split("/").last
    job = ActiveJob::Base.queue_adapter.enqueued_jobs.last

    expect(job[:job]).to eq(Signup::InvitationDeliveryJob)
    expect(job[:args].to_s).not_to include(token)
    expect(Signup::InvitationDeliveryJob.log_arguments).to be(false)
  end

  it "never writes the raw token from an invitation path to the log" do
    sign_in
    invite
    token = response.parsed_body["accept_url"].split("/").last

    output = StringIO.new
    previous_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(output)

    begin
      get "/api/v1/invitations/#{token}/preview"
      expect(response).to have_http_status(:ok)
      expect(output.string).not_to include(token)
      expect(output.string).to include("/api/v1/invitations/[FILTERED]/preview")

      # Production logs one structured line through lograge; its `path` goes through the
      # same scrubber.
      if defined?(Lograge)
        structured = Lograge.before_format({ path: "/api/v1/invitations/#{token}/accept" }, {})
        expect(structured[:path]).not_to include(token)
      end
    ensure
      Rails.logger = previous_logger
    end
  end

  it "maps a unique violation while accepting to email_taken instead of a 500" do
    sign_in
    invite
    token = response.parsed_body["accept_url"].split("/").last
    delete "/api/v1/session", headers: headers

    # A concurrent accept, or a signup with the same email racing the accept, raises the
    # database unique violation rather than a validation error.
    allow(User).to receive(:create!).and_raise(ActiveRecord::RecordNotUnique.new("duplicate key"))

    post "/api/v1/invitations/#{token}/accept",
         params: { name: "Maya Chen", password: "long-enough-pass" }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("email_taken")
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
