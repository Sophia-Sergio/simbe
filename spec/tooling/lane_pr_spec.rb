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
    expect(sandbox.gh_calls).to include(a_string_matching(/^pr merge \S+ --auto --squash$/))
    # The repo deletes merged branches itself; --delete-branch makes gh switch the local worktree onto main and breaks the next PR.
    expect(sandbox.gh_calls.grep(/^pr merge/)).to all(satisfy { |c| !c.include?("--delete-branch") })
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

  it "refuses while the lane is still running or fixing" do
    %w[running fixing].each do |phase|
      sandbox.lane("state", "set", "F-WEEK", "phase=#{phase}")
      res = pr
      expect(res).not_to be_success
      expect(res.err).to include("phase")
    end
    expect(sandbox.gh_calls.grep(/^pr create/)).to be_empty
  end

  it "refuses to run from outside the lane's worktree" do
    res = sandbox.lane("pr", "--lane", "F-WEEK", chdir: sandbox.root)
    expect(res).not_to be_success
    expect(res.err).to include("worktree")
    expect(sandbox.gh_calls.grep(/^pr create/)).to be_empty
  end

  it "stops on a corrupt or malformed state file before it publishes anything" do
    [ "{not json", "[]" ].each do |body|
      File.write(sandbox.state_path, body)
      res = pr
      expect(res).not_to be_success
      expect(res.err).to include("state file")
    end
    expect(sandbox.gh_calls.grep(/^pr create|^api/)).to be_empty
    expect(sandbox.git("ls-remote", "origin", "refs/heads/#{branch}")).to eq("")
  end

  it "does not open a second PR for a lane whose PR already merged" do
    sandbox.stub_gh("^pr list --head \\S+ --state merged", out: '[{"url": "https://gh/pull/9"}]')
    res = pr
    expect(res).not_to be_success
    expect(res.err).to include("already merged")
    expect(sandbox.gh_calls.grep(/^pr create/)).to be_empty
  end

  it "refuses to force-push over commits it has not seen, even after a fetch" do
    pr
    existing_pr
    sandbox.foreign_push(branch)
    sandbox.git("fetch", "-q", "origin", chdir: wt) # `bin/lane rebase` and `start` always fetch
    foreign = remote_head
    sandbox.git("commit", "--amend", "-qm", "feat: task 1 (reworded)", chdir: wt)
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    res = pr
    expect(res).not_to be_success
    expect(remote_head).to eq(foreign)
  end

  it "refuses to refresh a published branch when no published head is recorded" do
    pr
    existing_pr
    sandbox.write_state({})
    sandbox.git("commit", "--amend", "-qm", "feat: task 1 (reworded)", chdir: wt)
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    res = pr
    expect(res).not_to be_success
    expect(res.err).to include("published head")
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
