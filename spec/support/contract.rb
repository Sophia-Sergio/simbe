# OpenAPI request/response conformance for request specs (spec 2101, decision 8).
#
# Registers the bundled contract and observes the Rails app so every request spec
# validates its request and response against the documented operation. Any violation
# fails the example.
#
# The bundle is OpenAPI 3.1; openapi_first (>= 3) reads it directly (json_schemer
# 2020-12), so the `committee` + 3.0-downlevel fallback is not needed.
require "openapi_first"

CONTRACT_BUNDLE = Rails.root.join("contracts/dist/openapi.bundled.yaml").to_s

unless File.exist?(CONTRACT_BUNDLE)
  raise "Missing #{CONTRACT_BUNDLE}. Build it with `make contract` (or run specs via `make spec`)."
end

# The contract documents its paths under the `/api/v1` server; openapi_first matches
# bare paths, so pass the server URL as a path prefix for it to strip before routing.
# Requests outside `/api/v1` (the SPA shell, /up, /missing.js …) are mapped to a
# sentinel path so they can never match a documented operation — SPA client routes
# like `/coordinators/Dana Ortiz` share the shape of `/coordinators/{name}`.
CONTRACT = OpenapiFirst.load(CONTRACT_BUNDLE, path_prefix: "/api/v1") do |config|
  config.path = ->(request) { "/__spa__#{request.path}" }
end

OpenapiFirst::Test.setup do |test|
  test.register(CONTRACT)
  test.observe(Rails.application)

  # Undocumented paths must not fail specs: spa_spec deliberately requests an unknown
  # /api/v1 path expecting a JSON 404, and /up is a Rails health route outside the
  # contract. Documented operations are still strictly validated.
  test.ignore_unknown_requests = true

  # Coverage is reported by `rake contract:coverage` (lib/tasks/contract.rake); the
  # normal suite must never exit(2) because other lanes' operations are uncovered.
  test.minimum_coverage = 0
  test.report_coverage = false
end
