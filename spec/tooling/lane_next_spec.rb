# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane next" do
  let(:sandbox) { LaneSandbox.new }

  after { sandbox.cleanup }

  def next_ids(*args)
    res = sandbox.lane("next", "--json", *args)
    raise "bin/lane next failed: #{res.err}" unless res.success?

    JSON.parse(res.out)
  end

  def merged_pr(lane_id) = { "headRefName" => "lane/#{lane_id}-x", "state" => "MERGED", "url" => "https://gh/#{lane_id}", "isDraft" => false }

  def merged_on_github(*ids) = sandbox.stub_gh("^pr list --state all", out: JSON.generate(ids.map { |id| merged_pr(id) }))

  describe "--assume-merged (offline what-if)" do
    it "offers only W0-1 when nothing is merged" do
      expect(next_ids("--assume-merged", "")).to eq([ "W0-1" ])
    end

    it "offers the three lanes W0-1 unblocks, critical path first (W0-3 also waits for W0-7)" do
      expect(next_ids("--assume-merged", "W0-1")).to eq(%w[W0-4A W0-2 W0-7])
    end

    it "adds the five backend lanes once W0-3 is merged" do
      expect(next_ids("--assume-merged", "W0-1,W0-7,W0-3")).to include("B-INGEST", "B-METRICS", "B-LEADS", "B-ACTIONS", "B-ACCOUNT")
    end

    it "never offers a lane before its prerequisites" do
      expect(next_ids("--assume-merged", "W0-1,W0-7,W0-3")).not_to include("B-AGENT", "B-MCP", "F-WEEK")
    end

    it "honours --limit" do
      expect(next_ids("--assume-merged", "W0-1,W0-7,W0-3", "--limit", "2").size).to eq(2)
    end

    it "does not call GitHub" do
      next_ids("--assume-merged", "W0-1")
      expect(sandbox.gh_calls).to be_empty
    end

    it "rejects an unknown lane id" do
      expect(sandbox.lane("next", "--assume-merged", "W9-9")).not_to be_success
    end
  end

  describe "live (GitHub + state)" do
    before { merged_on_github("W0-1", "W0-7", "W0-3") }

    it "uses the merged PRs on GitHub" do
      sandbox.write_state("caps" => { "max_running" => 20 }) # the default cap of 4 would cut the 8 ready lanes
      expect(next_ids).to include("W0-2", "B-LEADS")
    end

    it "skips a lane that already has a worktree" do
      sandbox.start_lane("W0-2")
      expect(next_ids).not_to include("W0-2")
    end

    it "starts nothing while a ccr PR is open, and says why" do
      sandbox.stub_gh("^pr list --state open --label ccr", out: '[{"number": 7}]')
      res = sandbox.lane("next", "--json")
      expect(JSON.parse(res.out)).to eq([])
      expect(res.err).to include("ccr")
    end

    it "starts nothing when max_waiting lanes wait for review" do
      sandbox.write_state("lanes" => %w[W0-2 W0-4A W0-7 B-LEADS].to_h { |id| [ id, { "phase" => "ready" } ] })
      expect(next_ids).to eq([])
    end

    it "fills only the free running slots and skips lanes the state marks as started" do
      sandbox.write_state("caps" => { "max_running" => 3 }, "lanes" => { "W0-2" => { "phase" => "running" } })
      ids = next_ids
      expect(ids.size).to eq(2)
      expect(ids).not_to include("W0-2")
    end

    it "stops offering Docker lanes at max_stacks but still offers frontend lanes" do
      substrate = %w[W0-1 W0-2 W0-3 W0-4A W0-4B W0-5 W0-6A W0-6B]
      sandbox.stub_gh("^pr list --state all", out: JSON.generate(substrate.map { |id| merged_pr(id) }), priority: 0)
      sandbox.write_state("caps" => { "max_stacks" => 0, "max_running" => 20 })
      ids = next_ids
      expect(ids.size).to eq(13)
      expect(ids).to all(start_with("F-"))
    end
  end
end
