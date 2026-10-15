require "open3"

# Boots the production environment in a subprocess (no database connection is needed to load config).
RSpec.describe "production environment config" do
  let(:root) { File.expand_path("../..", __dir__) }
  let(:base_env) do
    {
      "RAILS_ENV" => "production", "SECRET_KEY_BASE" => "x" * 64, "DATABASE_URL" => "postgres://u:p@127.0.0.1:1/none",
      "APP_URL" => "https://simbe.example.test", "AR_ENCRYPTION_PRIMARY_KEY" => "p" * 32,
      "AR_ENCRYPTION_DETERMINISTIC_KEY" => "d" * 32, "AR_ENCRYPTION_KEY_DERIVATION_SALT" => "s" * 32
    }
  end

  def boot(env, code = "puts Rails.application.config.hosts.inspect")
    Open3.capture3(env, "bundle", "exec", "rails", "runner", code, chdir: root)
  end

  it "only serves the app's own host and exempts /up" do
    out, err, status = boot(base_env, "puts Rails.application.config.hosts.inspect; puts Rails.application.config.host_authorization[:exclude].call(Struct.new(:path).new('/up'))")
    expect(status).to be_success, err
    expect(out).to include('["simbe.example.test"]')
    expect(out).to include("true")
  end

  it "uses the app host for mailer links, not example.com" do
    out, err, status = boot(base_env, "puts Rails.application.config.action_mailer.default_url_options.inspect")
    expect(status).to be_success, err
    expect(out).to include("simbe.example.test")
  end

  %w[AR_ENCRYPTION_PRIMARY_KEY AR_ENCRYPTION_KEY_DERIVATION_SALT APP_URL].each do |name|
    it "refuses to boot without #{name}" do
      _out, err, status = boot(base_env.merge(name => nil))
      expect(status).not_to be_success
      expect(err).to include(name)
    end
  end

  it "skips the checks for the image build (SECRET_KEY_BASE_DUMMY)" do
    env = { "RAILS_ENV" => "production", "SECRET_KEY_BASE_DUMMY" => "1", "DATABASE_URL" => "postgres://b:b@127.0.0.1/b" }
    _out, err, status = boot(env, "puts :ok")
    expect(status).to be_success, err
  end
end
