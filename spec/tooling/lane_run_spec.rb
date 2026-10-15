# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane run" do
  let(:sandbox) { LaneSandbox.new }

  before { sandbox.start_lane("F-WEEK") }

  after { sandbox.cleanup }

  def record = sandbox.state.dig("lanes", "F-WEEK")

  it "records running, then verifying with the session id from the event log" do
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m")
    expect(res).to be_success, res.err + res.out
    expect(record).to include("phase" => "verifying", "session" => "ses_fake123", "model" => "p/m")
    expect(File.exist?(record["log"])).to be(true)
  end

  it "uses the lane's tier model from the state when no --model is given" do
    sandbox.lane("state", "set-models", "mid=p/mid", "cheap=p/cheap")
    sandbox.start_lane("F-SEARCH")
    sandbox.lane("run", "F-WEEK")
    sandbox.lane("run", "F-SEARCH")
    expect(record["model"]).to eq("p/mid")
    expect(sandbox.state.dig("lanes", "F-SEARCH", "model")).to eq("p/cheap")
  end

  it "refuses to run without any model" do
    res = sandbox.lane("run", "F-WEEK")
    expect(res).not_to be_success
    expect(res.err).to include("--model")
  end

  it "sends the findings instead of the lane prompt on a fix round, keeping the gated-run rules" do
    findings = File.join(sandbox.root, "..", "findings.md")
    args = File.join(sandbox.root, "..", "args.txt")
    File.write(findings, "Fix: spec/x_spec.rb expects 3, got 4")
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", "--session", "ses_1", "--prompt-file", findings, env: { "FAKE_OPENCODE_ARGS" => args })
    expect(res).to be_success, res.err + res.out
    sent = File.read(args)
    expect(sent).to include("ses_1", "Fix: spec/x_spec.rb expects 3, got 4", "GATED RUN RULES", "edit tool")
    expect(sent).not_to include("Implement `@")
  end

  it "starts OpenCode with stdin closed even when the caller's stdin is an open pipe (otherwise it waits for EOF forever)" do
    seen = File.join(sandbox.root, "..", "stdin.txt")
    cmd = [ "python3", File.join(sandbox.root, "bin/lane"), "run", "F-WEEK", "--model", "p/m" ]
    Open3.popen3(sandbox.env_for("FAKE_OPENCODE_STDIN" => seen), *cmd, chdir: sandbox.root) do |stdin, out, err, wait|
      out.read
      err.read
      wait.value # the caller's stdin is deliberately left open until here
      stdin.close
    end
    expect(File.read(seen).strip).to eq("/dev/null")
  end

  it "still reports the tripwire (exit 3) when the state file was corrupted during the run" do
    env = { "FAKE_OPENCODE_TOUCH" => File.join(sandbox.root, "escaped.txt"), "FAKE_OPENCODE_CORRUPT" => sandbox.state_path }
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", env: env)
    expect(res.exitstatus).to eq(3)
    expect(res.out).to include("TRIPWIRE")
  end

  it "still exits 4 on a timeout when the state file was corrupted during the run" do
    env = { "FAKE_OPENCODE_SLEEP" => "5", "FAKE_OPENCODE_CORRUPT" => sandbox.state_path }
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", "--timeout", "0.02", env: env)
    expect(res.exitstatus).to eq(4)
    expect(res.out).to include("timed out")
  end

  it "exits 5 when OpenCode itself fails, and keeps the lane reviewable" do
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", env: { "FAKE_OPENCODE_EXIT" => "7" })
    expect(res.exitstatus).to eq(5)
    expect(res.out).to include("exited 7")
    expect(record["phase"]).to eq("verifying")
  end

  it "refuses --prompt-file without --session (the findings alone would start a context-free session)" do
    findings = File.join(sandbox.root, "..", "f2.md")
    File.write(findings, "x")
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", "--prompt-file", findings)
    expect(res).not_to be_success
    expect(res.err).to include("--session")
  end

  it "writes no state on --dry-run" do
    sandbox.lane("run", "F-WEEK", "--model", "p/m", "--dry-run")
    expect(File.exist?(sandbox.state_path)).to be(false)
  end

  it "keeps the lane reviewable when OpenCode times out" do
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", "--timeout", "0.02", env: { "FAKE_OPENCODE_SLEEP" => "5" })
    expect(res.exitstatus).to eq(4)
    expect(res.out).to include("timed out")
    expect(record).to include("phase" => "verifying", "session" => "ses_fake123")
  end

  it "blocks the lane when the main checkout changes during the run" do
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", env: { "FAKE_OPENCODE_TOUCH" => File.join(sandbox.root, "escaped.txt") })
    expect(res.exitstatus).to eq(3)
    expect(record["phase"]).to eq("blocked")
    expect(record["blocked_reason"]).to include("main checkout")
  end
end
