class StageEvent < ApplicationRecord
  include AgencyScoped

  belongs_to :lead

  STAGES = Lead::STAGES

  validates :stage, inclusion: { in: STAGES }
end
