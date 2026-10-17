# Invitation tokens are part of the public URL, so they would otherwise be written verbatim
# into request logs. Both the Rails request logger and lograge's structured `path` go through
# here.
module Signup
  module TokenPathScrubber
    FILTERED = "[FILTERED]".freeze
    TOKEN_PATH = %r{/api/v1/invitations/[^/]+/(preview|accept)}

    def self.redact(path)
      return path if path.blank?

      path.sub(TOKEN_PATH) { "/api/v1/invitations/#{FILTERED}/#{Regexp.last_match(1)}" }
    end
  end
end
