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
