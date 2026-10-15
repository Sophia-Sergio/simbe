# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane ci and rebase" do
  let(:sandbox) { LaneSandbox.new }
  let(:wt) { sandbox.worktree("F-WEEK") }
  let(:file) { "app/javascript/features/week/week.ts" }

  after { sandbox.cleanup }

  describe "ci" do
    it "prints the checks command on --dry-run, even before the lane starts, without calling GitHub" do
      res = sandbox.lane("ci", "F-WEEK", "--dry-run")
      expect(res).to be_success
      expect(res.out).to include("gh pr checks")
      expect(sandbox.gh_calls).to be_empty
    end

    context "with a started lane" do
      before { sandbox.start_lane("F-WEEK") }

      def open_pr = sandbox.stub_gh("^pr list --head \\S+ --state open", out: '[{"number": 9, "url": "https://gh/pull/9"}]')

      it "exits 2 when the lane has no PR" do
        expect(sandbox.lane("ci", "F-WEEK").exitstatus).to eq(2)
      end

      it "records merged when the PR has already merged" do
        sandbox.stub_gh("^pr list --head \\S+ --state merged", out: '[{"url": "https://gh/pull/9"}]')
        expect(sandbox.lane("ci", "F-WEEK")).to be_success
        expect(sandbox.state.dig("lanes", "F-WEEK", "phase")).to eq("merged")
      end

      it "exits 0 when the checks are green" do
        open_pr
        sandbox.stub_gh("^pr checks", out: "claude-review\tpass\n")
        expect(sandbox.lane("ci", "F-WEEK")).to be_success
      end

      it "reads the failing runs of the PR head only, not of earlier heads" do
        head = sandbox.git("rev-parse", "HEAD", chdir: wt)
        open_pr
        sandbox.stub_gh("^pr checks", out: "Backend tests\tfail\n", exit_code: 1)
        sandbox.stub_gh("^run list .*--commit #{head}", out: JSON.generate([ { "databaseId" => 50, "name" => "Backend tests", "conclusion" => "failure" } ]), priority: 0)
        sandbox.stub_gh("^run list", out: JSON.generate([ { "databaseId" => 41, "name" => "Stale job from an older head", "conclusion" => "failure" } ]))
        sandbox.stub_gh("^run view 50 --log-failed", out: "current failure\n")
        sandbox.stub_gh("^run view 41 --log-failed", out: "stale failure\n")
        res = sandbox.lane("ci", "F-WEEK")
        expect(res.exitstatus).to eq(1)
        expect(res.out).to include("current failure")
        expect(res.out).not_to include("stale")
      end

      it "reports a gh error (rate limit, auth) as exit 4 with gh's message, not as red CI" do
        open_pr
        sandbox.stub_gh("^pr checks", out: "", err: "HTTP 403: API rate limit exceeded", exit_code: 1)
        res = sandbox.lane("ci", "F-WEEK")
        expect(res.exitstatus).to eq(4)
        expect(res.out + res.err).to include("rate limit")
        expect(res.out).not_to include("claude-review")
      end

      it "exits 1 and prints only the failing jobs' logs when a check is red" do
        open_pr
        sandbox.stub_gh("^pr checks", out: "Backend tests\tfail\n", exit_code: 1)
        sandbox.stub_gh("^run list", out: JSON.generate([
          { "databaseId" => 42, "name" => "Backend tests", "conclusion" => "failure" },
          { "databaseId" => 43, "name" => "Lint backend", "conclusion" => "success" }
        ]))
        sandbox.stub_gh("^run view 42 --log-failed", out: "expected 3, got 4\n")
        res = sandbox.lane("ci", "F-WEEK")
        expect(res.exitstatus).to eq(1)
        expect(res.out).to include("Backend tests", "expected 3, got 4")
        expect(sandbox.gh_calls.grep(/^run view 43/)).to be_empty
      end
    end
  end

  describe "rebase" do
    before do
      sandbox.start_lane("F-WEEK")
      sandbox.commit_in("F-WEEK", file: file, content: "lane\n")
    end

    it "rebases onto the new origin/main and prints a range-diff" do
      sandbox.commit_on_main(file: "README.md", content: "main moved\n")
      res = sandbox.lane("rebase", "F-WEEK")
      expect(res).to be_success, res.err + res.out
      expect(sandbox.git("merge-base", "--is-ancestor", "origin/main", "HEAD", chdir: wt)).to eq("")
      expect(res.out).not_to be_empty
    end

    it "aborts on a conflict and leaves the worktree as it was" do
      before_head = sandbox.git("rev-parse", "HEAD", chdir: wt)
      sandbox.commit_on_main(file: file, content: "main\n")
      res = sandbox.lane("rebase", "F-WEEK")
      expect(res.exitstatus).to eq(1)
      expect(res.out).to include(file)
      expect(sandbox.git("rev-parse", "HEAD", chdir: wt)).to eq(before_head)
      expect(sandbox.git("status", chdir: wt)).not_to include("rebase in progress")
    end

    it "refuses to rebase a dirty worktree" do
      File.write(File.join(wt, file), "uncommitted\n")
      expect(sandbox.lane("rebase", "F-WEEK")).not_to be_success
    end
  end
end
