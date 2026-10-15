# Not AgencyScoped: keys are verified before Current.agency exists, so scoping is explicit.
class McpKey < ApplicationRecord
  belongs_to :agency
  belongs_to :created_by, class_name: "User", foreign_key: :created_by, optional: true, inverse_of: false

  validates :key_digest, presence: true, uniqueness: true
  validates :prefix, presence: true

  scope :for_agency, ->(agency) { where(agency_id: agency.respond_to?(:id) ? agency.id : agency) }
  scope :active, -> { where(revoked_at: nil) }

  def revoked? = revoked_at.present?
end
