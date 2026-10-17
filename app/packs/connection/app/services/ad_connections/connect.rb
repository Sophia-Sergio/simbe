# Honest stub for ad-platform connections (spec decision 4): no OAuth and no tokens, just a
# row per connected platform. The first connect asks the metrics pack for sample spend so the
# UI has numbers; the sample generator is a no-op when the agency has no leads.
module AdConnections
  class Connect
    PLATFORMS = %w[meta google].freeze

    class InvalidPlatform < StandardError; end

    def self.call(agency:, platform:)
      new(agency:, platform:).call
    end

    def initialize(agency:, platform:)
      @agency = agency
      @platform = platform.to_s
    end

    # Returns [connection, created?]; a repeated connect is idempotent (200, no new sample run).
    # Concurrent connects (a double click) are resolved by the (agency_id, platform) unique
    # index: the loser re-reads the winner's row and answers 200 instead of a 500.
    def call
      raise InvalidPlatform unless PLATFORMS.include?(@platform)

      existing = @agency.ad_connections.find_by(platform: @platform)
      return [ existing, false ] if existing

      connection = @agency.ad_connections.new(platform: @platform, status: "connected", connected_at: Time.current)
      connection.save!
      RefreshSampleSpend.call(agency: @agency)
      [ connection, true ]
    rescue ActiveRecord::RecordNotUnique
      existing = @agency.ad_connections.find_by(platform: @platform)
      raise unless existing

      [ existing, false ]
    end
  end

  # Kept behind one guard so this pack never hard-depends on B-METRICS: the constant simply
  # is not defined until that lane merges.
  class RefreshSampleSpend
    def self.call(agency:)
      Spend::SampleGenerator.call(agency: agency) if defined?(Spend::SampleGenerator)
    end
  end
end
