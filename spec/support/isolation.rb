# Registry of tenant-scoped routes for the isolation spec (docs/conventions/multi-tenancy.md).
# Each lane registers its routes in spec/support/isolation/<lane>.rb; the files are auto-required below.
#
# Downstream lanes prove a tenant route is isolated with the shared example in
# spec/support/shared_examples/agency_isolated.rb (see its header for the `let`s it needs).
# Registering a `:tenant` route REQUIRES `resource:` (a factory lambda: agency -> record) and
# `path_for:` (record -> path); spec/isolation/isolation_spec.rb then requests every tenant entry
# with another agency's resource and expects 404, so a lane cannot register a route and skip the
# check. Scope `:self`/`:public` routes carry no other agency's id and are exempt.
module Isolation
  Entry = Struct.new(:method, :path, :scope, :resource, :path_for, keyword_init: true)
  REGISTRY = []

  # path: the route as the router prints it ("/api/v1/leads/:id"); resource: ->(agency) { record };
  # path_for: ->(record) { "/api/v1/leads/#{record.id}" }
  def self.register(method:, path:, scope: :tenant, resource: nil, path_for: nil)
    if scope == :tenant && (resource.nil? || path_for.nil?)
      raise ArgumentError, "tenant route #{method.to_s.upcase} #{path} needs resource: and path_for: so isolation can be proven"
    end

    REGISTRY << Entry.new(method: method, path: path, scope: scope, resource: resource, path_for: path_for)
  end
end

Dir[File.join(__dir__, "isolation", "*.rb")].sort.each { |file| require file }
