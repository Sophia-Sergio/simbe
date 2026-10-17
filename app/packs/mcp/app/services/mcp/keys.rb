# MCP key management (spec 2013, decision 7). A key is `simbe_live_<32 urlsafe chars>`; only
# its SHA-256 digest and a visible prefix are stored, so the raw key is shown exactly once (at
# rotation) and can never be recovered later. Authentication is a constant-time digest compare
# and binds a key to exactly one agency: the requested slug must match the key's agency.
module Mcp
  module Keys
    RAW_PREFIX = "simbe_live_"
    # `simbe_live_` (11 chars) + the first 5 random chars, shown as `simbe_live_ab12…`.
    PREFIX_LENGTH = 16

    module_function

    # Revokes every active key for the agency, then creates and returns the new raw key. The
    # caller may display it once; it is never persisted (rotation revokes the old key immediately).
    def rotate!(agency:, user:)
      raw = RAW_PREFIX + SecureRandom.urlsafe_base64(24) # 24 bytes -> 32 urlsafe chars
      McpKey.for_agency(agency).active.update_all(revoked_at: Time.current, updated_at: Time.current)
      McpKey.create!(agency: agency, created_by: user, key_digest: digest_for(raw), prefix: raw[0, PREFIX_LENGTH])
      raw
    end

    # The key when the token is active AND belongs to `slug`'s agency; nil otherwise (revoked,
    # unknown or slug/key mismatch).
    def authenticate(token, slug:)
      key = active_key(token)
      return nil if key.nil? || key.agency.slug.to_s != slug.to_s

      key
    end

    # The active key for a token regardless of slug. Lets the endpoint tell an invalid/revoked key
    # (401) from a valid key used with the wrong slug (404) without trusting either to the other.
    def active_key(token)
      return nil if token.blank?

      digest = digest_for(token)
      McpKey.active.find_each do |key|
        return key if ActiveSupport::SecurityUtils.secure_compare(key.key_digest, digest)
      end
      nil
    end

    def digest_for(token)
      Digest::SHA256.hexdigest(token.to_s)
    end
  end
end
