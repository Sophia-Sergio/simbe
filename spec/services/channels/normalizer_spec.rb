require "rails_helper"
RSpec.describe Channels::Normalizer do
  {
    "facebook" => "Facebook", "fb" => "Facebook", "Facebook" => "Facebook", " FB " => "Facebook",
    "instagram" => "Instagram", "ig" => "Instagram", "google" => "Google", "Google" => "Google",
    "tiktok" => "TikTok", "referral" => "Referral", "" => "Unknown", nil => "Unknown"
  }.each do |raw, expected|
    it "maps #{raw.inspect} to #{expected}" do
      expect(described_class.call(raw)).to eq([ expected, true ])
    end
  end
  it "titleizes unknown sources and flags them" do
    expect(described_class.call("podcast")).to eq([ "Podcast", false ])
  end
end
