require "rails_helper"
require_relative "golden_helper"

RSpec.describe "real exports vs golden.json", :real_data do
  %w[harbor lakeside].each do |slug|
    it "#{slug}: the Reader sees exactly the golden row counts" do
      rows = Snapshot::Reader.call(RealData.dir(slug))
      expect(rows.errors).to be_empty
      expect(%i[leads stage_events contacts screener_answers web_sessions appointments applications].index_with { rows[_1].size }.transform_keys(&:to_s))
        .to eq(Golden.agency(slug)["row_counts"])
    end
    it "#{slug}: the direct loader reproduces golden as_of and all-time qualified counts" do
      cfg = RealData::CONFIG.fetch(slug); agency = create(:agency, slug: slug, **cfg); Current.agency = agency
      snap = RealData.load!(agency, slug)
      expect(snap.as_of.change(usec: 0).utc.iso8601(3)).to eq(Golden.agency(slug)["as_of"])
      q = Golden.agency(slug)["qualified_all_time"]
      expect([ LeadFact.where.not(application_submitted_at: nil).count, LeadFact.where.not(consult_attended_at: nil).count, LeadFact.where.not(records_at: nil).count, LeadFact.where.not(accepted_at: nil).count ])
        .to eq(q.values_at("application_submitted", "consult_attended", "records", "accepted"))
    end
  end
end
