class Agency < ApplicationRecord
  MILESTONES = %w[application_submitted consult_attended records accepted].freeze

  # Raised by AgencyScoped when Current.agency is nil, so a query can never silently
  # fall back to unscoped data (docs/conventions/multi-tenancy.md).
  MissingContext = Class.new(StandardError)

  # Deletion cascades at the database level (every tenant FK is ON DELETE CASCADE). The
  # associations must NOT carry `dependent:`: their models are AgencyScoped, so the default
  # scope would raise (Current.agency nil) or filter away rows that are not the destroyed
  # agency's, making `agency.destroy` either raise or orphan children.
  has_many :users
  has_many :invitations
  has_many :snapshots
  has_many :snapshot_uploads
  has_many :leads
  has_many :action_completions
  has_many :agent_conversations
  has_many :ai_usage_events
  has_many :mcp_keys

  validates :name, :slug, :timezone, presence: true
  validates :slug, uniqueness: true, format: { with: /\A[a-z0-9-]+\z/ }
  validates :qualified_milestone, inclusion: { in: MILESTONES }
  validate { errors.add(:timezone, :invalid) unless ActiveSupport::TimeZone[timezone] }
end
