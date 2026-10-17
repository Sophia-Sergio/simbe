# frozen_string_literal: true

require "spec_helper"
require "fileutils"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane watchdog" do
  let(:sandbox) { LaneSandbox.new }
  let(:ps_file) { File.join(sandbox.root, "..", "ps.txt") }

  before { sandbox.start_lane("F-WEEK") }

  after { sandbox.cleanup }

  def running(lane = "F-WEEK") = sandbox.write_state("lanes" => { lane => { "phase" => "running", "session" => "ses_abc" } })

  def log_quiet_for(minutes, lane = "F-WEEK")
    dir = File.join(sandbox.root, ".superpowers", "gate", lane)
    FileUtils.mkdir_p(dir)
    file = File.join(dir, "opencode.1.jsonl")
    File.write(file, "{}\n")
    stamp = Time.now - (minutes * 60)
    File.utime(stamp, stamp, file)
  end

  def watchdog(*args, ps: [])
    File.write(ps_file, ps.join("\n"))
    sandbox.lane("watchdog", *args, env: { "LANE_WATCHDOG_PS_FILE" => ps_file })
  end

  it "says nothing is wrong when no lane is running" do
    sandbox.write_state("lanes" => { "F-WEEK" => { "phase" => "merged" } })
    res = watchdog
    expect(res).to be_success
    expect(res.out).to include("no lane is in phase running")
  end

  it "is ok for a live run whose log moved recently" do
    running
    log_quiet_for(2)
    res = watchdog(ps: [ "python3 bin/lane run F-WEEK --model p/m" ])
    expect(res).to be_success
    expect(res.out).to match(/F-WEEK\s+ok/)
  end

  it "flags a live run whose log has been quiet longer than the threshold as STALLED (exit 7) with the resume command" do
    running
    log_quiet_for(40)
    res = watchdog(ps: [ "python3 bin/lane run F-WEEK --model p/m" ])
    expect(res.exitstatus).to eq(7)
    expect(res.out).to match(/F-WEEK\s+STALLED\s+log quiet 4\d(\.\d)? min/)
    expect(res.out).to include("bin/lane run F-WEEK --session ses_abc")
  end

  it "honours --minutes" do
    running
    log_quiet_for(10)
    expect(watchdog("--minutes", "30", ps: [ "python3 bin/lane run F-WEEK" ])).to be_success
    expect(watchdog("--minutes", "5", ps: [ "python3 bin/lane run F-WEEK" ]).exitstatus).to eq(7)
  end

  it "flags a lane in phase running with no live process as DEAD" do
    running
    log_quiet_for(1)
    res = watchdog(ps: [ "python3 bin/lane run F-SEARCH --model p/m", "vim notes.txt" ])
    expect(res.exitstatus).to eq(7)
    expect(res.out).to match(/F-WEEK\s+DEAD/)
  end

  it "does not mistake another lane's process for this one (F-WEEK vs F-WEEKLY)" do
    running
    log_quiet_for(1)
    res = watchdog(ps: [ "python3 bin/lane run F-WEEKLY --model p/m" ])
    expect(res.out).to match(/F-WEEK\s+DEAD/)
  end

  it "prints JSON" do
    running
    log_quiet_for(40)
    res = watchdog("--json", ps: [ "python3 bin/lane run F-WEEK" ])
    row = JSON.parse(res.out).first
    expect(row).to include("lane" => "F-WEEK", "verdict" => "STALLED", "session" => "ses_abc")
  end
end
