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

    # Stamp the signed-in agency, and refuse an explicit agency_id that is not the signed-in
    # one: the default_scope hides reads, but a write must never be able to target another
    # tenant (docs/conventions/multi-tenancy.md).
    before_validation do
      self.agency_id ||= Current.agency&.id
      errors.add(:agency_id, :invalid) if Current.agency && agency_id != Current.agency.id
    end
  end
end
