require "rails_helper"

RSpec.describe "SPA shell", type: :request do
  it "serves the shell for client routes with the Vite entrypoint" do
    %w[/ /pipeline /channels/Facebook /coordinators/Dana%20Ortiz /signin /invite/abc].each do |path|
      get path
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('<div id="root">')
      expect(response.body).to include("/vite-test/assets/application")
      expect(response.headers["Cache-Control"]).to include("no-cache")
    end
  end

  it "serves the shell for deep links whose first segment merely starts like a reserved prefix, and for dotted names" do
    [ "/updates", "/upcoming/week", "/coordinators/Dana%20O.", "/leads/a.b" ].each do |path|
      get path
      expect(response).to have_http_status(:ok), "#{path} -> #{response.status}"
      expect(response.body).to include('<div id="root">')
    end
  end

  it "answers 404 for missing static files instead of the shell" do
    get "/missing.js"
    expect(response).to have_http_status(:not_found)
    expect(response.body).not_to include('<div id="root">')
  end

  it "answers the JSON 404 for the bare /api prefix too" do
    get "/api"
    expect(response).to have_http_status(:not_found)
    expect(response.parsed_body.dig("error", "code")).to eq("not_found")
  end

  it "does not swallow the API: unknown /api paths are JSON 404s" do
    get "/api/v1/nope", headers: { "Accept" => "text/html" }
    expect(response).to have_http_status(:not_found)
    expect(response.parsed_body.dig("error", "code")).to eq("not_found")
  end

  it "leaves health, assets and the MCP prefix alone" do
    get "/up"
    expect(response).to have_http_status(:ok)
    get "/vite-test/assets/missing.js"
    expect(response).to have_http_status(:not_found)
    expect(response.body).not_to include('<div id="root">')
    get "/mcp/harbor"
    expect(response.body).not_to include('<div id="root">')
  end
end
