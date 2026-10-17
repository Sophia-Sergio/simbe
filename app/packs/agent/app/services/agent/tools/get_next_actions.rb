module Agent
  module Tools
    # The next-action queues: per-queue counts plus the five oldest items as first name, age
    # and reason (never a lead id or surname — docs/conventions/sensitive-data.md). A
    # coordinator is always scoped to their own leads, whatever `coordinator` they pass.
    class GetNextActions
      MAX_ITEMS = 5

      DEFINITION = {
        name: "get_next_actions",
        description: "The coordinator queues that need attention: how many leads are in each " \
                     "queue and the five that have waited longest, with first names only.",
        input_schema: {
          type: "object",
          properties: {
            coordinator: { type: "string", description: "Owner only: narrow to one coordinator's queues." }
          }
        }
      }.freeze

      def self.call(input, ctx)
        data = Leads::NextActions.call(user: ctx[:user], coordinator: input[:coordinator])
        {
          as_of: data[:as_of],
          progress: data[:progress],
          queues: data[:queues].map do |queue|
            {
              key: queue[:key],
              title: queue[:title],
              count: queue[:count],
              items: queue[:items].first(MAX_ITEMS).map do |item|
                { first_name: first_name(item[:name]), age_label: item[:age_label], reason: item[:reason] }
              end
            }
          end
        }
      end

      def self.first_name(name)
        name.to_s.split(/\s+/).first
      end
    end
  end
end
