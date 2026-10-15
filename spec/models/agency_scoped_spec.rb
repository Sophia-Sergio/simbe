require "rails_helper"

RSpec.describe AgencyScoped do
  before(:all) do
    ActiveRecord::Schema.define do
      create_table :scoped_widgets, id: :uuid, force: true do |t|
        t.uuid :agency_id, null: false
        t.string :name
      end
    end
    Object.const_set(:ScopedWidget, Class.new(ApplicationRecord) do
      self.table_name = "scoped_widgets"
      include AgencyScoped
    end)
  end
  after(:all) do
    Object.send(:remove_const, :ScopedWidget) if Object.const_defined?(:ScopedWidget)
    ActiveRecord::Schema.define { drop_table :scoped_widgets, if_exists: true }
  end

  let(:a) { create(:agency) }
  let(:b) { create(:agency) }

  it "only returns the current agency's rows and stamps agency_id" do
    Current.agency = b
    ScopedWidget.create!(name: "b-row")
    Current.agency = a
    mine = ScopedWidget.create!(name: "a-row")
    expect(mine.agency_id).to eq(a.id)
    expect(ScopedWidget.pluck(:name)).to eq([ "a-row" ])
  end

  it "raises without a current agency" do
    Current.agency = nil
    expect { ScopedWidget.all.to_a }.to raise_error(Agency::MissingContext)
  end
end
