# `create`/`build` etc. in examples (the plans write `create(:user, …)`).
RSpec.configure do |config|
  config.include FactoryBot::Syntax::Methods
end
