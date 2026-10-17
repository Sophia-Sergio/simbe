# No agency_id: reached only through its conversation, which carries the tenant
# (docs/conventions/multi-tenancy.md). The default_scope still pins it to Current.agency's
# conversations, so a message can never be read or written across agencies.
class AgentMessage < ApplicationRecord
  belongs_to :conversation, class_name: "AgentConversation", inverse_of: :agent_messages

  ROLES = %w[user assistant].freeze

  default_scope do
    raise Agency::MissingContext, "Current.agency is not set" unless Current.agency
    where(conversation_id: AgentConversation.where(agency_id: Current.agency.id).select(:id))
  end

  validates :role, inclusion: { in: ROLES }
end
