require "rails_helper"
require "rake"

RSpec.describe "auth:purge_expired" do
  before do
    Rails.application.load_tasks
    Rake::Task["auth:purge_expired"].reenable
  end

  it "removes expired sessions and keeps live ones" do
    user = create(:user)
    live = AuthSession.issue!(user)
    expired = AuthSession.issue!(user)
    AuthSession.find_by_token(expired).update!(expires_at: 1.minute.ago)

    Rake::Task["auth:purge_expired"].invoke

    expect(AuthSession.find_by_token(live)).to be_present
    expect(AuthSession.find_by_token(expired)).to be_nil
  end
end
