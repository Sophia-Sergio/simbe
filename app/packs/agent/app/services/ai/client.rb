# The only place the app touches Anthropic (spec 2013, decision 6; `boundaries:check`
# forbids `Anthropic::Client` anywhere else). Wraps one messages call, normalizes the reply
# to plain string-keyed hashes and records the usage on the required ledger *before*
# parsing, so a call can never go unrecorded. Models come from `config/ai_models.yml`,
# overridable with `AI_MODEL_<TASK>`.
module Ai
  class Client
    TIMEOUT = 45

    # Raised at client boot when ANTHROPIC_API_KEY is missing outside the test environment,
    # so a misconfigured deploy fails loudly instead of sending an unauthenticated request.
    ConfigurationError = Class.new(StandardError)

    # The canned answer the Playwright real-stack journeys replay (W3-2 Task 4): the model must be
    # deterministic there, and the fixture mirrors the contract's agent example so the UI assertions
    # (chart, "Open channels" action, follow-ups) are stable. It deliberately ignores the role and
    # the question — one canned reply for every turn — and is only reachable in development
    # (`e2e_stubbed?`); `Agent::ResponseSanitizer` still drops a route the role may not use.
    E2E_ANSWER_PATH = "spec/fixtures/agent/e2e_answer.json"

    attr_reader :model

    def self.config
      @config ||= YAML.load_file(Rails.root.join("config/ai_models.yml"), aliases: true)
                      .fetch(Rails.env.to_s) { {} }
    end

    # True when the e2e run asked the app to answer without calling Anthropic. Scoped to
    # development: the real-stack e2e server runs there (locally and in CI), while specs (test) and a
    # deployed app (production) keep the real provider even if the ENV leaks.
    def self.e2e_stubbed?
      Rails.env.development? && ENV["E2E_STUB_ANTHROPIC"] == "1"
    end

    # The canned reply, shaped exactly like `#converse`'s return value. Every caller gets a deep
    # copy, so one turn mutating the hash (or a nested block) can never corrupt the next.
    def self.e2e_response
      @e2e_response ||= begin
        payload = JSON.parse(Rails.root.join(E2E_ANSWER_PATH).read)
        {
          content: payload.fetch("content"),
          stop_reason: payload.fetch("stop_reason"),
          usage: {
            input_tokens: payload.dig("usage", "input_tokens").to_i,
            output_tokens: payload.dig("usage", "output_tokens").to_i
          }
        }
      end
      @e2e_response.deep_dup
    end

    # The real key everywhere; the test environment falls back to a placeholder so specs
    # never need a real key. Anywhere else a blank key raises at boot of the client.
    def self.api_key
      return "e2e-stub" if e2e_stubbed?

      ENV["ANTHROPIC_API_KEY"].presence ||
        ("test" if Rails.env.test?) ||
        raise(ConfigurationError, "ANTHROPIC_API_KEY is not set")
    end

    def initialize(task)
      @task = task.to_s
      @model = ENV["AI_MODEL_#{@task.upcase}"] || self.class.config.fetch(@task)
      @api_key = self.class.api_key
    end

    # -> { content: [Hash blocks with string keys], stop_reason: String, usage: { input_tokens:, output_tokens: } }
    def converse(messages:, system:, tools: [], max_tokens: 1024, ledger:, timeout: TIMEOUT)
      raise ArgumentError, "ledger: is required (every call must be recorded)" if ledger.nil?

      # The e2e stub still records usage (no path skips the ledger) and returns before the provider.
      if self.class.e2e_stubbed?
        response = self.class.e2e_response
        ledger.record!(model: @model, usage: response[:usage])
        return response
      end

      http = Anthropic::Client.new(api_key: @api_key, timeout: timeout)
      params = { model: @model, max_tokens: max_tokens, system: system, messages: messages }
      params[:tools] = tools if tools.any?
      response = http.messages.create(**params)

      usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
      ledger.record!(model: @model, usage: usage) # before parsing: never skipped
      {
        content: response.content.map { |block| JSON.parse(block.to_json) },
        stop_reason: response.stop_reason.to_s,
        usage: usage
      }
    rescue Anthropic::Errors::Error, Timeout::Error
      # A failed attempt is still recorded (zero tokens, nil cost) before re-raising, so the
      # ledger accounts for every call to the provider, not just the successful ones.
      ledger.record_failure!(model: @model)
      raise
    end
  end
end
