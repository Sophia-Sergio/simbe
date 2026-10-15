# No agency_id: reached only through its conversation, which carries the tenant
# (docs/conventions/multi-tenancy.md).
class AgentMessage < ApplicationRecord
  belongs_to :conversation, class_name: "AgentConversation", inverse_of: :agent_messages

  ROLES = %w[user assistant].freeze

  validates :role, inclusion: { in: ROLES }
end
