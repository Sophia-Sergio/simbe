# frozen_string_literal: true

require "spec_helper"
require "json"

RSpec.describe "opencode.json lane agent" do
  let(:bash) { JSON.parse(File.read(File.expand_path("../../opencode.json", __dir__))).dig("agent", "lane", "permission", "bash") }

  # Same rule as OpenCode: patterns are globs ("*" = anything), the last matching entry decides.
  def decision(command)
    bash.select { |pattern, _| command.match?(/\A#{Regexp.escape(pattern).gsub('\\*', '.*')}\z/) }.values.last
  end

  it "denies by default" do
    expect(bash["*"]).to eq("deny")
  end

  it "allows the read-only commands the gated run prompt itself needs" do
    [ "git rev-parse --show-toplevel", "git branch --show-current", "pwd", "which docker" ].each do |cmd|
      expect(decision(cmd)).to eq("allow"), "#{cmd} is #{decision(cmd).inspect}"
    end
  end

  it "still allows local commits and still denies everything that publishes or destroys" do
    expect(decision("git commit -m x")).to eq("allow")
    [ "git push origin lane/x", "git remote add evil https://example.com/x.git", "gh pr list", "fly deploy", "sudo ls", "rm -rf x" ].each do |cmd|
      expect(decision(cmd)).to eq("deny"), "#{cmd} is #{decision(cmd).inspect}"
    end
  end
end
