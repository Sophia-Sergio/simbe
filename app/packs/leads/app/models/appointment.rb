class Appointment < ApplicationRecord
  include AgencyScoped

  belongs_to :lead

  STATUSES = %w[scheduled attended no_show cancelled].freeze

  validates :status, inclusion: { in: STATUSES }, allow_nil: true
end
