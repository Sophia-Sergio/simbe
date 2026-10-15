class Agency < ApplicationRecord
  MILESTONES = %w[application_submitted consult_attended records accepted].freeze

  # Raised by AgencyScoped when Current.agency is nil, so a query can never silently
  # fall back to unscoped data (docs/conventions/multi-tenancy.md).
  MissingContext = Class.new(StandardError)

  has_many :users, dependent: :destroy

  validates :name, :slug, :timezone, presence: true
  validates :slug, uniqueness: true, format: { with: /\A[a-z0-9-]+\z/ }
  validates :qualified_milestone, inclusion: { in: MILESTONES }
  validate { errors.add(:timezone, :invalid) unless ActiveSupport::TimeZone[timezone] }
end
