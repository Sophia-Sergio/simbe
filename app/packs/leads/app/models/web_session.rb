class WebSession < ApplicationRecord
  include AgencyScoped

  belongs_to :lead
end
