FactoryBot.define do
  factory :agency do
    sequence(:name) { |n| "Agency #{n}" }
    sequence(:slug) { |n| "agency-#{n}" }
    timezone { "America/Los_Angeles" }
    qualified_milestone { "consult_attended" }
  end
end
