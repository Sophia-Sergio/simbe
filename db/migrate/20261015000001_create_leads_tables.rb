# Lead domain: the hub (`leads`) plus its event/history children and the derived `lead_facts`.
# Children cascade from `leads` at the database level (docs/conventions/database.md).
class CreateLeadsTables < ActiveRecord::Migration[8.1]
  def change
    create_table :leads, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.uuid :external_id, null: false
      t.timestamptz :lead_created_at, null: false
      t.string :first_name
      t.string :last_name
      t.string :email
      t.string :phone
      t.string :state
      t.string :source_raw
      t.string :channel, null: false
      t.string :campaign
      t.string :ad
      t.string :coordinator_name
      t.string :current_stage, null: false
      t.string :outcome, null: false
      t.string :outcome_reason
      t.timestamptz :outcome_updated_at
      t.date :paused_until
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id external_id], unique: true
      t.index %i[agency_id channel]
      t.index %i[agency_id coordinator_name]
      t.index %i[agency_id outcome]
    end
    add_check_constraint :leads,
      "current_stage IN ('inquiry','pre_screen','application','consult','records','accepted')",
      name: "leads_current_stage_check"
    add_check_constraint :leads,
      "outcome IN ('open','not_eligible','withdrew','unresponsive','paused','accepted')",
      name: "leads_outcome_check"

    create_table :stage_events, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :stage, null: false
      t.timestamptz :entered_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[lead_id stage], unique: true
    end
    add_check_constraint :stage_events,
      "stage IN ('inquiry','pre_screen','application','consult','records','accepted')",
      name: "stage_events_stage_check"

    create_table :contacts, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.timestamptz :contacted_at
      t.string :direction
      t.string :channel
      t.string :contacted_by
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[lead_id contacted_at direction channel], unique: true
    end
    add_check_constraint :contacts, "direction IN ('inbound','outbound')", name: "contacts_direction_check"

    create_table :screener_answers, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.timestamptz :submitted_at
      t.string :question, null: false
      t.text :answer
      t.string :meets_requirement
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[lead_id question], unique: true
    end
    add_check_constraint :screener_answers,
      "meets_requirement IN ('yes','review','no')",
      name: "screener_answers_meets_requirement_check"

    create_table :web_sessions, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.timestamptz :started_at
      t.string :landing_url
      t.string :pages_viewed
      t.string :referrer
      t.string :device
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[lead_id started_at], unique: true
    end

    create_table :appointments, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.timestamptz :booked_at
      t.timestamptz :scheduled_for
      t.string :status
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[lead_id booked_at], unique: true
    end
    add_check_constraint :appointments,
      "status IN ('scheduled','attended','no_show','cancelled')",
      name: "appointments_status_check"

    create_table :applications, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.timestamptz :started_at
      t.timestamptz :submitted_at
      t.integer :percent_complete
      t.string :last_section_completed
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[lead_id started_at], unique: true
    end

    create_table :lead_facts, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }, index: { unique: true }
      t.timestamptz :application_submitted_at
      t.timestamptz :consult_attended_at
      t.timestamptz :records_at
      t.timestamptz :accepted_at
      t.string :furthest_stage
      t.timestamptz :first_outbound_at
      t.integer :first_response_minutes
      t.timestamptz :last_contact_at
      t.timestamptz :last_inbound_at
      t.integer :screener_met
      t.integer :screener_review
      t.integer :screener_not_met
      t.integer :screener_total
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
  end
end
