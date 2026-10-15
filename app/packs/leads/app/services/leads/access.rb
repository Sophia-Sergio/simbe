# Role-scoped read access to leads (docs/conventions/multi-tenancy.md): an owner sees the
# whole agency, a coordinator only the leads whose coordinator_name matches their own. The
# default_scope on Lead already narrows every relation to the signed-in agency.
#
# `Leads` is the pack namespace; `Lead` (singular) is the model.
module Leads
  module Access
    # -> Lead relation. Owner: every lead in the agency. Coordinator: only their own leads.
    def self.relation(user)
      return Lead.all if user.owner?

      Lead.where(coordinator_name: user.coordinator_name)
    end
  end
end
