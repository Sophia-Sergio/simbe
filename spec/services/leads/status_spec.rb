require "rails_helper"

RSpec.describe Leads::Status do
  it "labels a queued lead by its queue" do
    expect(described_class.call(outcome: "open", queue: "text_back_now")).to eq(key: "text_back_now", label: "Text back now", tone: "danger")
    expect(described_class.call(outcome: "open", queue: "nudge_applications")).to eq(key: "nudge", label: "Nudge", tone: "warning")
    expect(described_class.call(outcome: "open", queue: "rebook_consults")).to eq(key: "rebook", label: "Rebook", tone: "warning")
    expect(described_class.call(outcome: "paused", queue: "paused_due_back")).to eq(key: "due_back", label: "Due back", tone: "neutral")
  end

  it "labels a closed, paused or accepted lead by its outcome" do
    expect(described_class.call(outcome: "accepted")).to eq(key: "accepted", label: "Accepted", tone: "success")
    expect(described_class.call(outcome: "paused")).to eq(key: "paused", label: "Paused", tone: "neutral")
    expect(described_class.call(outcome: "not_eligible")).to eq(key: "not_eligible", label: "Not eligible", tone: "neutral")
    expect(described_class.call(outcome: "withdrew")).to eq(key: "withdrew", label: "Withdrew", tone: "neutral")
    expect(described_class.call(outcome: "unresponsive")).to eq(key: "unresponsive", label: "Unresponsive", tone: "danger")
  end

  it "labels a queued lead by its queue even when it is paused" do
    # paused_due_back beats the paused outcome (the lead needs action right now).
    expect(described_class.call(outcome: "paused", queue: "paused_due_back")[:key]).to eq("due_back")
  end

  it "is on track for an open lead that is not queued" do
    expect(described_class.call(outcome: "open")).to eq(key: "on_track", label: "On track", tone: "success")
  end
end
