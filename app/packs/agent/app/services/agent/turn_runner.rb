# The bounded tool-calling loop (spec 2013, decision 2). One turn:
#   1. persist the user message, build the model messages from the last 10 stored messages
#      plus the new text (assistant tool blocks included, never split from their results);
#   2. call the model; dispatch every non-`respond` tool_use through Agent::Tools (an
#      unknown tool or bad input becomes an `is_error` tool_result and the loop continues);
#   3. finish when the model calls `respond` (sanitized), when it returns plain text, or
#      after MAX_ROUNDS with a safe message;
#   4. persist one assistant message with the structured body and the turn transcript.
# A provider failure raises Error("model_unavailable") and the `ensure` releases the turn
# lock, so no half-written assistant message and no dangling tool_use is ever stored.
module Agent
  class TurnRunner
    MAX_ROUNDS = 6
    HISTORY_LIMIT = 10
    # A turn lock older than this is treated as abandoned (a killed Puma mid-turn must not
    # leave the conversation answering 409 forever); the controller clears it atomically.
    STALE_LOCK_AFTER = 90
    # One overall deadline across all rounds, not 45s per call × 6 rounds: a call can never
    # run past the deadline and the loop re-checks between rounds.
    DEADLINE = 40
    FALLBACK = "I couldn't finish that — try a simpler question."
    Error = Class.new(StandardError)

    # The model must finish by calling this (spec decision 2). It is added to the tool list
    # on every turn, on top of the role's registry tools.
    RESPOND_DEFINITION = {
      name: "respond",
      description: "Give the final answer to the user. Always finish with this.",
      input_schema: {
        type: "object",
        required: [ "text" ],
        properties: {
          text: { type: "string", maxLength: 1200 },
          chart: {
            type: "object",
            required: %w[title bars],
            properties: {
              title: { type: "string" },
              bars: {
                type: "array",
                maxItems: 8,
                items: {
                  type: "object",
                  required: %w[label value display],
                  properties: { label: { type: "string" }, value: { type: "number" }, display: { type: "string" } }
                }
              }
            }
          },
          action: {
            type: "object",
            required: %w[label route],
            properties: { label: { type: "string" }, route: { type: "string" } }
          },
          sources: {
            type: "array",
            items: {
              type: "object",
              required: %w[label route],
              properties: { label: { type: "string" }, route: { type: "string" } }
            }
          },
          suggestions: { type: "array", items: { type: "string" }, maxItems: 3 }
        }
      }
    }.freeze

    def self.call(conversation:, text:)
      new(conversation: conversation, text: text).call
    end

    def initialize(conversation:, text:)
      @conversation = conversation
      @text = text.to_s
    end

    def call
      Current.agency = @conversation.agency
      @user = @conversation.user
      @history = history_messages
      persist_user_message
      body = run_loop
      persist_assistant_message(body)
    rescue Anthropic::Errors::Error, Timeout::Error => e
      raise Error, "model_unavailable: #{e.class}"
    ensure
      release_lock
    end

    private

    def run_loop
      messages = @history + [ { "role" => "user", "content" => @text } ]
      @appended = []
      tools = Agent::Tools.definitions(role: @user.role) + [ RESPOND_DEFINITION ]
      rounds = 0
      deadline = monotonic + DEADLINE

      loop do
        rounds += 1
        raise Error, "model_unavailable: turn deadline exceeded" if monotonic >= deadline

        reply = client.converse(messages: messages, system: system_prompt, tools: tools, ledger: ledger,
                                timeout: [ deadline - monotonic, 1 ].max)
        # A truncated reply (max_tokens) may hold an empty or partial `respond`; never store a
        # 201 with empty text — surface it as the contract's model_unavailable error instead.
        raise Error, "model_unavailable: response truncated" if reply[:stop_reason] == "max_tokens"

        blocks = reply[:content]

        respond = blocks.find { |block| block["type"] == "tool_use" && block["name"] == "respond" }
        if respond
          body = Agent::ResponseSanitizer.call(respond["input"], role: @user.role)
          @appended << assistant_text(body["text"])
          return body
        end

        tool_uses = blocks.select { |block| block["type"] == "tool_use" }
        if tool_uses.empty?
          @appended << { "role" => "assistant", "content" => blocks }
          return { "text" => Agent::ResponseSanitizer.truncate(text_of(blocks)) }
        end

        break if rounds >= MAX_ROUNDS

        append(messages, blocks, tool_uses)
      end

      @appended << assistant_text(FALLBACK)
      { "text" => FALLBACK }
    end

    def append(messages, blocks, tool_uses)
      assistant = { "role" => "assistant", "content" => blocks }
      results = { "role" => "user", "content" => tool_uses.map { |block| tool_result(block) } }
      messages << assistant << results
      @appended << assistant << results
    end

    # A tool_result block; an unknown tool / bad input / disallowed tool is `is_error`, so
    # the loop continues instead of raising a 500 (review focus). Any other error inside a
    # tool (a data bug, a missing snapshot) is caught too — the loop keeps going and the lock
    # is still released.
    def tool_result(block)
      result = Agent::Tools.call(block["name"], block["input"], agency: @conversation.agency, user: @user)
      { "type" => "tool_result", "tool_use_id" => block["id"], "content" => JSON.generate(result), "is_error" => false }
    rescue Agent::Tools::Error => e
      error_result(block, e.message)
    rescue StandardError => e
      error_result(block, "tool_error: #{e.class}")
    end

    def error_result(block, message)
      { "type" => "tool_result", "tool_use_id" => block["id"], "content" => message, "is_error" => true }
    end

    # The last 10 stored messages' API content, flattened. A leading assistant message (whose
    # user prompt fell outside the window) is dropped so the history always starts with `user`;
    # each stored assistant turn is self-contained, so a tool_use is never split from its result.
    def history_messages
      rows = messages.order(:created_at).to_a.last(HISTORY_LIMIT)
      messages = rows.flat_map { |row| Array(row.api_content) }
      messages.shift while messages.any? && messages.first["role"] != "user"
      messages
    end

    def persist_user_message
      messages.create!(
        role: "user", body: { "text" => @text }, api_content: [ { "role" => "user", "content" => @text } ]
      )
    end

    def persist_assistant_message(body)
      messages.create!(role: "assistant", body: body, api_content: @appended)
    end

    # Query through `conversation_id`: AgentConversation's `has_many :agent_messages` infers
    # `agent_conversation_id` (the column is `conversation_id`), so the services address the
    # messages directly. AgentMessage's own default_scope still pins them to Current.agency.
    def messages
      AgentMessage.where(conversation_id: @conversation.id)
    end

    # Stored as plain text, never as a trailing tool_use without a result (review focus).
    def assistant_text(text)
      { "role" => "assistant", "content" => [ { "type" => "text", "text" => text } ] }
    end

    def text_of(blocks)
      blocks.select { |block| block["type"] == "text" }.map { |block| block["text"] }.join("\n").strip
    end

    def system_prompt
      Agent::SystemPrompt.call(agency: @conversation.agency, user: @user, as_of: as_of)
    end

    def as_of
      Leads::Queues.latest_as_of(@conversation.agency) || Time.current
    end

    def monotonic
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def client
      @client ||= Ai::Client.new(:agent)
    end

    def ledger
      @ledger ||= Ai::Ledger.new(agency: @conversation.agency, user: @user, task: "agent", conversation: @conversation)
    end

    def release_lock
      @conversation.update_columns(turn_started_at: nil)
    rescue ActiveRecord::ActiveRecordError
      nil
    end
  end
end
