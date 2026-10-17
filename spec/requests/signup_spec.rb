require "rails_helper"

# One owner spec per HTTP path (docs/conventions/testing.md): POST /api/v1/signup.
RSpec.describe "Signup", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:payload) do
    { user: { name: "Erin Walsh", email: "erin@new.test", password: "long-enough-pass" },
      agency: { name: "New Agency!", timezone: "America/Denver", qualified_milestone: "records" } }
  end

  it "creates the agency and owner and signs in" do
    post "/api/v1/signup", params: payload, headers: headers, as: :json

    expect(response).to have_http_status(:created)
    expect(response.parsed_body.dig("agency", "slug")).to eq("new-agency")
    expect(response.parsed_body.dig("user", "role")).to eq("owner")
    expect(response.cookies["simbe_session"]).to be_present

    get "/api/v1/me"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.dig("user", "email")).to eq("erin@new.test")
  end

  it "suffixes duplicate slugs and survives junk names" do
    create(:agency, slug: "harbor")

    post "/api/v1/signup", params: payload.deep_merge(agency: { name: "Harbor" }), headers: headers, as: :json
    expect(response.parsed_body.dig("agency", "slug")).to eq("harbor-2")

    post "/api/v1/signup",
         params: payload.deep_merge(user: { email: "b@new.test" }, agency: { name: "!!!" }),
         headers: headers, as: :json
    expect(response.parsed_body.dig("agency", "slug")).to match(/\Aagency-[a-z0-9]{6}\z/)
  end

  it "rejects a taken email" do
    create(:user, email: "erin@new.test")

    post "/api/v1/signup", params: payload, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("email_taken")
  end

  # The contract closes `password` to >= 10 chars and `timezone` to the four offered zones, so
  # these deliberately invalid payloads opt out of request validation (the 422 is documented).
  def post_invalid(payload)
    post "/api/v1/signup", params: payload,
         headers: headers.merge("X-Simbe-Contract-Probe" => "1"), as: :json
  end

  it "rejects a weak password" do
    post_invalid(payload.deep_merge(user: { email: "c@new.test", password: "short" }))

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("weak_password")
  end

  it "rejects an unsupported time zone" do
    post_invalid(payload.deep_merge(user: { email: "d@new.test" }, agency: { timezone: "Mars/Base" }))

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_agency")
  end

  it "creates nothing when validation fails (transactional)" do
    expect do
      post_invalid(payload.deep_merge(agency: { timezone: "Mars/Base" }))
    end.not_to change(Agency, :count)

    expect(User.count).to eq(0)
  end

  it "creates one agency when the button is double-submitted" do
    expect do
      2.times { post "/api/v1/signup", params: payload, headers: headers, as: :json }
    end.to change(Agency, :count).by(1)

    expect(response.parsed_body.dig("error", "code")).to eq("email_taken")
  end

  # Rack::Attack runs before Rails. Exercised on the middleware itself with a stub app:
  # the 429 is a throttle response, not one of the documented statuses of POST /signup.
  it "throttles a burst of signups from one IP" do
    previous_enabled = Rack::Attack.enabled
    previous_store = Rack::Attack.cache.store
    Rack::Attack.enabled = true
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    Rack::Attack.cache.store.clear

    attack = Rack::Attack.new(->(_env) { [ 201, {}, [] ] })
    env = Rack::MockRequest.env_for("/api/v1/signup", method: "POST", "REMOTE_ADDR" => "198.51.100.7")

    10.times { expect(attack.call(env.dup).first).to eq(201) }
    expect(attack.call(env.dup).first).to eq(429)
  ensure
    Rack::Attack.cache.store = previous_store
    Rack::Attack.enabled = previous_enabled
  end
end
