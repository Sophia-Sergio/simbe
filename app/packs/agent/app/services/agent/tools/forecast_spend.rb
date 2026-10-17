module Agent
  module Tools
    # Turns a monthly budget into expected qualified leads using the trailing 90 days' cost
    # per qualified lead (spec 2013, decision 1). Always an estimate; refuses with an
    # explanation instead of dividing by zero when there is no spend or no qualified lead.
    class ForecastSpend
      DEFINITION = {
        name: "forecast_spend",
        description: "Estimate how many qualified leads a monthly ad budget would produce, from " \
                     "the last 90 days' cost per qualified lead. Always labelled an estimate.",
        input_schema: {
          type: "object",
          required: [ "monthly_budget_cents" ],
          properties: {
            monthly_budget_cents: { type: "integer", minimum: 0, description: "Monthly ad budget in cents." },
            channel: { type: "string", description: "Optional: forecast a single channel." },
            months: { type: "integer", minimum: 1, maximum: 12, default: 3 }
          }
        }
      }.freeze

      def self.call(input, ctx)
        Agent::Forecast.call(
          agency: ctx[:agency],
          budget_cents: input[:monthly_budget_cents],
          channel: input[:channel].presence,
          months: input[:months] || 3
        )
      end
    end
  end
end
