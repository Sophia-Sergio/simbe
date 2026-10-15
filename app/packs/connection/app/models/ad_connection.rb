class AdConnection < ApplicationRecord
  include AgencyScoped

  validates :platform, presence: true, uniqueness: { scope: :agency_id }
end
