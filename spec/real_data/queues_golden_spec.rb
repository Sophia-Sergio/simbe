require "rails_helper"
require_relative "golden_helper"

# The queue counts are the oracle for the read-model that drives next actions, the board and
# coordinator stats. This is the only place a real export is compared against Leads::Queues.
RSpec.describe "real exports: Leads::Queues vs golden.json", :real_data do
  %w[harbor lakeside].each do |slug|
    it "#{slug}: queue membership counts match the golden oracle (agency-local dates)" do
      cfg = RealData::CONFIG.fetch(slug)
      agency = create(:agency, slug: slug, **cfg)
      Current.agency = agency
      RealData.load!(agency, slug)

      counts = Leads::Queues.call(agency: agency).group_by { _1[:queue] }.transform_values(&:size)
      expected = Golden.agency(slug)["queues_all_leads"]

      expect(Leads::Queues::KEYS.index_with { |key| counts.fetch(key, 0) }).to eq(expected.slice(*Leads::Queues::KEYS))
    end
  end
end
