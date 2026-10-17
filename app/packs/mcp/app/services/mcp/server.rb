# The MCP JSON-RPC 2.0 server (spec 2013, decision 7), Streamable HTTP without SSE. The
# controller parses the request body and this builds the response envelope. Tool calls go through
# the one shared registry (Agent::Tools) with the key's agency, so an MCP client can only ever
# see that agency's data — and no tool accepts an agency id.
#
# Malformed envelopes never raise: a non-object body is -32600, a non-object `params`/`arguments`
# is -32602, and the request id is always echoed back.
module Mcp
  class Server
    PROTOCOL_VERSION = "2025-03-26"
    SERVER_INFO = { name: "simbe", version: "1.0.0" }.freeze

    # The JSON-RPC response Hash, or nil for a notification (the controller answers 202).
    def self.call(body, agency:)
      new(body, agency: agency).call
    end

    def initialize(body, agency:)
      @body = body
      @agency = agency
    end

    def call
      return error(nil, -32600, "Invalid Request: body must be a JSON object") unless @body.is_a?(Hash)

      # A `notifications/*` method has no response; the controller answers HTTP 202 empty.
      return nil if notification?

      id = @body["id"]
      method = @body["method"]
      return error(id, -32600, "Invalid Request: method must be a string") unless method.is_a?(String)

      params = @body["params"]
      return error(id, -32602, "Invalid params: expected an object") unless params.nil? || params.is_a?(Hash)

      case method
      when "initialize"
        result(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
      when "ping" then result(id, {})
      when "tools/list" then result(id, { tools: Agent::Tools.mcp_definitions })
      when "tools/call" then tool_call(id, params || {})
      else error(id, -32601, "Method not found")
      end
    end

    private

    def notification? = @body["method"].to_s.start_with?("notifications/")

    # A tool error is a *result* with `isError: true` (the model/tool contract), never a JSON-RPC
    # error: an unknown tool, bad input or a disallowed tool must not look like a protocol failure.
    # A malformed `arguments` (not an object) is a protocol error, -32602.
    def tool_call(id, params)
      arguments = params["arguments"] || {}
      return error(id, -32602, "Invalid params: arguments must be an object") unless arguments.is_a?(Hash)

      data = Agent::Tools.call(params["name"], arguments, agency: @agency, user: owner_for(@agency))
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
