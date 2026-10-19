require "rails_helper"

# A person is one email inside one agency; a lead (one inquiry) belongs to a person
# (docs/superpowers/specs/2026-10/2026-10-19-0128-linked-inquiries-design.md, decisions 1-3).
RSpec.describe Person do
  let(:agency) { create(:agency) }
  let(:other) { create(:agency) }
  before { Current.agency = agency }

  def lead!(email:, in_agency: agency)
    previous = Current.agency
    Current.agency = in_agency
    Lead.create!(external_id: SecureRandom.uuid, lead_created_at: Time.current, channel: "Unknown",
                 current_stage: "pre_screen", outcome: "open", email: email)
  ensure
    Current.agency = previous
  end

  it "gives two leads with the same email (any case or spacing) one person" do
    first = lead!(email: "Nicole@Example.com")
    second = lead!(email: "  nicole@example.com ")

    expect(second.person_id).to eq(first.person_id)
    expect(first.person.email_key).to eq("nicole@example.com")
  end

  it "gives each blank-email lead its own person with no email key" do
    first = lead!(email: "  ")
    second = lead!(email: nil)

    expect(first.person_id).not_to eq(second.person_id)
    expect([ first.person.email_key, second.person.email_key ]).to eq([ nil, nil ])
  end

  it "never shares a person between agencies, even for the same email" do
    mine = lead!(email: "same@example.com")
    theirs = lead!(email: "same@example.com", in_agency: other)

    expect(theirs.person_id).not_to eq(mine.person_id)
    expect(Person.unscoped.find(theirs.person_id).agency_id).to eq(other.id)
  end

  it "refuses a lead that points at another agency's person" do
    mine = lead!(email: "mine@example.com")
    foreign = lead!(email: "theirs@example.com", in_agency: other)

    expect { mine.update_columns(person_id: foreign.person_id) }.to raise_error(ActiveRecord::InvalidForeignKey)
  end

  it "backfills people for leads that have none, once" do
    shared_a = lead!(email: "Shared@Example.com")
    shared_b = lead!(email: "shared@example.com")
    blank = lead!(email: nil)
    # The backfill runs before the foreign key exists in a real database: put the table back in that state.
    fk = Lead.connection.foreign_keys("leads").find { |key| key.to_table == "people" }
    Lead.connection.execute("ALTER TABLE leads DROP CONSTRAINT #{fk.name}")
    Lead.connection.execute("ALTER TABLE leads ALTER COLUMN person_id DROP NOT NULL")
    Lead.unscoped.where(agency_id: agency.id).update_all(person_id: nil)
    Person.unscoped.where(agency_id: agency.id).delete_all

    load Rails.root.join(Dir[Rails.root.join("db/migrate/*_backfill_people.rb")].first)
    2.times { BackfillPeople.new.up }

    people = Person.unscoped.where(agency_id: agency.id)
    expect(people.count).to eq(2)
    expect(shared_a.reload.person_id).to eq(shared_b.reload.person_id)
    expect(blank.reload.person_id).not_to eq(shared_a.person_id)
    expect(people.pluck(:email_key)).to contain_exactly("shared@example.com", nil)
  end
end
