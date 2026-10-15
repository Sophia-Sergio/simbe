# Agency isolation (docs/conventions/multi-tenancy.md): every tenant model reads and
# writes only the signed-in agency's rows, and refuses to run without Current.agency.
module AgencyScoped
  extend ActiveSupport::Concern

  included do
    belongs_to :agency

    default_scope do
      raise Agency::MissingContext, "Current.agency is not set" unless Current.agency
      where(agency_id: Current.agency.id)
    end

    before_validation { self.agency_id ||= Current.agency&.id }
  end
end
