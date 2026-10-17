class ActionCompletion < ApplicationRecord
  include AgencyScoped

  belongs_to :user

  validates :lead_external_id, :queue, :snapshot_as_of, presence: true
end
