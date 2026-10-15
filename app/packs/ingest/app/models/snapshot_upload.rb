# Upload/validate/commit lifecycle. Not AgencyScoped: controllers look it up through
# Current.agency (docs/conventions/multi-tenancy.md).
class SnapshotUpload < ApplicationRecord
  belongs_to :agency
  belongs_to :user
  belongs_to :snapshot, optional: true

  STATUSES = %w[validating validated committing committed failed cancelled expired].freeze
  IN_FLIGHT = %w[validating committing].freeze

  validates :status, inclusion: { in: STATUSES }

  scope :for_agency, ->(agency) { where(agency_id: agency.respond_to?(:id) ? agency.id : agency) }
  scope :in_flight, -> { where(status: IN_FLIGHT) }

  def in_flight? = IN_FLIGHT.include?(status)
end
