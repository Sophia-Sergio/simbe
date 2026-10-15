# Registry of tenant-scoped routes for the isolation spec (docs/conventions/multi-tenancy.md).
# Each lane registers its routes in spec/support/isolation/<lane>.rb; the files are auto-required below.
#
# Downstream lanes prove a tenant route is isolated with the shared example in
# spec/support/shared_examples/agency_isolated.rb:
#
#   include_examples "agency isolated", :get, ->(other) { "/api/v1/leads/#{other.id}" }
#
# Scope `:self`/`:public` routes carry no other agency's id and are exempt from that check.
module Isolation
  Entry = Struct.new(:method, :path, :scope, keyword_init: true)
  REGISTRY = []

  def self.register(method:, path:, scope: :tenant)
    REGISTRY << Entry.new(method: method, path: path, scope: scope)
  end
end

Dir[File.join(__dir__, "isolation", "*.rb")].sort.each { |file| require file }
