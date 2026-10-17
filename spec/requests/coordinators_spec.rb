require "rails_helper"

# One owner spec per HTTP path (docs/conventions/testing.md): GET /coordinators and
# GET /coordinators/:name. Conformance is on, exercising listCoordinators / getCoordinator.
RSpec.describe "Coordinators API", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended", timezone: "America/Los_Angeles") }
  let!(:owner) { create(:user, agency: agency, password: "secret-pass-1") }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz", password: "secret-pass-1") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    Current.reset
  end

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  it "returns the coordinator list fixture for the owner" do
    sign_in(owner)
    get "/api/v1/coordinators"
    expect(response).to have_http_status(:ok)

    example = JSON.parse(Rails.root.join("contracts/examples/coordinators/list.json").read)
    expect(response.parsed_body).to eq(example)
  end

  it "returns the coordinator detail fixture for the owner" do
    sign_in(owner)
    get "/api/v1/coordinators/Dana%20Ortiz"
    expect(response).to have_http_status(:ok)

    example = JSON.parse(Rails.root.join("contracts/examples/coordinators/detail-dana.json").read)
    expect(response.parsed_body).to eq(example)
  end

  it "403s a coordinator on both routes" do
    sign_in(dana)
    get "/api/v1/coordinators"
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/coordinators/Dana%20Ortiz"
    expect(response).to have_http_status(:forbidden)
  end

  it "404s an unknown coordinator for the owner" do
    sign_in(owner)
    get "/api/v1/coordinators/Nobody"
    expect(response).to have_http_status(:not_found)
  end
end
