# Stand-in for the Agent::Tools registry (lane B-MCP override 1). B-MCP can run in parallel with
# B-AGENT, before the real registry exists. This defines the registry only when the real one is
# not loaded — `defined?(Agent::Tools)` is truthy once the pack's autoload is registered, so after
# B-AGENT merges this file is inert and every spec exercises the real registry.
unless defined?(Agent::Tools)
  module Agent
    module Tools
      Error = Class.new(StandardError)

      NAMES = %w[get_funnel get_channel_performance get_dropoff_reasons get_next_actions forecast_spend].freeze

      # MCP shape: the five tools, validated with the real contract's field names.
      def self.mcp_definitions
        NAMES.map { |name| { name: name, description: "#{name} (stand-in)", inputSchema: { type: "object", properties: {} } } }
      end

      # Canned Alpha-shaped data; raises Error for an unknown tool or bad input.
      def self.call(name, input, agency:, user:)
        raise Error, "unknown_tool: #{name}" unless NAMES.include?(name.to_s)

        case name.to_s
        when "get_funnel"
          range = (input || {}).to_h["range"]
          raise Error, "bad_input: range" if range && !%w[30d 90d 12m].include?(range)

          { range: range || "30d", stages: [ 10, 5, 4, 3, 2, 1 ].map { |count| { count: count } } }
        else
          { stub: name.to_s }
        end
      end
    end
  end
end
