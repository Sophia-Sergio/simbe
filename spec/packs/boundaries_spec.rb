require "rails_helper"
require "rake"
require "tmpdir"

RSpec.describe "boundaries:check" do
  before(:all) { load Rails.root.join("lib/tasks/boundaries.rake") }

  def violations_for(files, allow: [])
    Dir.mktmpdir do |root|
      files.each do |path, body|
        full = File.join(root, path)
        FileUtils.mkdir_p(File.dirname(full))
        File.write(full, body)
      end
      Boundaries.check(root: root, allowed_edges: allow)
    end
  end

  it "passes on the repository as it is" do
    expect(Boundaries.check(root: Rails.root.to_s)).to eq([])
  end

  it "allows unscoped only in the snapshot services" do
    bad = violations_for({ "app/packs/leads/app/services/x.rb" => "Lead.unscoped.count\n" })
    ok = violations_for({ "app/packs/ingest/app/services/snapshot/replace.rb" => "Lead.unscoped.delete_all\n" })
    expect(bad.map(&:first)).to eq([ "app/packs/leads/app/services/x.rb:1" ])
    expect(ok).to eq([])
  end

  it "allows Anthropic::Client only in the Ai::Client wrapper" do
    bad = violations_for({ "app/packs/metrics/app/services/x.rb" => "Anthropic::Client.new\n" })
    ok = violations_for({ "app/packs/agent/app/services/ai/client.rb" => "Anthropic::Client.new\n" })
    expect(bad.size).to eq(1)
    expect(ok).to eq([])
  end

  it "keeps fetch, native dialogs and raw hex colors inside their allowed files" do
    files = {
      "app/javascript/features/week/Week.tsx" => "fetch('/x')\nwindow.confirm('sure?')\nconst c = '#ff8dac'\n",
      "app/javascript/api/client.ts" => "export const go = () => fetch('/api')\n",
      "app/javascript/api/client.test.ts" => "fetch('/api')\n",
      "app/javascript/components/shared/ChannelTile.tsx" => "const c = '#1877f2'\n"
    }
    expect(violations_for(files).map(&:first)).to eq(%w[
      app/javascript/features/week/Week.tsx:1
      app/javascript/features/week/Week.tsx:2
      app/javascript/features/week/Week.tsx:3
    ])
  end

  it "flags a pack that reaches into another pack's models unless the edge is allowlisted" do
    files = {
      "app/packs/leads/app/models/lead.rb" => "class Lead; end\n",
      "app/packs/metrics/app/services/summary.rb" => "Lead.count\n"
    }
    expect(violations_for(files).map(&:first)).to eq([ "app/packs/metrics/app/services/summary.rb:1" ])
    expect(violations_for(files, allow: [ "metrics->leads" ])).to eq([])
  end

  it "ignores references inside comments and a pack's own models" do
    files = {
      "app/packs/leads/app/models/lead.rb" => "class Lead; end\n",
      "app/packs/leads/app/services/own.rb" => "Lead.count\n",
      "app/packs/metrics/app/services/summary.rb" => "# Lead is read through Leads::Queues\n"
    }
    expect(violations_for(files)).to eq([])
  end
end
