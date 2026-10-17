# The required spend ledger (spec 2013, decision 6): every Anthropic call records one
# `ai_usage_events` row through `Ai::Client#converse(..., ledger:)` — no path skips it.
# The agency/user/conversation come from the ledger, the model and token counts from the
# response, and `cost_cents` from `config/ai_pricing.yml` (nil when the model has no
# confirmed entry — never guessed).
module Ai
  class Ledger
    PRICING_PATH = Rails.root.join("config/ai_pricing.yml")

    attr_reader :event_ids

    def initialize(agency:, user:, task:, conversation: nil)
      @agency = agency
      @user = user
      @task = task.to_s
      @conversation = conversation
      @event_ids = []
    end

    def record!(model:, usage:)
      event = AiUsageEvent.create!(
        agency: @agency, user: @user, conversation: @conversation, task: @task, model: model,
        input_tokens: tokens(usage, :input_tokens), output_tokens: tokens(usage, :output_tokens),
        cost_cents: cost_cents(model, usage)
      )
      @event_ids << event.id
      event
    end

    # { model => { "input_per_mtok_usd" =>, "output_per_mtok_usd" => } }, {} when the file is
    # empty (all entries commented out) or absent.
    def self.pricing
      @pricing ||= begin
        data = YAML.load_file(PRICING_PATH, aliases: true)
        data.is_a?(Hash) ? data : {}
      end
    end

    private

    def tokens(usage, key)
      usage[key] || usage[key.to_s]
    end

    def cost_cents(model, usage)
      price = self.class.pricing[model.to_s]
      return nil unless price.is_a?(Hash)

      input = tokens(usage, :input_tokens).to_i
      output = tokens(usage, :output_tokens).to_i
      dollars = (input * price.fetch("input_per_mtok_usd", 0).to_f +
                 output * price.fetch("output_per_mtok_usd", 0).to_f) / 1_000_000.0
      (dollars * 100).round
    end
  end
end
