require "rails_helper"
require "tmpdir"

# A downstream lane adds app/packs/<pack>/config/routes/*.rb with a plain DSL body. Those files
# are instance_eval'd by config/routes.rb and ignored by Zeitwerk (config/application.rb), so a
# plain route file must not break eager load.
RSpec.describe "pack route files and eager load" do
  def with_pack_route(body)
    path = Rails.root.join("app/packs/identity/config/routes/zz_probe.rb").to_s
    File.write(path, body)
    yield(path)
  ensure
    File.delete(path) if File.exist?(path)
    Rails.application.reload_routes!
  end

  it "does not eager-load a plain pack route file" do
    with_pack_route("get \"probe\", to: proc { [ 200, {}, [ \"ok\" ] ] }\n") do
      expect { Rails.application.eager_load! }.not_to raise_error
      Rails.application.reload_routes!
      expect(Rails.application.routes.recognize_path("/api/v1/probe", method: :get)).to be_present
    end
  end
end
