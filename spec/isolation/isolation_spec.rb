require "rails_helper"

RSpec.describe "Agency isolation", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let!(:alpha_owner) { create(:user, password: "secret-pass-1") }
  let!(:beta) { create(:agency) }

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  it "/me never reveals another agency" do
    sign_in(alpha_owner)
    get "/api/v1/me"
    expect(response.parsed_body.dig("agency", "id")).to eq(alpha_owner.agency_id)
    expect(response.body).not_to include(beta.id)
  end

  it "covers every routed /api/v1 resource (registry must list each route)" do
    routed = Rails.application.routes.routes.filter_map do |route|
      path = route.path.spec.to_s.sub("(.:format)", "")
      next unless path.start_with?("/api/v1/")

      [ route.verb.to_s.downcase, path ]
    end.uniq
    listed = Isolation::REGISTRY.map { |entry| [ entry.method.to_s, entry.path ] }
    missing = routed.reject { |pair| listed.include?(pair) }
    expect(missing).to be_empty, "Register isolation entries for: #{missing.map { |verb, path| "#{verb.upcase} #{path}" }.join(', ')}"
  end

  it "answers 404 for another agency's resource on every registered tenant route" do
    sign_in(alpha_owner)
    Isolation::REGISTRY.select { |entry| entry.scope == :tenant }.each do |entry|
      resource = entry.resource.call(beta)
      public_send(entry.method.to_s.downcase, entry.path_for.call(resource), headers: headers)
      expect(response).to have_http_status(:not_found), "#{entry.method.to_s.upcase} #{entry.path} leaked agency B's resource"
    end
  end

  it "refuses a tenant route registered without a way to prove isolation" do
    expect { Isolation.register(method: :get, path: "/api/v1/x/:id") }.to raise_error(ArgumentError, /resource:/)
  end

  # W0-3 owns only `session` (POST :public, DELETE :self) and `me` (GET :self). Neither takes
  # another agency's resource id, so they are exempt from the "agency isolated" shared example
  # (spec/support/shared_examples/agency_isolated.rb); `/me` proves it returns only the
  # signed-in agency above. Downstream lanes use the shared example for id-taking tenant routes.
end
