class LeadFact < ApplicationRecord
  include AgencyScoped

  belongs_to :lead
end
