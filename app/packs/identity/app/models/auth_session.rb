class AuthSession < ApplicationRecord
  TTL = 14.days

  belongs_to :user

  def self.issue!(user)
    token = SecureRandom.urlsafe_base64(32)
    create!(user: user, token_digest: digest(token), expires_at: TTL.from_now)
    token
  end

  def self.find_by_token(token)
    return if token.blank?

    where("expires_at > ?", Time.current).find_by(token_digest: digest(token))
  end

  def self.digest(token) = OpenSSL::Digest::SHA256.hexdigest(token)
end
