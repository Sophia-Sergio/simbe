# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane state" do
  let(:sandbox) { LaneSandbox.new }

  after { sandbox.cleanup }

  it "records lane fields and shows them" do
    expect(sandbox.lane("state", "set", "F-WEEK", "phase=running", "session=abc")).to be_success
    expect(JSON.parse(sandbox.lane("state", "show", "F-WEEK").out)).to include("phase" => "running", "session" => "abc")
  end

  it "stores the canonical lane id whatever the case typed" do
    sandbox.lane("state", "set", "f-week", "phase=queued")
    expect(sandbox.state["lanes"].keys).to eq([ "F-WEEK" ])
  end

  it "rejects an unknown phase, key or lane without writing anything" do
    expect(sandbox.lane("state", "set", "F-WEEK", "phase=bogus")).not_to be_success
    expect(sandbox.lane("state", "set", "F-WEEK", "colour=red")).not_to be_success
    expect(sandbox.lane("state", "set", "NOPE", "phase=queued")).not_to be_success
    expect(File.exist?(sandbox.state_path)).to be(false)
  end

  it "stores round counters as integers" do
    sandbox.lane("state", "set", "B-LEADS", "fix_rounds=2")
    expect(sandbox.state.dig("lanes", "B-LEADS", "fix_rounds")).to eq(2)
  end

  it "starts from the default caps and lets them change" do
    expect(JSON.parse(sandbox.lane("state", "show").out)["caps"]).to eq("max_running" => 4, "max_stacks" => 5, "max_waiting" => 4)
    sandbox.lane("state", "set-caps", "max_running=2")
    expect(sandbox.state.dig("caps", "max_running")).to eq(2)
    expect(sandbox.lane("state", "set-caps", "max_cats=1")).not_to be_success
  end

  it "stores one model per tier" do
    sandbox.lane("state", "set-models", "top=p/strong", "cheap=p/small")
    expect(sandbox.state["models"]).to eq("top" => "p/strong", "cheap" => "p/small")
    expect(sandbox.lane("state", "set-models", "huge=p/x")).not_to be_success
  end

  it "keeps every update when many processes write the state at once" do
    ids = %w[W0-1 W0-2 W0-3 W0-4A W0-4B W0-5 W0-6A W0-6B W0-7 B-INGEST B-METRICS B-LEADS]
    results = ids.map { |id| Thread.new { sandbox.lane("state", "set", id, "phase=queued") } }.map(&:value)
    expect(results.map(&:exitstatus)).to all(eq(0))
    expect(sandbox.state["lanes"].keys).to match_array(ids)
  end

  it "names the state file and writes nothing for a state file of the wrong shape" do
    [ "[]", '{"lanes": []}', '{"caps": null}', '{"caps": {"max_running": "four"}}' ].each do |body|
      File.write(sandbox.state_path, body)
      res = sandbox.lane("state", "set", "F-WEEK", "phase=queued")
      expect(res).not_to be_success
      expect(res.err).to include("state file"), "#{body}: #{res.err}"
      expect(res.err).not_to include("Traceback")
      expect(File.read(sandbox.state_path)).to eq(body)
    end
  end

  it "refuses to touch a corrupt state file" do
    File.write(sandbox.state_path, "{not json")
    res = sandbox.lane("state", "set", "F-WEEK", "phase=queued")
    expect(res).not_to be_success
    expect(res.err).to include("state file")
    expect(File.read(sandbox.state_path)).to eq("{not json")
  end
end
