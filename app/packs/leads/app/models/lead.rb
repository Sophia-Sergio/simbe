class Lead < ApplicationRecord
  include AgencyScoped

  STAGES = %w[inquiry pre_screen application consult records accepted].freeze
  OUTCOMES = %w[open not_eligible withdrew unresponsive paused accepted].freeze

  has_many :stage_events, dependent: :delete_all
  has_many :contacts, dependent: :delete_all
  has_many :screener_answers, dependent: :delete_all
  has_many :web_sessions, dependent: :delete_all
  has_many :appointments, dependent: :delete_all
  has_many :applications, dependent: :delete_all
  has_one :lead_fact, dependent: :delete

  # No uniqueness validation on external_id: the DB-level unique index
  # (agency_id, external_id) is the guard, so a duplicate raises RecordNotUnique.
  validates :external_id, presence: true
  validates :lead_created_at, presence: true
  validates :channel, :current_stage, :outcome, presence: true
  validates :current_stage, inclusion: { in: STAGES }
  validates :outcome, inclusion: { in: OUTCOMES }
end
