# Current.agency/user are thread-local and survive between examples (the DB does not).
# Reset them after every example so one spec's tenant never leaks into the next.
# (A contract failure raised from inside the Rack stack can leave Rails' CurrentAttributes
# bookkeeping half torn down; there is then nothing left to reset.)
RSpec.configure do |config|
  config.after do
    Current.reset
  rescue NoMethodError
    nil
  end
end
