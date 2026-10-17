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
    # revoke and the insert are one transaction serialized on the agency row (`lock!`), so two
    # concurrent rotations leave exactly one active key and a failed insert never leaves the
    # agency keyless. The caller may display the key once; it is never persisted.
    def rotate!(agency:, user:)
      raw = RAW_PREFIX + SecureRandom.urlsafe_base64(24) # 24 bytes -> 32 urlsafe chars
      # requires_new: a savepoint under the spec-suite transaction, so a failed create! rolls
      # back only this rotation rather than poisoning the surrounding transaction.
      McpKey.transaction(requires_new: true) do
        agency.lock! # SELECT ... FOR UPDATE: serializes concurrent rotations for this agency
        McpKey.for_agency(agency).active.update_all(revoked_at: Time.current, updated_at: Time.current)
        McpKey.create!(agency: agency, created_by: user, key_digest: digest_for(raw), prefix: raw[0, PREFIX_LENGTH])
      end
      raw
    end

    # The key when the token is active, belongs to `slug`'s agency AND its creator is still an
    # owner there; nil otherwise (revoked, unknown, slug mismatch or an invalid actor).
    def authenticate(token, slug:)
      key = active_key(token)
      return nil if key.nil? || actor_for(key).nil?
      return nil if key.agency.slug.to_s != slug.to_s

      key
    end

    # The user an MCP key acts as: the owner who created it, and only while that user still exists,
    # is still an owner and belongs to the key's agency. A removed or demoted creator makes the key
    # invalid (401), and a key with no creator never nil-derefs.
    def actor_for(key)
      user = key.created_by
      return nil if user.nil?
      return nil unless user.agency_id == key.agency_id && user.owner?

      user
    end

    # The active key for a token regardless of slug. Lets the endpoint tell an invalid/revoked key
    # (401) from a valid key used with the wrong slug (404) without trusting either to the other.
    # `key_digest` is uniquely indexed, so this is one indexed lookup (never a scan of every key);
    # the constant-time compare stays as a sanity check.
    def active_key(token)
      return nil if token.blank?

      digest = digest_for(token)
      key = McpKey.active.find_by(key_digest: digest)
      return nil if key.nil? || !ActiveSupport::SecurityUtils.secure_compare(key.key_digest, digest)

      key
    end

    def digest_for(token)
      Digest::SHA256.hexdigest(token.to_s)
    end
  end
end
