# Whether two inquiries of one person were open at the same time (linked-inquiries spec, decision 5).
# Pure: it works on plain hashes so the importer's validator and the lead detail share one rule.
module Leads
  module Overlap
    CLOSED_OUTCOMES = %w[not_eligible withdrew unresponsive accepted].freeze

    # inquiries: [{ id:, created_at:, outcome:, outcome_updated_at: }] (Time values, the last may be nil).
    # -> [[earlier_id, later_id], ...] for every pair whose earlier inquiry had not closed before the
    # later one was created. Inquiries are ordered by [created_at, id].
    def self.pairs(inquiries)
      sorted = inquiries.sort_by { |inquiry| [ inquiry[:created_at], inquiry[:id] ] }
      sorted.each_with_index.flat_map do |earlier, index|
        sorted.drop(index + 1).filter_map do |later|
          [ earlier[:id], later[:id] ] unless closed_before?(earlier, later[:created_at])
        end
      end
    end

    # Closed means a closing outcome whose date is strictly earlier than `at`; a closing outcome with
    # no date cannot be shown to have closed in time, so it counts as still open.
    def self.closed_before?(inquiry, at)
      closed_at = inquiry[:outcome_updated_at]
      CLOSED_OUTCOMES.include?(inquiry[:outcome]) && !closed_at.nil? && closed_at < at
    end
  end
end
