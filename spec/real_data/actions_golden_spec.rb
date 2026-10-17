require "rails_helper"
require_relative "golden_helper"

# The real-export oracle for next actions and coordinator stats (plan override 8):
# the same Leads::NextActions / Leads::CoordinatorStats the API serves, compared with
# the aggregates bin/golden-numbers computes independently (docs/conventions/real-data.md).
# Skipped automatically when the exports are absent (always, in CI).
RSpec.describe "real exports: next actions and coordinator stats vs golden.json", :real_data do
  %w[harbor lakeside].each do |slug|
    context slug do
      let(:agency) { create(:agency, slug: slug, **RealData::CONFIG.fetch(slug)) }
      let!(:owner) { create(:user, agency: agency) }

      before do
        Current.agency = agency
        RealData.load!(agency, slug)
      end

      it "counts every queue item for the owner (nothing completed)" do
        result = Leads::NextActions.call(user: owner)
        counts = result[:queues].to_h { |queue| [ queue[:key], queue[:items].size ] }
        expect(counts).to eq(Golden.agency(slug)["queues_all_leads"])
        expect(result[:progress]).to eq(done: 0, total: counts.values.sum)
      end

      it "matches the golden coordinator stats for every coordinator" do
        rows = Leads::CoordinatorStats.call(agency: agency).index_by { _1[:name] }
        expect(rows.keys).to eq(Golden.agency(slug)["coordinators_all_time"].keys)

        Golden.agency(slug)["coordinators_all_time"].each do |name, expected|
          expect(rows.fetch(name)).to include(
            leads: expected["leads"],
            share_pct: expected["share_pct"],
            qualified: expected["qualified"],
            qualified_rate: expected["qualified_rate"],
            first_reply_minutes: expected["first_reply_minutes_median"],
            overdue: expected["overdue"]
          )
        end
      end

      it "keeps each coordinator's queues to their own leads, summing to the owner total" do
        owner_total = Leads::NextActions.call(user: owner)[:queues].sum { _1[:items].size }
        total = 0

        Golden.agency(slug)["coordinators_all_time"].each_key do |name|
          coordinator = create(:user, :coordinator, agency: agency, coordinator_name: name)
          items = Leads::NextActions.call(user: coordinator)[:queues].flat_map { _1[:items] }
          own_leads = Leads::Queues.call(agency: agency, coordinator: name).map { _1[:external_id] }
          expect(items.map { _1[:lead_id] }).to match_array(own_leads)
          total += items.size
        end

        expect(total).to eq(owner_total)
      end

      # The Done-when's headline numbers, asserted explicitly (Harbor only).
      if slug == "harbor"
        it "gives Dana Ortiz 2,252 leads, 63.8% of the agency and 19 overdue" do
          dana = Leads::CoordinatorStats.call(agency: agency).find { _1[:name] == "Dana Ortiz" }
          expect(dana).to include(leads: 2252, share_pct: 63.8, overdue: 19)
        end
      end
    end
  end
end
