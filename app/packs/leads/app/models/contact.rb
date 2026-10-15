class Contact < ApplicationRecord
  include AgencyScoped

  belongs_to :lead

  DIRECTIONS = %w[inbound outbound].freeze

  validates :direction, inclusion: { in: DIRECTIONS }, allow_nil: true
end
