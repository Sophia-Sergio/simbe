class AdSpendDay < ApplicationRecord
  include AgencyScoped

  self.table_name = "ad_spend_daily"

  PLATFORMS = %w[meta google].freeze
  SOURCES = %w[sample import connected].freeze

  validates :date, presence: true
  validates :platform, presence: true, inclusion: { in: PLATFORMS }
  validates :source, inclusion: { in: SOURCES }, allow_nil: true
  validates :spend_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
end
