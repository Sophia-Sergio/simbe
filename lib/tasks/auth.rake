namespace :auth do
  desc "Delete expired auth sessions"
  task purge_expired: :environment do
    deleted = AuthSession.where("expires_at <= ?", Time.current).delete_all
    puts "purged #{deleted} expired auth sessions"
  end
end
