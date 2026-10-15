# Development seeds (docs/conventions/real-data.md): the two documented agencies and
# their owners/coordinators. Idempotent — safe to run on every `make setup`.
abort("seeds are dev only") unless Rails.env.development?

harbor = Agency.find_or_create_by!(slug: "harbor") do |a|
  a.name = "Harbor Surrogacy"
  a.timezone = "America/Los_Angeles"
  a.qualified_milestone = "consult_attended"
end
lakeside = Agency.find_or_create_by!(slug: "lakeside") do |a|
  a.name = "Lakeside Family Building"
  a.timezone = "America/Chicago"
  a.qualified_milestone = "records"
end

# Coordinator names must match leads.coordinator values in the exports:
# Harbor has Dana Ortiz, Jess Kim, Marcus Lee, Priya Shah.
[
  [ harbor,   "erin@harbor.test",    "Erin Walsh",  "owner",       nil ],
  [ harbor,   "maya@harbor.test",    "Maya Chen",   "coordinator", "Jess Kim" ],
  [ lakeside, "owner@lakeside.test", "Lena Ortiz",  "owner",       nil ],
  [ lakeside, "alex@lakeside.test",  "Alex Rivera", "coordinator", "Alex Rivera" ]
].each do |agency, email, name, role, coordinator|
  User.find_or_create_by!(email: email) do |u|
    u.agency = agency
    u.name = name
    u.role = role
    u.coordinator_name = coordinator
    u.password = "simbe-dev-pass"
  end
end
