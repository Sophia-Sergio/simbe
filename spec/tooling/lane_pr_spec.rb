# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane pr" do
  let(:sandbox) { LaneSandbox.new }
  let(:wt) { sandbox.worktree("F-WEEK") }
  let(:file) { "app/javascript/features/week/week.ts" }

  before do
    sandbox.start_lane("F-WEEK")
    sandbox.commit_in("F-WEEK", file: file)
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    sandbox.stub_gh("^pr create", out: "https://gh/pull/9\n")
  end

  after { sandbox.cleanup }

  def pr = sandbox.lane("pr", chdir: wt)
  def head = sandbox.git("rev-parse", "HEAD", chdir: wt)
  def branch = sandbox.git("branch", "--show-current", chdir: wt)
  def remote_head = sandbox.git("ls-remote", "origin", "refs/heads/#{branch}").split.first
  def existing_pr = sandbox.stub_gh("^pr list --head", out: '[{"number": 9, "url": "https://gh/pull/9"}]')

  it "opens one PR, posts claude-review on the reviewed head, enables auto-merge and records ci" do
    res = pr
    expect(res).to be_success, res.err + res.out
    expect(sandbox.gh_calls.grep(/^pr create/).size).to eq(1)
    expect(sandbox.gh_calls).to include(a_string_matching(%r{^api -X POST repos/me/simbe/statuses/#{head}}))
    expect(sandbox.gh_calls).to include(a_string_matching(/^pr merge \S+ --auto --squash/))
    expect(sandbox.state.dig("lanes", "F-WEEK")).to include("phase" => "ci", "pr" => "https://gh/pull/9", "head" => head)
  end

  it "updates the existing PR after an approved fix commit instead of opening a second one" do
    pr
    existing_pr
    sandbox.commit_in("F-WEEK", file: file, content: "fix\n", message: "fix: ci")
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    res = pr
    expect(res).to be_success, res.err + res.out
    expect(sandbox.gh_calls.grep(/^pr create/).size).to eq(1)
    expect(remote_head).to eq(head)
    expect(sandbox.gh_calls).to include(a_string_matching(%r{statuses/#{head}}))
  end

  it "publishes rewritten history (a rebase) with a lease-protected force push" do
    pr
    existing_pr
    sandbox.git("commit", "--amend", "-qm", "feat: task 1 (reworded)", chdir: wt)
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    res = pr
    expect(res).to be_success, res.err + res.out
    expect(remote_head).to eq(head)
  end

  it "refuses to publish a commit that was not approved" do
    pr
    existing_pr
    sandbox.commit_in("F-WEEK", file: file, content: "unreviewed\n", message: "fix: sneaky")
    res = pr
    expect(res).not_to be_success
    expect(res.err).to include("approval is for")
    expect(remote_head).not_to eq(head)
  end
end
