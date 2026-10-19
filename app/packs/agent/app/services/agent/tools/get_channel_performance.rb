module Agent
  module Tools
    # Per-channel leads, qualified count and qualified rate for a range. With a
    # `channel` it returns that channel's KPIs and campaign breakdown; without one it returns
    # every channel row plus the headline insights.
    class GetChannelPerformance
      DEFINITION = {
        name: "get_channel_performance",
        description: "Performance by marketing channel for a time range: leads, qualified leads, " \
                     "and qualified rate. Pass a channel to get its campaign breakdown.",
        input_schema: {
          type: "object",
          properties: {
            range: { type: "string", enum: %w[30d 90d 12m], default: "30d" },
            channel: { type: "string", description: "Optional channel name, e.g. Facebook." }
          }
        }
      }.freeze

      def self.call(input, ctx)
        range = input[:range] || "30d"
        channel = input[:channel].presence
        return Metrics::Channels.call(agency: ctx[:agency], range: range) if channel.nil?

        Metrics::ChannelDetail.call(agency: ctx[:agency], range: range, channel: channel)
      rescue ActiveRecord::RecordNotFound
        { error: "unknown_channel", message: "No leads were tagged #{channel.inspect} in this range." }
      end
    end
  end
end
