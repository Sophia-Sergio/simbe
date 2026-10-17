module Agent
  module Tools
    # Why leads stop: the form sections where applications are abandoned, plus the top exit
    # reasons per funnel stage (verdicts, never raw screener answers).
    class GetDropoffReasons
      DEFINITION = {
        name: "get_dropoff_reasons",
        description: "Why applicants drop off: the form sections where unsubmitted applications " \
                     "stall, and the most common exit reasons at each funnel stage.",
        input_schema: {
          type: "object",
          properties: {
            range: { type: "string", enum: %w[30d 90d 12m], default: "30d" }
          }
        }
      }.freeze

      def self.call(input, ctx)
        range = input[:range] || "30d"
        funnel = Metrics::Funnel.call(agency: ctx[:agency], range: range)
        {
          range: range,
          form_dropoff: funnel[:form_dropoff],
          exit_reasons: funnel[:stages].map do |stage|
            { stage: stage[:label], key: stage[:key], exit_reasons: stage[:exit_reasons] }
          end
        }
      end
    end
  end
end
