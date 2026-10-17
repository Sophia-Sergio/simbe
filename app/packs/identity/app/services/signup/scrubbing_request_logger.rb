# Replaces Rails::Rack::Logger so the "Started GET …" line never contains an invitation token.
# The rest of the middleware stack (routing included) still sees the real path.
module Signup
  class ScrubbingRequestLogger < Rails::Rack::Logger
    private

    def started_request_message(request)
      path = request.filtered_path
      super.sub(path, Signup::TokenPathScrubber.redact(path))
    end
  end
end
