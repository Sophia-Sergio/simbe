# The one tool registry shared by the in-app agent (Agent::TurnRunner) and the MCP server
# (spec 2013, decision 1). Each tool is a small class with a `DEFINITION` and
# `.call(input, ctx)`, where `ctx = { agency:, user: }`. **No tool accepts an agency id** —
# the agency is the signed-in/key's agency, and every result is aggregates, first names,
# queue counts and verdicts only (docs/conventions/sensitive-data.md).
#
# The registry contract (consumed by lane B-MCP; names are frozen):
#   Agent::Tools::NAMES
#   Agent::Tools.definitions(role:)
#   Agent::Tools.mcp_definitions
#   Agent::Tools.call(name, input, agency:, user:)
#   Agent::Tools::Error
module Agent
  module Tools
    Error = Class.new(StandardError)

    NAMES = %w[get_funnel get_channel_performance get_dropoff_reasons get_next_actions].freeze

    # owner -> all four; coordinator -> only their own next actions (spec decision 1).
    ROLES = {
      "owner" => NAMES,
      "coordinator" => %w[get_next_actions]
    }.freeze

    REGISTRY = {
      "get_funnel" => GetFunnel,
      "get_channel_performance" => GetChannelPerformance,
      "get_dropoff_reasons" => GetDropoffReasons,
      "get_next_actions" => GetNextActions
    }.freeze

    # -> Array of Anthropic tool hashes { name:, description:, input_schema: }, only the
    # tools the role may call.
    def self.definitions(role:)
      allowed = ROLES.fetch(role.to_s, [])
      NAMES.select { |name| allowed.include?(name) }.map { |name| REGISTRY.fetch(name)::DEFINITION }
    end

    # -> the same four in MCP shape { name:, description:, inputSchema: }.
    def self.mcp_definitions
      NAMES.map do |name|
        definition = REGISTRY.fetch(name)::DEFINITION
        { name: definition[:name], description: definition[:description], inputSchema: definition[:input_schema] }
      end
    end

    # Dispatches one tool call for the signed-in agency/user. Raises Error for an unknown
    # tool, a tool the role may not call, or malformed input (all three become a tool_result
    # `is_error` in the turn loop, never a 500).
    def self.call(name, input, agency:, user:)
      tool = REGISTRY[name.to_s]
      raise Error, "unknown_tool: #{name}" if tool.nil?

      role = user.role.to_s
      raise Error, "tool_not_allowed: #{name} is not available to #{role}" unless ROLES.fetch(role, []).include?(name.to_s)

      args = validate!(tool::DEFINITION[:input_schema], input)
      Current.agency = agency
      tool.call(args, { agency: agency, user: user })
    end

    # Tiny schema validator (required/enum/integer bounds). Unknown keys are ignored — a
    # model may add noise, and that is not a malformed call. Keys normalize to symbols.
    def self.validate!(schema, input)
      input = (input || {}).to_h.transform_keys(&:to_s)
      properties = schema.fetch(:properties, {})

      Array(schema[:required]).each do |key|
        value = input[key.to_s]
        raise Error, "bad_input: #{key} is required" if value.nil? || value == ""
      end

      result = {}
      properties.each do |key, spec|
        next unless input.key?(key.to_s)

        result[key] = coerce(spec, key, input[key.to_s])
      end
      properties.each { |key, spec| result[key] = spec[:default] if !result.key?(key) && spec.key?(:default) }
      result
    end

    def self.coerce(spec, key, value)
      case spec[:type]
      when "integer"
        unless value.is_a?(Integer) || value.is_a?(String) && value.match?(/\A-?\d+\z/)
          raise Error, "bad_input: #{key} must be an integer"
        end

        number = value.to_i
        raise Error, "bad_input: #{key} must be >= #{spec[:minimum]}" if spec.key?(:minimum) && number < spec[:minimum]
        raise Error, "bad_input: #{key} must be <= #{spec[:maximum]}" if spec.key?(:maximum) && number > spec[:maximum]

        number
      when "string"
        raise Error, "bad_input: #{key} must be a string" unless value.is_a?(String)
        raise Error, "bad_input: #{key} must be one of #{spec[:enum].join(', ')}" if spec[:enum] && !spec[:enum].include?(value)

        value
      when "array"
        raise Error, "bad_input: #{key} must be an array" unless value.is_a?(Array)

        value
      else
        value
      end
    end
  end
end
