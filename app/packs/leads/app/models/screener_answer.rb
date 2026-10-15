class ScreenerAnswer < ApplicationRecord
  include AgencyScoped

  belongs_to :lead

  # Health data: encrypted at rest, never logged (docs/conventions/sensitive-data.md).
  encrypts :answer

  MEETS_REQUIREMENTS = %w[yes review no].freeze

  validates :question, presence: true
  validates :meets_requirement, inclusion: { in: MEETS_REQUIREMENTS }, allow_nil: true
end
