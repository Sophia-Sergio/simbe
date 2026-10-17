# MCP JSON-RPC endpoint (spec 2013, decision 7): POST /mcp/:slug with `Authorization: Bearer
# <key>`. There is no cookie auth and no CSRF header — the key *is* the credential, it belongs to
# exactly one agency, and the path slug must match that agency. GET is a 405 (the route is
# POST-only; the SPA catch-all already excludes /mcp).
class McpController < ActionController::API
  # Chunked bodies without Content-Length are re-checked for size before parsing.
  MAX_BODY_BYTES = 1.megabyte

  def handle
    token = bearer_token
    # path_parameters, never `params`: reading `params` would make Rails parse the JSON body
    # first, so malformed JSON could never reach our own parser (it must answer -32700).
    key = Mcp::Keys.authenticate(token, slug: request.path_parameters[:slug])
    if key.nil?
      # 404 only when a valid key (with a live owner creator) is used against another agency's
      # slug; an unknown/revoked key or an invalid actor is 401.
      active = Mcp::Keys.active_key(token)
      return render_unauthorized if active.nil? || Mcp::Keys.actor_for(active).nil?

      return render_not_found
    end

    Current.agency = key.agency
    # 1 MB cap and a JSON content type before reading/parsing the body (chunked requests without
    # Content-Length are caught again by the byte-size check below).
    return render_jsonrpc_error(nil, -32600, "Invalid Request: body too large", :content_too_large) if request.content_length.to_i > MAX_BODY_BYTES
    return render_jsonrpc_error(nil, -32600, "Invalid Request: expected application/json", :unsupported_media_type) unless request.media_type == "application/json"

    raw = request.raw_post
    return render_jsonrpc_error(nil, -32600, "Invalid Request: body too large", :content_too_large) if raw.bytesize > MAX_BODY_BYTES

    body = JSON.parse(raw)
    return render_jsonrpc_error(nil, -32600, "Invalid Request: batch is not supported") if body.is_a?(Array)
    return render_jsonrpc_error(nil, -32600, "Invalid Request: body must be a JSON object") unless body.is_a?(Hash)

    # authenticate already proved `created_by` is a live owner of the key's agency.
    response = Mcp::Server.call(body, agency: key.agency, user: key.created_by)
    return head :accepted if response.nil?

    render json: response
  rescue JSON::ParserError
    render_jsonrpc_error(nil, -32700, "Parse error")
  ensure
    Current.reset
  end

  def method_not_allowed
    render json: { error: { code: "method_not_allowed", message: "Use POST for the MCP endpoint" } },
           status: :method_not_allowed
  end

  private

  def bearer_token
    request.headers["Authorization"].to_s[/\ABearer\s+(.+)\z/i, 1]
  end

  def render_unauthorized
    render json: { error: { code: "unauthorized", message: "Invalid or revoked MCP key" } }, status: :unauthorized
  end

  def render_not_found
    render json: { error: { code: "not_found", message: "Not found" } }, status: :not_found
  end

  def render_jsonrpc_error(id, code, message, status = :bad_request)
    render json: { jsonrpc: "2.0", id: id, error: { code: code, message: message } }, status: status
  end
end
