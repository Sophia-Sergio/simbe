# The MCP JSON-RPC 2.0 server (spec 2013, decision 7), Streamable HTTP without SSE. The
# controller parses the request body and this builds the response envelope. Tool calls go through
# the one shared registry (Agent::Tools) with the key's agency, so an MCP client can only ever
# see that agency's data — and no tool accepts an agency id.
module Mcp
  class Server
    PROTOCOL_VERSION = "2025-03-26"
    SERVER_INFO = { name: "simbe", version: "1.0.0" }.freeze

    # The JSON-RPC response Hash, or nil for a notification (the controller answers 202).
    def self.call(body, agency:)
      new(body, agency: agency).call
    end

    def initialize(body, agency:)
      @body = body.is_a?(Hash) ? body : {}
      @agency = agency
    end

    def call
      return nil if notification?

      id = @body["id"]
      case @body["method"].to_s
      when "initialize"
        result(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
      when "ping" then result(id, {})
      when "tools/list" then result(id, { tools: Agent::Tools.mcp_definitions })
      when "tools/call" then tool_call(id)
      else error(id, -32601, "Method not found")
      end
    end

    private

    # `notifications/initialized` (and any future notification) has no response; the controller
    # answers HTTP 202 with an empty body.
    def notification? = @body["method"].to_s.start_with?("notifications/")

    # A tool error is a *result* with `isError: true` (the model/tool contract), never a JSON-RPC
    # error: an unknown tool, bad input or a disallowed tool must not look like a protocol failure.
    def tool_call(id)
      name = @body.dig("params", "name")
      arguments = @body.dig("params", "arguments") || {}
      data = Agent::Tools.call(name, arguments, agency: @agency, user: owner_for(@agency))
      result(id, { content: [ { type: "text", text: JSON.generate(data) } ], isError: false })
    rescue Agent::Tools::Error => e
      result(id, { content: [ { type: "text", text: e.message } ], isError: true })
    end

    # MCP keys are created by an owner; the tools are the owner's five (spec decision 1).
    def owner_for(agency)
      agency.users.find_by(role: "owner") || agency.users.first
    end

    def result(id, value) = { "jsonrpc" => "2.0", "id" => id, "result" => value }

    def error(id, code, message) = { "jsonrpc" => "2.0", "id" => id, "error" => { "code" => code, "message" => message } }
  end
end
