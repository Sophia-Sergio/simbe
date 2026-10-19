# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_19_000003) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"

  create_table "action_completions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "user_id", null: false
    t.uuid "lead_external_id", null: false
    t.string "queue", null: false
    t.timestamptz "snapshot_as_of", null: false
    t.timestamptz "completed_at"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "user_id", "lead_external_id", "queue", "snapshot_as_of"], name: "index_action_completions_unique", unique: true
    t.index ["agency_id"], name: "index_action_completions_on_agency_id"
  end

  create_table "ad_connections", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.string "platform", null: false
    t.string "status"
    t.timestamptz "connected_at"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "platform"], name: "index_ad_connections_on_agency_id_and_platform", unique: true
    t.index ["agency_id"], name: "index_ad_connections_on_agency_id"
  end

  create_table "ad_spend_daily", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.date "date", null: false
    t.string "platform", null: false
    t.string "channel"
    t.string "campaign"
    t.bigint "spend_cents", default: 0, null: false
    t.string "source", default: "sample", null: false
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "date", "platform", "channel", "campaign"], name: "index_ad_spend_daily_unique", unique: true
    t.index ["agency_id"], name: "index_ad_spend_daily_on_agency_id"
    t.check_constraint "platform::text = ANY (ARRAY['meta'::character varying::text, 'google'::character varying::text])", name: "ad_spend_daily_platform_check"
    t.check_constraint "source::text = ANY (ARRAY['sample'::character varying::text, 'import'::character varying::text, 'connected'::character varying::text])", name: "ad_spend_daily_source_check"
  end

  create_table "agencies", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.string "timezone", default: "America/Los_Angeles", null: false
    t.string "qualified_milestone", default: "consult_attended", null: false
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["slug"], name: "index_agencies_on_slug", unique: true
    t.check_constraint "qualified_milestone::text = ANY (ARRAY['application_submitted'::character varying::text, 'consult_attended'::character varying::text, 'records'::character varying::text, 'accepted'::character varying::text])", name: "agencies_milestone_check"
  end

  create_table "agent_conversations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "user_id", null: false
    t.string "title"
    t.timestamptz "turn_started_at"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "id"], name: "index_agent_conversations_on_agency_id_and_id", unique: true
    t.index ["agency_id", "user_id"], name: "idx_agent_conversations_agency_id_user_id"
    t.index ["agency_id"], name: "index_agent_conversations_on_agency_id"
  end

  create_table "agent_messages", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "conversation_id", null: false
    t.string "role", null: false
    t.jsonb "body"
    t.jsonb "api_content"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["conversation_id"], name: "index_agent_messages_on_conversation_id"
    t.check_constraint "role::text = ANY (ARRAY['user'::character varying::text, 'assistant'::character varying::text])", name: "agent_messages_role_check"
  end

  create_table "ai_usage_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "user_id", null: false
    t.uuid "conversation_id"
    t.string "task"
    t.string "model"
    t.integer "input_tokens"
    t.integer "output_tokens"
    t.integer "cost_cents"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "conversation_id"], name: "idx_ai_usage_events_agency_id_conversation_id"
    t.index ["agency_id", "created_at"], name: "index_ai_usage_events_on_agency_id_and_created_at"
    t.index ["agency_id", "user_id"], name: "idx_ai_usage_events_agency_id_user_id"
    t.index ["agency_id"], name: "index_ai_usage_events_on_agency_id"
  end

  create_table "applications", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "lead_id", null: false
    t.timestamptz "started_at"
    t.timestamptz "submitted_at"
    t.integer "percent_complete"
    t.string "last_section_completed"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "lead_id"], name: "idx_applications_agency_id_lead_id"
    t.index ["agency_id"], name: "index_applications_on_agency_id"
    t.index ["lead_id", "started_at"], name: "index_applications_on_lead_id_and_started_at", unique: true
    t.index ["lead_id"], name: "index_applications_on_lead_id"
  end

  create_table "appointments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "lead_id", null: false
    t.timestamptz "booked_at"
    t.timestamptz "scheduled_for"
    t.string "status"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "lead_id"], name: "idx_appointments_agency_id_lead_id"
    t.index ["agency_id"], name: "index_appointments_on_agency_id"
    t.index ["lead_id", "booked_at"], name: "index_appointments_on_lead_id_and_booked_at", unique: true
    t.index ["lead_id"], name: "index_appointments_on_lead_id"
    t.check_constraint "status::text = ANY (ARRAY['scheduled'::character varying::text, 'attended'::character varying::text, 'no_show'::character varying::text, 'cancelled'::character varying::text])", name: "appointments_status_check"
  end

  create_table "auth_sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "user_id", null: false
    t.string "token_digest", null: false
    t.timestamptz "expires_at", null: false
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["token_digest"], name: "index_auth_sessions_on_token_digest", unique: true
    t.index ["user_id"], name: "index_auth_sessions_on_user_id"
  end

  create_table "contacts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "lead_id", null: false
    t.timestamptz "contacted_at"
    t.string "direction"
    t.string "channel"
    t.string "contacted_by"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "lead_id"], name: "idx_contacts_agency_id_lead_id"
    t.index ["agency_id"], name: "index_contacts_on_agency_id"
    t.index ["lead_id", "contacted_at", "direction", "channel"], name: "idx_on_lead_id_contacted_at_direction_channel_c0bf45a1c8", unique: true
    t.index ["lead_id"], name: "index_contacts_on_lead_id"
    t.check_constraint "direction::text = ANY (ARRAY['inbound'::character varying::text, 'outbound'::character varying::text])", name: "contacts_direction_check"
  end

  create_table "invitations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "invited_by"
    t.string "email", null: false
    t.string "role", default: "coordinator", null: false
    t.string "coordinator_name"
    t.string "token_digest", null: false
    t.timestamptz "expires_at", null: false
    t.timestamptz "accepted_at"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "invited_by"], name: "idx_invitations_agency_id_invited_by"
    t.index ["agency_id"], name: "index_invitations_on_agency_id"
    t.index ["token_digest"], name: "index_invitations_on_token_digest", unique: true
    t.check_constraint "role::text = 'coordinator'::text", name: "invitations_role_check"
  end

  create_table "lead_facts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "lead_id", null: false
    t.timestamptz "application_submitted_at"
    t.timestamptz "consult_attended_at"
    t.timestamptz "records_at"
    t.timestamptz "accepted_at"
    t.string "furthest_stage"
    t.timestamptz "first_outbound_at"
    t.integer "first_response_minutes"
    t.timestamptz "last_contact_at"
    t.timestamptz "last_inbound_at"
    t.integer "screener_met"
    t.integer "screener_review"
    t.integer "screener_not_met"
    t.integer "screener_total"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "lead_id"], name: "idx_lead_facts_agency_id_lead_id"
    t.index ["agency_id"], name: "index_lead_facts_on_agency_id"
    t.index ["lead_id"], name: "index_lead_facts_on_lead_id", unique: true
  end

  create_table "leads", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "external_id", null: false
    t.timestamptz "lead_created_at", null: false
    t.string "first_name"
    t.string "last_name"
    t.string "email"
    t.string "phone"
    t.string "state"
    t.string "source_raw"
    t.string "channel", null: false
    t.string "campaign"
    t.string "ad"
    t.string "coordinator_name"
    t.string "current_stage", null: false
    t.string "outcome", null: false
    t.string "outcome_reason"
    t.timestamptz "outcome_updated_at"
    t.date "paused_until"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.uuid "person_id", null: false
    t.index ["agency_id", "channel"], name: "index_leads_on_agency_id_and_channel"
    t.index ["agency_id", "coordinator_name"], name: "index_leads_on_agency_id_and_coordinator_name"
    t.index ["agency_id", "external_id"], name: "index_leads_on_agency_id_and_external_id", unique: true
    t.index ["agency_id", "id"], name: "index_leads_on_agency_id_and_id", unique: true
    t.index ["agency_id", "outcome"], name: "index_leads_on_agency_id_and_outcome"
    t.index ["agency_id", "person_id"], name: "index_leads_on_agency_id_and_person_id"
    t.index ["agency_id"], name: "index_leads_on_agency_id"
    t.check_constraint "current_stage::text = ANY (ARRAY['inquiry'::character varying::text, 'pre_screen'::character varying::text, 'application'::character varying::text, 'consult'::character varying::text, 'records'::character varying::text, 'accepted'::character varying::text])", name: "leads_current_stage_check"
    t.check_constraint "outcome::text = ANY (ARRAY['open'::character varying::text, 'not_eligible'::character varying::text, 'withdrew'::character varying::text, 'unresponsive'::character varying::text, 'paused'::character varying::text, 'accepted'::character varying::text])", name: "leads_outcome_check"
  end

  create_table "mcp_keys", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.string "key_digest", null: false
    t.string "prefix", null: false
    t.uuid "created_by"
    t.timestamptz "revoked_at"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "created_by"], name: "idx_mcp_keys_agency_id_created_by"
    t.index ["agency_id"], name: "index_mcp_keys_on_agency_id"
    t.index ["key_digest"], name: "index_mcp_keys_on_key_digest", unique: true
  end

  create_table "people", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.string "email_key"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "email_key"], name: "index_people_on_agency_id_and_email_key", unique: true, where: "(email_key IS NOT NULL)"
    t.index ["agency_id", "id"], name: "index_people_on_agency_id_and_id", unique: true
  end

  create_table "screener_answers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "lead_id", null: false
    t.timestamptz "submitted_at"
    t.string "question", null: false
    t.text "answer"
    t.string "meets_requirement"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "lead_id"], name: "idx_screener_answers_agency_id_lead_id"
    t.index ["agency_id"], name: "index_screener_answers_on_agency_id"
    t.index ["lead_id", "question"], name: "index_screener_answers_on_lead_id_and_question", unique: true
    t.index ["lead_id"], name: "index_screener_answers_on_lead_id"
    t.check_constraint "meets_requirement::text = ANY (ARRAY['yes'::character varying::text, 'review'::character varying::text, 'no'::character varying::text])", name: "screener_answers_meets_requirement_check"
  end

  create_table "snapshot_uploads", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "user_id", null: false
    t.string "status", default: "validating", null: false
    t.jsonb "progress"
    t.jsonb "report"
    t.uuid "snapshot_id"
    t.jsonb "error"
    t.text "dir"
    t.timestamptz "started_at"
    t.timestamptz "finished_at"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "id"], name: "index_snapshot_uploads_on_agency_id_and_id", unique: true
    t.index ["agency_id", "snapshot_id"], name: "idx_snapshot_uploads_agency_id_snapshot_id"
    t.index ["agency_id", "status"], name: "index_snapshot_uploads_on_agency_id_and_status"
    t.index ["agency_id", "user_id"], name: "idx_snapshot_uploads_agency_id_user_id"
    t.index ["agency_id"], name: "index_snapshot_uploads_in_flight_per_agency", unique: true, where: "((status)::text = ANY (ARRAY[('validating'::character varying)::text, ('committing'::character varying)::text]))"
    t.index ["agency_id"], name: "index_snapshot_uploads_on_agency_id"
    t.index ["snapshot_id"], name: "index_snapshot_uploads_on_snapshot_id"
    t.check_constraint "status::text = ANY (ARRAY['validating'::character varying::text, 'validated'::character varying::text, 'committing'::character varying::text, 'committed'::character varying::text, 'failed'::character varying::text, 'cancelled'::character varying::text, 'expired'::character varying::text])", name: "snapshot_uploads_status_check"
  end

  create_table "snapshots", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.timestamptz "as_of", null: false
    t.timestamptz "loaded_at"
    t.jsonb "row_counts"
    t.jsonb "warnings"
    t.uuid "loaded_by"
    t.uuid "upload_id"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "as_of"], name: "index_snapshots_on_agency_id_and_as_of"
    t.index ["agency_id", "id"], name: "index_snapshots_on_agency_id_and_id", unique: true
    t.index ["agency_id", "loaded_by"], name: "idx_snapshots_agency_id_loaded_by"
    t.index ["agency_id", "upload_id"], name: "idx_snapshots_agency_id_upload_id"
    t.index ["agency_id"], name: "index_snapshots_on_agency_id"
  end

  create_table "solid_queue_batch_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.bigint "batch_id", null: false
    t.datetime "created_at", null: false
    t.index ["batch_id"], name: "index_solid_queue_batch_executions_on_batch_id"
    t.index ["job_id"], name: "index_solid_queue_batch_executions_on_job_id", unique: true
  end

  create_table "solid_queue_batches", force: :cascade do |t|
    t.string "active_job_batch_id"
    t.string "description"
    t.text "on_finish"
    t.text "on_success"
    t.text "on_failure"
    t.text "metadata"
    t.integer "total_jobs", default: 0, null: false
    t.integer "completed_jobs", default: 0, null: false
    t.integer "failed_jobs", default: 0, null: false
    t.datetime "enqueued_at"
    t.datetime "finished_at"
    t.datetime "failed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active_job_batch_id"], name: "index_solid_queue_batches_on_active_job_batch_id", unique: true
    t.index ["finished_at"], name: "index_solid_queue_batches_on_finished_at"
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.string "concurrency_key", null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.text "error"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "queue_name", null: false
    t.string "class_name", null: false
    t.text "arguments"
    t.integer "priority", default: 0, null: false
    t.string "active_job_id"
    t.datetime "scheduled_at"
    t.datetime "finished_at"
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "batch_id"
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["batch_id"], name: "index_solid_queue_jobs_on_batch_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.string "queue_name", null: false
    t.datetime "created_at", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.bigint "supervisor_id"
    t.integer "pid", null: false
    t.string "hostname"
    t.text "metadata"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "task_key", null: false
    t.datetime "run_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.string "key", null: false
    t.string "schedule", null: false
    t.string "command", limit: 2048
    t.string "class_name"
    t.text "arguments"
    t.string "queue_name"
    t.integer "priority", default: 0
    t.boolean "static", default: true, null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "scheduled_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.string "key", null: false
    t.integer "value", default: 1, null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
  end

  create_table "stage_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "lead_id", null: false
    t.string "stage", null: false
    t.timestamptz "entered_at"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "lead_id"], name: "idx_stage_events_agency_id_lead_id"
    t.index ["agency_id"], name: "index_stage_events_on_agency_id"
    t.index ["lead_id", "stage"], name: "index_stage_events_on_lead_id_and_stage", unique: true
    t.index ["lead_id"], name: "index_stage_events_on_lead_id"
    t.check_constraint "stage::text = ANY (ARRAY['inquiry'::character varying::text, 'pre_screen'::character varying::text, 'application'::character varying::text, 'consult'::character varying::text, 'records'::character varying::text, 'accepted'::character varying::text])", name: "stage_events_stage_check"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.string "password_digest", null: false
    t.string "role", default: "owner", null: false
    t.string "coordinator_name"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "id"], name: "index_users_on_agency_id_and_id", unique: true
    t.index ["agency_id"], name: "index_users_on_agency_id"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.check_constraint "role::text = ANY (ARRAY['owner'::character varying::text, 'coordinator'::character varying::text])", name: "users_role_check"
  end

  create_table "web_sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agency_id", null: false
    t.uuid "lead_id", null: false
    t.timestamptz "started_at"
    t.string "landing_url"
    t.string "pages_viewed"
    t.string "referrer"
    t.string "device"
    t.timestamptz "created_at", null: false
    t.timestamptz "updated_at", null: false
    t.index ["agency_id", "lead_id"], name: "idx_web_sessions_agency_id_lead_id"
    t.index ["agency_id"], name: "index_web_sessions_on_agency_id"
    t.index ["lead_id", "started_at"], name: "index_web_sessions_on_lead_id_and_started_at", unique: true
    t.index ["lead_id"], name: "index_web_sessions_on_lead_id"
  end

  add_foreign_key "action_completions", "agencies", on_delete: :cascade
  add_foreign_key "action_completions", "users", column: ["agency_id", "user_id"], primary_key: ["agency_id", "id"]
  add_foreign_key "ad_connections", "agencies", on_delete: :cascade
  add_foreign_key "ad_spend_daily", "agencies", on_delete: :cascade
  add_foreign_key "agent_conversations", "agencies", on_delete: :cascade
  add_foreign_key "agent_conversations", "users", column: ["agency_id", "user_id"], primary_key: ["agency_id", "id"]
  add_foreign_key "agent_messages", "agent_conversations", column: "conversation_id", on_delete: :cascade
  add_foreign_key "ai_usage_events", "agencies", on_delete: :cascade
  add_foreign_key "ai_usage_events", "agent_conversations", column: ["agency_id", "conversation_id"], primary_key: ["agency_id", "id"], name: "fk_ai_usage_events_conversation_id_tenant"
  add_foreign_key "ai_usage_events", "users", column: ["agency_id", "user_id"], primary_key: ["agency_id", "id"]
  add_foreign_key "applications", "agencies", on_delete: :cascade
  add_foreign_key "applications", "leads", column: ["agency_id", "lead_id"], primary_key: ["agency_id", "id"], on_delete: :cascade
  add_foreign_key "appointments", "agencies", on_delete: :cascade
  add_foreign_key "appointments", "leads", column: ["agency_id", "lead_id"], primary_key: ["agency_id", "id"], on_delete: :cascade
  add_foreign_key "auth_sessions", "users", on_delete: :cascade
  add_foreign_key "contacts", "agencies", on_delete: :cascade
  add_foreign_key "contacts", "leads", column: ["agency_id", "lead_id"], primary_key: ["agency_id", "id"], on_delete: :cascade
  add_foreign_key "invitations", "agencies", on_delete: :cascade
  add_foreign_key "invitations", "users", column: ["agency_id", "invited_by"], primary_key: ["agency_id", "id"], name: "fk_invitations_invited_by_tenant"
  add_foreign_key "lead_facts", "agencies", on_delete: :cascade
  add_foreign_key "lead_facts", "leads", column: ["agency_id", "lead_id"], primary_key: ["agency_id", "id"], on_delete: :cascade
  add_foreign_key "leads", "agencies", on_delete: :cascade
  add_foreign_key "leads", "people", column: ["agency_id", "person_id"], primary_key: ["agency_id", "id"]
  add_foreign_key "mcp_keys", "agencies", on_delete: :cascade
  add_foreign_key "mcp_keys", "users", column: ["agency_id", "created_by"], primary_key: ["agency_id", "id"], name: "fk_mcp_keys_created_by_tenant"
  add_foreign_key "people", "agencies", on_delete: :cascade
  add_foreign_key "screener_answers", "agencies", on_delete: :cascade
  add_foreign_key "screener_answers", "leads", column: ["agency_id", "lead_id"], primary_key: ["agency_id", "id"], on_delete: :cascade
  add_foreign_key "snapshot_uploads", "agencies", on_delete: :cascade
  add_foreign_key "snapshot_uploads", "snapshots", column: ["agency_id", "snapshot_id"], primary_key: ["agency_id", "id"], name: "fk_snapshot_uploads_snapshot_id_tenant"
  add_foreign_key "snapshot_uploads", "users", column: ["agency_id", "user_id"], primary_key: ["agency_id", "id"]
  add_foreign_key "snapshots", "agencies", on_delete: :cascade
  add_foreign_key "snapshots", "snapshot_uploads", column: ["agency_id", "upload_id"], primary_key: ["agency_id", "id"], name: "fk_snapshots_upload_id_tenant"
  add_foreign_key "snapshots", "users", column: ["agency_id", "loaded_by"], primary_key: ["agency_id", "id"], name: "fk_snapshots_loaded_by_tenant"
  add_foreign_key "solid_queue_batch_executions", "solid_queue_batches", column: "batch_id", on_delete: :cascade
  add_foreign_key "solid_queue_batch_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "stage_events", "agencies", on_delete: :cascade
  add_foreign_key "stage_events", "leads", column: ["agency_id", "lead_id"], primary_key: ["agency_id", "id"], on_delete: :cascade
  add_foreign_key "users", "agencies", on_delete: :cascade
  add_foreign_key "web_sessions", "agencies", on_delete: :cascade
  add_foreign_key "web_sessions", "leads", column: ["agency_id", "lead_id"], primary_key: ["agency_id", "id"], on_delete: :cascade
end
