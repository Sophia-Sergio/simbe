module Metrics
  # Raised when a caller asks for a range outside RANGES. The controllers map it to
  # `422 { error: { code: "bad_range" } }` (contracts/openapi/openapi.yaml, Invalid).
  BadRange = Class.new(StandardError)
end
