require "rails_helper"
require "benchmark"

# Performance budget (spec 2004 decision 10): every endpoint answers in < 500 ms on the
# real Lakeside snapshot. The data lives in the DEVELOPMENT database
# (docker compose exec web bundle exec rails "data:load_real[lakeside]"), which the test
# suite never has, so these examples are excluded from the ordinary test run and only run
# on demand:
#   docker compose exec -e RAILS_ENV=development web bundle exec rspec spec/performance --tag perf
RSpec.describe "metrics performance", :perf do
  BUDGET = 0.5

  let(:agency) { Agency.find_by(slug: "lakeside") }

  before { Current.agency = agency }

  it "answers summary, funnel, channels and recommendations for 12m within the budget" do
    expect(agency).to be_present, "run `rails \"data:load_real[lakeside]\"` in development first"

    endpoints = {
      "summary" => -> { Metrics::Summary.call(agency: agency, range: "12m") },
      "funnel" => -> { Metrics::Funnel.call(agency: agency, range: "12m") },
      "channels" => -> { Metrics::Channels.call(agency: agency, range: "12m") },
      "recommendations" => -> { Metrics::Recommendations.call(agency: agency, range: "12m") }
    }

    endpoints.each do |name, call|
      Rails.cache.clear
      elapsed = Benchmark.realtime { call.call }
      expect(elapsed).to be < BUDGET, "#{name} took #{(elapsed * 1000).round} ms"
    end
  end
end

RSpec.configure { |config| config.filter_run_excluding :perf if Rails.env.test? }
