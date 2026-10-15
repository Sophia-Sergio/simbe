FactoryBot.define do
  factory :user do
    agency
    sequence(:email) { |n| "user#{n}@example.test" }
    name { "Test User" }
    password { "secret-pass-1" }
    role { "owner" }

    trait :coordinator do
      role { "coordinator" }
      coordinator_name { "Maya Chen" }
    end
  end
end
