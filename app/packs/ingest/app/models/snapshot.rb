# A successful snapshot load. Not AgencyScoped: the ingest services run in contexts where
# Current.agency is not set, so scoping is an explicit helper (docs/conventions/multi-tenancy.md).
class Snapshot < ApplicationRecord
  belongs_to :agency
  belongs_to :upload, class_name: "SnapshotUpload", foreign_key: :upload_id, optional: true, inverse_of: false

  scope :for_agency, ->(agency) { where(agency_id: agency.respond_to?(:id) ? agency.id : agency) }
  scope :latest_first, -> { order(as_of: :desc) }
end
