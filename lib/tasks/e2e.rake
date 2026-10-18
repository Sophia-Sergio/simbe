namespace :e2e do
  desc "Load Alpha for harbor + coordinator logins (development/test only)"
  task seed: :environment do
    abort "e2e:seed is dev/test only" unless Rails.env.development? || Rails.env.test?
    require Rails.root.join("spec/support/export_builder")
    # RowsLoader is what AlphaScenario.load! calls; spec/support is never autoloaded, so it
    # must be required explicitly here (the plan's snippet requires only builder + scenario).
    require Rails.root.join("spec/support/rows_loader")
    require Rails.root.join("spec/support/alpha_scenario")
    require Rails.root.join("spec/support/alpha_spend")
    agency = Agency.find_by!(slug: "harbor")
    Current.agency = agency
    # Restore the documented Harbor config (docs/conventions/real-data.md): the journeys change the
    # qualified definition in Settings, so a re-seed must put it back or the next run starts wrong.
    agency.update!(timezone: "America/Los_Angeles", qualified_milestone: "consult_attended")
    AlphaScenario.load!(agency)                # replaces; idempotent
    AlphaSpend.load!(agency)
    # logins: erin@harbor.test (owner), dana@harbor.test (coordinator "Dana Ortiz"), jess@harbor.test ("Jess Kim"), priya@harbor.test ("Priya Shah") — password simbe-dev-pass
    # A re-seed must also restore the password of an existing login (dev/test only: the abort above),
    # or a lane that changed it would keep a stack nobody can sign into.
    { "dana@harbor.test" => "Dana Ortiz", "jess@harbor.test" => "Jess Kim", "priya@harbor.test" => "Priya Shah" }.each do |email, name|
      user = User.find_or_initialize_by(email: email)
      user.agency = agency
      user.name = name
      user.role = "coordinator"
      user.coordinator_name = name
      user.password = "simbe-dev-pass"
      user.save!
    end
  end

  desc "Delete agencies a journey run created (name prefix) for a fresh sign-up; dev/test only"
  task :reset, [ :prefix ] => :environment do |_, a|
    abort "e2e:reset is dev/test only" unless Rails.env.development? || Rails.env.test?
    prefix = a[:prefix].presence || "E2E "
    # Every tenant FK is ON DELETE CASCADE (app/packs/identity/app/models/agency.rb), so one
    # statement removes the agency and its users, leads, snapshots and keys. The prefix keeps
    # two journey files (or two Playwright projects) from deleting each other's in-flight agency.
    removed = Agency.where("name LIKE ?", "#{prefix}%").delete_all
    puts "e2e:reset: removed #{removed} agency(ies) named #{prefix.inspect}*"
  end

  desc "Write the Alpha CSVs for browser upload tests"
  task :alpha_files, [ :dir ] => :environment do |_, a|
    abort "e2e:alpha_files is dev/test only" unless Rails.env.development? || Rails.env.test?
    require Rails.root.join("spec/support/export_builder")
    require Rails.root.join("spec/support/alpha_scenario")
    # The plan wrote `Rails.root.join("../e2e/fixtures/alpha")`, which points outside the repo;
    # F-SIGNUP's plan (2012) and CI's synthetic export both use `e2e/fixtures/alpha`.
    FileUtils.cp_r(Dir[File.join(AlphaScenario.copy_dir, "*")], FileUtils.mkdir_p(a[:dir] || Rails.root.join("e2e/fixtures/alpha")))
  end
end
