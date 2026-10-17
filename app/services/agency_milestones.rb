# Maps an agency's configured qualified milestone (agencies.qualified_milestone, config not a
# column) to the lead_facts timestamp column that records it (docs/conventions/database.md).
module AgencyMilestones
  COLUMNS = {
    "application_submitted" => "application_submitted_at",
    "consult_attended" => "consult_attended_at",
    "records" => "records_at",
    "accepted" => "accepted_at"
  }.freeze
end
