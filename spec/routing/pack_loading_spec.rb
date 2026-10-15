require "rails_helper"

RSpec.describe "pack route loading" do
  def status_of(path)
    # X-Simbe-Contract-Probe opts this deliberate undocumented-route probe out of the global
    # OpenAPI request validation (spec/support/contract.rb).
    Rails.application.call(Rack::MockRequest.env_for(path, "HTTP_X_SIMBE_CONTRACT_PROBE" => "1")).first
  end

  def with_probe(path, body)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, body)
    Rails.application.reload_routes!
    yield
  ensure
    File.delete(path) if File.exist?(path)
    Rails.application.reload_routes!
  end

  it "loads app/packs/*/config/routes/*.rb under /api/v1" do
    path = Rails.root.join("app/packs/identity/config/routes/zz_probe.rb").to_s
    with_probe(path, "get \"probe\", to: proc { [200, {}, [\"ok\"]] }\n") do
      expect(status_of("/api/v1/probe")).to eq(200)
    end
  end

  it "loads app/packs/*/config/routes_root/*.rb outside /api/v1" do
    path = Rails.root.join("app/packs/mcp/config/routes_root/zz_probe.rb").to_s
    with_probe(path, "get \"probe_root\", to: proc { [200, {}, [\"ok\"]] }\n") do
      expect(status_of("/probe_root")).to eq(200)
      expect(status_of("/api/v1/probe_root")).to eq(404)
    end
  end
end
