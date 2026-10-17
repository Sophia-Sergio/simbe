require "rails_helper"
require_relative "golden_helper"

# Real-data oracle (lane override 7): the same requests the app serves, compared with the
# aggregates bin/golden-numbers computed independently from the CSVs. Tagged :real_data, so
# it is skipped automatically when the exports are absent (always, in CI). One example per
# agency: loading Lakeside (~625k rows) is expensive, so everything is asserted in one run.
FUNNEL_STAGES = %w[inquiry application consult_booked consult_attended records accepted].freeze

RSpec.describe "real exports: metrics vs golden.json", :real_data, type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }

  %w[harbor lakeside].each do |slug|
    context slug do
      let(:golden) { Golden.agency(slug) }
      let(:config) { RealData::CONFIG.fetch(slug) }
      let(:agency) { create(:agency, slug: slug, **config) }
      let!(:owner) { create(:user, agency: agency) }

      before do
        Current.agency = agency
        RealData.load!(agency, slug)
        Current.reset
        post "/api/v1/session", params: { email: owner.email, password: "secret-pass-1" }, headers: headers, as: :json
        expect(response).to have_http_status(:created)
      end

      def summary(range)
        get "/api/v1/metrics/summary", params: { range: range }
        response.parsed_body
      end

      it "matches the summary, funnel, channel, insight, milestone and spend oracle" do
        # KPIs per range (golden summary.<range>).
        %w[30d 90d 12m].each do |range|
          expected = golden["summary"][range]
          body = summary(range)
          expect(body.dig("kpis", "leads", "value")).to eq(expected["leads"]), "#{range} leads"
          expect(body.dig("kpis", "qualified", "value")).to eq(expected["qualified"]), "#{range} qualified"
          expect(body.dig("kpis", "qualified_rate", "value")).to eq(expected["qualified_rate"]), "#{range} rate"
          previous = expected["previous_leads"].zero? ? nil : expected["previous_leads"]
          expect(body.dig("kpis", "leads", "previous")).to eq(previous), "#{range} previous"
        end

        # Funnel: counts, pass-throughs, real exit-reason labels and form drop-off.
        get "/api/v1/metrics/funnel", params: { range: "12m" }
        funnel = response.parsed_body
        expected_funnel = golden["funnel_12m"]
        expect(funnel["total"]).to eq(expected_funnel["total"])
        expect(funnel["stages"].map { _1["count"] }).to eq(FUNNEL_STAGES.map { |name| expected_funnel["counts"][name] })
        expect(funnel["stages"].map { _1["pct_of_previous"] }).to eq(FUNNEL_STAGES.map { |name| expected_funnel["pct_of_previous"][name] })
        expect(funnel["stages"].map { _1["exit_reasons"] }).to eq(FUNNEL_STAGES.map { |name| expected_funnel["exit_reasons_top2"][name] })
        expect(funnel["form_dropoff"]).to eq(golden["form_dropoff_12m"])

        # Channels and the two headline insights.
        get "/api/v1/metrics/channels", params: { range: "12m" }
        channels = response.parsed_body
        expected_channels = golden["channels_12m"]
        rows = channels["rows"].index_by { _1["channel"] }
        expect(rows.keys.sort).to eq(expected_channels.keys.sort)
        expected_channels.each do |channel, values|
          expect([ rows[channel]["leads"], rows[channel]["qualified"], rows[channel]["rate"] ])
            .to eq([ values["leads"], values["qualified"], values["rate"] ]), channel
        end
        insights = golden["insights_12m"]
        expect(channels.dig("insights", "unattributed", "count")).to eq(insights["unattributed"]["count"])
        expect(channels.dig("insights", "unattributed", "pct")).to eq(insights["unattributed"]["pct"])
        expect(channels.dig("insights", "out_of_area", "count")).to eq(insights["out_of_area"]["count"])
        expect(channels.dig("insights", "out_of_area", "pct")).to eq(insights["out_of_area"]["pct"])
        expect(channels.dig("insights", "out_of_area", "main_states")).to eq(insights["out_of_area"]["main_states"])

        # Changing the definition to each milestone reproduces qualified_by_milestone.
        expected_milestones = golden["summary"]["12m"]["qualified_by_milestone"]
        expected_milestones.each do |milestone, count|
          agency.update!(qualified_milestone: milestone)
          expect(summary("12m").dig("kpis", "qualified", "value")).to eq(count), milestone
        end
        agency.update!(qualified_milestone: config[:qualified_milestone])

        # Spend is not in the oracle: no cost before sample spend, a finite one after.
        expect(summary("12m").dig("kpis", "cost_per_qualified", "value_cents")).to be_nil
        Current.agency = agency
        Spend::SampleGenerator.call(agency: agency)
        Current.reset
        expect(summary("12m").dig("kpis", "cost_per_qualified", "value_cents")).to be_a(Integer)
      end
    end
  end
end
