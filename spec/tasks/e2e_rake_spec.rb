require "rake"
require "rails_helper"

# Owner spec for `e2e:reset` (W3-2, review fix 5): the journey bootstrap passes a name prefix, and a
# prefix that is blank, too short, or contains LIKE metacharacters must never delete more agencies
# than the caller asked for.
RSpec.describe "e2e:reset rake task" do
  before(:all) { Rails.application.load_tasks unless Rake::Task.task_defined?("e2e:reset") }

  def reset(*args)
    Rake::Task["e2e:reset"].reenable
    Rake::Task["e2e:reset"].invoke(*args)
  end

  it "refuses to run outside development/test" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    expect { reset("E2E ") }.to raise_error(SystemExit)
  end

  it "refuses a blank or shorter-than-4-character prefix" do
    expect { reset("") }.to raise_error(SystemExit)
    expect { reset("   ") }.to raise_error(SystemExit)
    expect { reset("E2E") }.to raise_error(SystemExit)
  end

  it "deletes only the agencies whose name starts with the literal prefix" do
    matching = create(:agency, name: "E2E Reset 100% literal")
    # A `%` in the prefix must not act as a wildcard: this one shares the prefix up to "100".
    wildcard_bait = create(:agency, name: "E2E Reset 100x other")
    unrelated = create(:agency, name: "Harbor Surrogacy")

    expect { reset("E2E Reset 100%") }.to output(/removed 1 agency\(ies\)/).to_stdout

    expect(Agency.exists?(matching.id)).to be(false)
    expect(Agency.exists?(wildcard_bait.id)).to be(true)
    expect(Agency.exists?(unrelated.id)).to be(true)
  end
end
