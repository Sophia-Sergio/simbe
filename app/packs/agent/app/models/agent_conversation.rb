class AgentConversation < ApplicationRecord
  include AgencyScoped

  belongs_to :user
  has_many :agent_messages, dependent: :delete_all
end
