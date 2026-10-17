class Application < ApplicationRecord
  include AgencyScoped

  belongs_to :lead

  validates :percent_complete, numericality: { only_integer: true, in: 0..100 }, allow_nil: true
end
