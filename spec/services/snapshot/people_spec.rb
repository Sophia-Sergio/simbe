require "rails_helper"

RSpec.describe Snapshot::People do
  describe ".key_for" do
    it "lower-cases and trims an email" do
      expect(described_class.key_for("  Mixed.Case@Example.COM ")).to eq("mixed.case@example.com")
    end

    it "is nil for a blank or missing email" do
      expect(described_class.key_for("   ")).to be_nil
      expect(described_class.key_for(nil)).to be_nil
    end
  end
end
