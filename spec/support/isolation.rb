# Registry of tenant-scoped routes for the isolation spec (docs/conventions/multi-tenancy.md).
# Each lane registers its routes in spec/support/isolation/<lane>.rb; the files are auto-required below.
module Isolation
  Entry = Struct.new(:method, :path, :scope, keyword_init: true)
  REGISTRY = []

  def self.register(method:, path:, scope: :tenant)
    REGISTRY << Entry.new(method: method, path: path, scope: scope)
  end
end

Dir[File.join(__dir__, "isolation", "*.rb")].sort.each { |file| require file }
