class User < ApplicationRecord
  has_secure_password

  belongs_to :agency
  has_many :auth_sessions, dependent: :destroy

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: %w[owner coordinator] }
  validates :coordinator_name, presence: true, if: -> { role == "coordinator" }

  def owner? = role == "owner"
  def coordinator? = role == "coordinator"
end
