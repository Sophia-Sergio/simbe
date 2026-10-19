module Agent
  module Tools
    # The agency's funnel for a range: how many leads reached each stage, the form drop-off
    # and the headline KPIs (leads, qualified, rate, cost per qualified).
    class GetFunnel
      DEFINITION = {
        name: "get_funnel",
        description: "The agency's funnel for a time range: how many leads reached each stage " \
                     "(inquiry, application, consult booked, attended, records, accepted), where " \
                     "applications are abandoned and the headline KPIs. kpis.leads counts inquiries; " \
                     "kpis.unique_people counts distinct people (one person can inquire more than once).",
        input_schema: {
          type: "object",
          properties: {
            range: { type: "string", enum: %w[30d 90d 12m], default: "30d",
                     description: "Cohort window measured back from the latest data." }
          }
        }
      }.freeze

      def self.call(input, ctx)
        range = input[:range] || "30d"
        funnel = Metrics::Funnel.call(agency: ctx[:agency], range: range)
        summary = Metrics::Summary.call(agency: ctx[:agency], range: range)
        {
          range: range,
          total: funnel[:total],
          stages: funnel[:stages],
          form_dropoff: funnel[:form_dropoff],
          kpis: summary[:kpis]
        }
      end
    end
  end
end
