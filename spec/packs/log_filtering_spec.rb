require "rails_helper"

# docs/conventions/sensitive-data.md: names, emails, phones and screener answers never reach the logs.
RSpec.describe "request parameter filtering" do
  let(:filter) { ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters) }

  it "masks lead names, phones, emails, screener answers and credentials" do
    params = { "first_name" => "Dana", "last_name" => "Ortiz", "name" => "Dana Ortiz", "phone" => "555-0101", "email" => "d@example.com",
               "answer" => "yes", "password" => "x", "lead" => { "phone" => "555-0102", "stage" => "Applied" } }
    filtered = filter.filter(params)
    %w[first_name last_name name phone email answer password].each { |key| expect(filtered[key]).to eq("[FILTERED]"), "#{key} not filtered" }
    expect(filtered["lead"]).to eq("phone" => "[FILTERED]", "stage" => "Applied")
  end
end
