require "rails_helper"
require "pg"
require "rake"
require "stringio"

RSpec.describe "snapshot rake tasks" do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?("snapshot:load")
  end

  before do
    Rake::Task["snapshot:load"].reenable
    Rake::Task["snapshot:expire_uploads"].reenable
  end

  # `abort` prints to stderr and raises SystemExit; capture what it printed.
  def aborting_message(task, *args)
    previous = $stderr
    $stderr = StringIO.new
    Rake::Task[task].invoke(*args)
    ""
  rescue SystemExit
    $stderr.string
  ensure
    $stderr = previous
  end

  def production!
    allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("production"))
  end

  it "refuses snapshot:load in production without SIMBE_CONFIRM_REPLACE" do
    production!

    message = aborting_message("snapshot:load", "alpha", AlphaScenario.copy_dir)

    expect(message).to include("SIMBE_CONFIRM_REPLACE")
  end

  it "loads in production when SIMBE_CONFIRM_REPLACE matches the slug" do
    production!
    create(:agency, slug: "alpha")
    allow(Snapshot::Importer).to receive(:call)
      .and_return(double(row_counts: { "leads" => 1 }, as_of: Time.current))
    ENV["SIMBE_CONFIRM_REPLACE"] = "alpha"

    Rake::Task["snapshot:load"].invoke("alpha", AlphaScenario.copy_dir)

    expect(Snapshot::Importer).to have_received(:call).once
  ensure
    ENV.delete("SIMBE_CONFIRM_REPLACE")
  end

  it "prints only the failure class, never a message that can carry row content" do
    create(:agency, slug: "alpha")
    allow(Snapshot::Importer).to receive(:call).and_raise(PG::Error.new("COPY stage_events, line 1: secret-row-content"))

    message = aborting_message("snapshot:load", "alpha", "/tmp/nope")

    expect(message).to include("PG::Error")
    expect(message).not_to include("secret-row-content")
  end
end
