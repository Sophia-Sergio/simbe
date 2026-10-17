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

    attr_reader :model

    def self.config
      @config ||= YAML.load_file(Rails.root.join("config/ai_models.yml"), aliases: true)
                      .fetch(Rails.env.to_s) { {} }
    end

    # The real key everywhere; the test environment falls back to a placeholder so specs
    # never need a real key. Anywhere else a blank key raises at boot of the client.
    def self.api_key
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
