require "rake"
require "rails_helper"

# The real-key smoke must be safe to run (spec 2013, acceptance 6; review fix 1): it refuses
# in production and without an ANTHROPIC_API_KEY, so it can never fire an unauthenticated
# request or hit the live API from a production console.
RSpec.describe "agent:smoke rake task" do
  before(:all) { Rails.application.load_tasks unless Rake::Task.task_defined?("agent:smoke") }
  before { Rake::Task["agent:smoke"].reenable }

  it "refuses to run in production" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    expect { Rake::Task["agent:smoke"].invoke("alpha", "q") }.to raise_error(SystemExit)
  end

  it "refuses to run without an API key" do
    stub_const("ENV", ENV.to_h.except("ANTHROPIC_API_KEY"))
    expect { Rake::Task["agent:smoke"].invoke("alpha", "q") }.to raise_error(SystemExit)
  end
end
