class AiUsageEvent < ApplicationRecord
  include AgencyScoped

  belongs_to :user
  belongs_to :conversation, class_name: "AgentConversation", optional: true

  validates :task, :model, presence: true
end
