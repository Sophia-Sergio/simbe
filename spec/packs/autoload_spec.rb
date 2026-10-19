require "rails_helper"

RSpec.describe "packs" do
  PACKS = %w[identity ingest leads metrics agent mcp].freeze

  it "autoloads and eager-loads every pack's app dirs" do
    dirs = Rails.autoloaders.main.dirs
    PACKS.each do |pack|
      %w[models controllers services serializers jobs mailers].each do |type|
        expect(dirs).to include(Rails.root.join("app/packs/#{pack}/app/#{type}").to_s), "#{pack}/#{type} missing from autoload paths"
      end
    end
  end

  it "has a clean zeitwerk eager load" do
    expect { Rails.application.eager_load! }.not_to raise_error
  end
end
