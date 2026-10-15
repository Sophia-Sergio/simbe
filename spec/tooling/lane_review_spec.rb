# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane review" do
  let(:sandbox) { LaneSandbox.new }
  let(:file) { "app/javascript/features/week/Week.tsx" }

  before { sandbox.start_lane("F-WEEK") }

  after { sandbox.cleanup }

  def review = sandbox.lane("review", "F-WEEK")

  it "does not mistake a `pending` prop or the word in prose for a skipped test" do
    sandbox.commit_in("F-WEEK", file: file, content: "export const B = ({ pending }: { pending?: boolean }) => <button disabled={pending}>pending</button>\n")
    expect(review.out).not_to include("skipped/focused test")
  end

  it "does not flag a test title that merely ends with the word pending" do
    sandbox.commit_in("F-WEEK", file: file, content: "it(\"disables both buttons while pending\", () => {})\nit('is pending', () => {})\n")
    expect(review.out).not_to include("skipped/focused test")
  end

  it "still flags real skipped, focused and pending tests" do
    [ "it.skip('x', () => {})", "xit('x', () => {})", "describe.only('x', () => {})", "test.skip('x', () => {})", "  pending 'not yet'", "  pending('not yet')", "  skip 'later'" ].each do |line|
      sandbox.commit_in("F-WEEK", file: file, content: "#{line}\n", message: "feat: #{line}")
      out = review.out
      expect(out).to include("skipped/focused test"), "#{line} was not flagged"
      expect(review.exitstatus).to eq(1)
    end
  end
end
