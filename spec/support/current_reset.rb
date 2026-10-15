# Current.agency/user are thread-local and survive between examples (the DB does not).
# Reset them after every example so one spec's tenant never leaks into the next.
RSpec.configure do |config|
  config.after { Current.reset }
end
