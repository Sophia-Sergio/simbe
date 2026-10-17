module Channels
  module Normalizer
    MAP = { "facebook" => "Facebook", "fb" => "Facebook", "instagram" => "Instagram", "ig" => "Instagram",
            "google" => "Google", "tiktok" => "TikTok", "referral" => "Referral" }.freeze
    CHANNELS = (MAP.values.uniq + [ "Unknown" ]).freeze
    def self.call(raw)
      key = raw.to_s.strip.downcase
      return [ "Unknown", true ] if key.empty?
      MAP.key?(key) ? [ MAP[key], true ] : [ key.titleize, false ]
    end
  end
end
