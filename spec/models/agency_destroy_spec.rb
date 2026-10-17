require "rails_helper"

# Every tenant FK is ON DELETE CASCADE, so destroying an agency works even when Current.agency
# is not the destroyed agency (docs/conventions/multi-tenancy.md). This is the bug the dependent:
# options caused through AgencyScoped's default scope.
RSpec.describe "Agency#destroy" do
  it "cascades to every tenant row without needing Current.agency" do
    agency = create(:agency)
    Current.agency = agency
    AlphaScenario.load!(agency)
    create(:user, agency: agency)
    create(:user, :coordinator, agency: agency)
    Current.agency = nil

    expect { agency.destroy }.not_to raise_error

    %w[users leads stage_events contacts screener_answers appointments applications lead_facts snapshots].each do |table|
      remaining = ActiveRecord::Base.connection.select_value("select count(*) from #{table} where agency_id = '#{agency.id}'").to_i
      expect(remaining).to eq(0), "#{table} still has #{remaining} rows"
    end
  end
end
