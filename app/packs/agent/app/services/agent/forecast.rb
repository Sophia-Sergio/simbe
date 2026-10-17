# Linear spend forecast for the `forecast_spend` tool (spec 2013, decision 1): expected
# qualified leads = budget ÷ the trailing-90-day cost per qualified lead, overall or for one
# channel. It never invents a number from nothing: zero spend or zero qualified leads returns
# an explanation, and the answer is always labelled an estimate.
module Agent
  module Forecast
    BASIS_DAYS = 90
    RANGE = "90d"

    def self.call(agency:, budget_cents:, channel: nil, months: 3)
      channels = Metrics::Channels.call(agency: agency, range: RANGE)
      spend, qualified = basis(channels[:rows], channel)

      return no_spend(channel) unless spend.positive?
      return no_qualified(channel) unless qualified.positive?

      cost_per_qualified = (spend.to_f / qualified).round
      per_month = (budget_cents.to_f / cost_per_qualified).round(1)
      {
        basis_days: BASIS_DAYS,
        cost_per_qualified_cents: cost_per_qualified,
        expected_qualified_per_month: per_month,
        months: months,
        expected_qualified_total: (per_month * months).round(1),
        caveats: caveats(agency)
      }
    end

    # -> [spend_cents, qualified] over the trailing window, for one channel or all of them.
    def self.basis(rows, channel)
      if channel
        row = rows.find { |candidate| candidate[:channel] == channel }
        [ row&.fetch(:spend_cents, nil).to_i, row&.fetch(:qualified, nil).to_i ]
      else
        [ rows.sum { |row| row[:spend_cents].to_i }, rows.sum { |row| row[:qualified].to_i } ]
      end
    end

    def self.caveats(agency)
      list = [ "Estimate from the last #{BASIS_DAYS} days of spend and qualified leads." ]
      list << "Spend is sample data" if sample_spend?(agency)
      list
    end

    # Sample spend is a placeholder until the real connectors exist (spend:sample), so say so.
    def self.sample_spend?(agency)
      Metrics::Summary.call(agency: agency, range: RANGE)[:spend_source] == "sample"
    end

    def self.no_spend(channel)
      scope = channel ? "for #{channel}" : "for any channel"
      { error: "no_spend_data", message: "There is no ad spend #{scope} in the last #{BASIS_DAYS} days, so there is nothing to forecast from." }
    end

    def self.no_qualified(channel)
      scope = channel ? "#{channel} has" : "the agency has"
      { error: "no_qualified_leads", message: "#{scope} spend but no qualified leads in the last #{BASIS_DAYS} days, so a cost per qualified lead cannot be computed." }
    end
  end
end
