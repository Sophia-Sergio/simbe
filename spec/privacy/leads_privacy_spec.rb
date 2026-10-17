require "rails_helper"

# Screener answers and phone numbers are health data (docs/conventions/sensitive-data.md):
# the owner (and any coordinator not assigned to the lead) must never receive a raw answer or
# a full phone, and no answer may reach the logs.
RSpec.describe "Leads privacy", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  let!(:priya) { create(:user, :coordinator, agency: agency, coordinator_name: "Priya Shah") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
    Current.agency = agency
  end

  def lead(first_name) = Lead.find_by!(first_name: first_name)

  it "never sends a raw screener answer to the owner" do
    sign_in(owner)
    get "/api/v1/leads/#{lead('L4').external_id}", headers: headers
    items = response.parsed_body.dig("screener", "items")
    expect(items).not_to be_empty
    expect(items.none? { |item| item.key?("answer") }).to be(true)
    expect(response.body).not_to include("\"answer\"")
    expect(response.parsed_body.dig("contact", "phone")).to match(/\A•••-••••-\d{4}\z/)
    expect(response.parsed_body.dig("contact", "age")).to be_a(Integer)
  end

  it "sends raw answers and the full phone to the assigned coordinator" do
    sign_in(dana)
    get "/api/v1/leads/#{lead('L4').external_id}", headers: headers
    expect(response.parsed_body.dig("screener", "items")).to all(include("answer"))
    expect(response.parsed_body.dig("contact", "phone")).to eq(lead("L4").phone)
  end

  it "404s a coordinator who is not assigned to the lead" do
    sign_in(priya)
    get "/api/v1/leads/#{lead('L4').external_id}", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "never writes a raw screener answer to the log" do
    ScreenerAnswer.find_by!(lead: lead("L4"), question: "Do you smoke or use nicotine?").update!(answer: "SECRET-ANSWER-771")
    sign_in(dana)
    logs = capture_logs do
      get "/api/v1/leads/#{lead('L4').external_id}", headers: headers
      expect(response).to have_http_status(:ok)
    end
    expect(logs).not_to include("SECRET-ANSWER-771")
  end

  def capture_logs
    io = StringIO.new
    previous = Rails.logger
    previous_ar = ActiveRecord::Base.logger
    logger = ActiveSupport::TaggedLogging.new(Logger.new(io))
    Rails.logger = logger
    ActiveRecord::Base.logger = logger
    yield
    io.string
  ensure
    Rails.logger = previous
    ActiveRecord::Base.logger = previous_ar
  end
end
