# WebMock stubs for Anthropic (docs/conventions/testing.md — specs never hit the network).
# `stub_anthropic(*responses)` queues canned messages bodies; the builders shape one
# `/v1/messages` reply. Included into every example.
module AnthropicStub
  URL = "https://api.anthropic.com/v1/messages".freeze

  def stub_anthropic(*responses)
    seq = responses.map { |r| { status: 200, headers: { "Content-Type" => "application/json" }, body: r.to_json } }
    stub_request(:post, URL).to_return(*seq)
  end

  def anthropic_message(content:, stop_reason: "end_turn", input: 100, output: 50, model: "claude-sonnet-5-5")
    { id: "msg_#{SecureRandom.hex(4)}", type: "message", role: "assistant", model: model, content: content,
      stop_reason: stop_reason, stop_sequence: nil, usage: { input_tokens: input, output_tokens: output } }
  end

  def text_block(t) = { type: "text", text: t }
  def tool_use(name, input, id: "toolu_#{SecureRandom.hex(4)}") = { type: "tool_use", id: id, name: name, input: input }
end

RSpec.configure { |c| c.include AnthropicStub }
