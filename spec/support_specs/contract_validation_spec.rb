require "rails_helper"

# The contract is enforced in both directions for /api/v1: an undocumented route fails (strict
# unknown-request handling) and so does a request that violates a documented operation.
RSpec.describe "contract validation", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }

  it "fails a request whose body violates the documented operation" do
    expect { post "/api/v1/session", params: { email: 5 }, headers: headers, as: :json }
      .to raise_error(OpenapiFirst::RequestInvalidError)
  end

  it "fails an undocumented /api/v1 route" do
    expect { get "/api/v1/not-in-the-contract", headers: headers }.to raise_error(OpenapiFirst::NotFoundError)
  end

  it "lets the one explicit probe header through (spa_spec's unknown-API check)" do
    get "/api/v1/not-in-the-contract", headers: headers.merge("X-Simbe-Contract-Probe" => "1")
    expect(response).to have_http_status(:not_found)
  end
end
