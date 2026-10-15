require "rails_helper"

# docs/conventions/database.md, multi-tenancy.md: a child row can never point at another
# agency's lead or user, even via a raw insert.
RSpec.describe "tenant foreign keys" do
  let(:agency) { create(:agency) }
  let(:other) { create(:agency) }
  before { Current.agency = agency }

  def lead!(scope_agency = agency)
    previous = Current.agency
    Current.agency = scope_agency
    Lead.create!(external_id: SecureRandom.uuid, lead_created_at: Time.current, channel: "Unknown",
                 current_stage: "pre_screen", outcome: "open")
  ensure
    Current.agency = previous
  end

  it "rejects a child row whose agency_id differs from its lead's agency (composite FK)" do
    lead = lead!
    expect {
      ActiveRecord::Base.connection.execute(
        "INSERT INTO stage_events (id, agency_id, lead_id, stage, entered_at, created_at, updated_at) " \
        "VALUES (gen_random_uuid(), '#{other.id}', '#{lead.id}', 'inquiry', now(), now(), now())"
      )
    }.to raise_error(ActiveRecord::InvalidForeignKey)
  end

  it "rejects building a child with another agency's id through the model" do
    lead = lead!
    record = StageEvent.new(lead: lead, stage: "inquiry", entered_at: Time.current, agency_id: other.id)
    expect(record).not_to be_valid
    expect(record.errors[:agency_id]).to be_present
  end

  it "rejects a user reference outside the agency on tenant tables" do
    expect {
      ActiveRecord::Base.connection.execute(
        "INSERT INTO snapshots (id, agency_id, as_of, loaded_by, created_at, updated_at) " \
        "VALUES (gen_random_uuid(), '#{agency.id}', now(), '#{other.id}', now(), now())"
      )
    }.to raise_error(ActiveRecord::InvalidForeignKey)
  end
end
