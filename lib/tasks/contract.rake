# `make contract-coverage` (spec 2101, decision 8): run the HTTP specs with conformance
# on and report how many of the contract's operations they exercise. Informational until
# every backend lane has landed.
namespace :contract do
  desc "Report which documented API operations the request specs exercise"
  task coverage: :environment do
    require "rspec/core"

    status = RSpec::Core::Runner.run(%w[spec/requests spec/isolation])

    routes = OpenapiFirst::Test::Coverage.result.plans.flat_map(&:routes)
    exercised, missing = routes.partition { |route| route.requests.any?(&:requested?) }

    puts "#{exercised.size}/#{routes.size} operations exercised"
    unless missing.empty?
      puts "not exercised:"
      missing.sort_by { |route| [ route.path, route.request_method ] }.each do |route|
        puts "  #{route.request_method.upcase} #{route.path}"
      end
    end

    exit(status) unless status.zero?
  end
end
