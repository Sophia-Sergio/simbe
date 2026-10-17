class Invitation < ApplicationRecord
  include AgencyScoped

  ROLES = %w[coordinator].freeze
  TTL = 7.days

  belongs_to :invited_by, class_name: "User", foreign_key: :invited_by, optional: true, inverse_of: false

  validates :email, presence: true
  validates :role, inclusion: { in: ROLES }
  validates :expires_at, presence: true
  validates :token_digest, presence: true, uniqueness: true
end
