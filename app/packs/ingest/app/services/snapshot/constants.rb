# The seven export files and their exact headers (handoff/takehome/exports/README.md).
# Shared by the Reader, the Validator and the test ExportBuilder.
# `Snapshot` is the ingest model class; the services live under it as a namespace.
class Snapshot
  module Constants
    STAGES = %w[inquiry pre_screen application consult records accepted].freeze
    OUTCOMES = %w[open not_eligible withdrew unresponsive paused accepted].freeze

    REQUIRED_FILES = %w[
      leads.csv
      stage_history.csv
      contact_log.csv
      screener_answers.csv
      web_sessions.csv
      appointments.csv
      applications.csv
    ].freeze

    HEADERS = {
      "leads.csv" => %w[lead_id created_at first_name last_name email phone state source campaign ad coordinator current_stage outcome outcome_reason outcome_updated_at paused_until],
      "stage_history.csv" => %w[lead_id stage entered_at],
      "contact_log.csv" => %w[lead_id contacted_at direction channel contacted_by],
      "screener_answers.csv" => %w[lead_id submitted_at question answer meets_requirement],
      "web_sessions.csv" => %w[lead_id started_at landing_url pages_viewed referrer device],
      "appointments.csv" => %w[lead_id booked_at scheduled_for status],
      "applications.csv" => %w[lead_id started_at submitted_at percent_complete last_section_completed]
    }.freeze
  end
end
