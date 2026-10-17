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

  describe "references that must stay inside one agency" do
    let!(:own_user) { create(:user, agency: agency) }
    let!(:foreign_user) { create(:user, agency: other) }
    let(:conn) { ActiveRecord::Base.connection }

    # A failed statement aborts the example's transaction; a savepoint keeps it usable for the next check.
    def rejected(&block)
      expect { conn.transaction(requires_new: true, &block) }.to raise_error(ActiveRecord::InvalidForeignKey)
    end

    def insert_snapshot(loaded_by: nil, upload_id: nil)
      conn.execute(
        "INSERT INTO snapshots (id, agency_id, as_of, loaded_by, upload_id, created_at, updated_at) " \
        "VALUES (gen_random_uuid(), '#{agency.id}', now(), #{conn.quote(loaded_by)}, #{conn.quote(upload_id)}, now(), now())"
      )
    end

    it "accepts the agency's own user and rejects another agency's user (snapshots.loaded_by)" do
      expect { insert_snapshot(loaded_by: own_user.id) }.not_to raise_error
      rejected { insert_snapshot(loaded_by: foreign_user.id) }
    end

    it "rejects another agency's user for invitations.invited_by and mcp_keys.created_by" do
      rejected do
        conn.execute("INSERT INTO invitations (id, agency_id, invited_by, email, role, token_digest, expires_at, created_at, updated_at) " \
                     "VALUES (gen_random_uuid(), '#{agency.id}', '#{foreign_user.id}', 'a@b.test', 'coordinator', 'd1', now(), now(), now())")
      end
      rejected do
        conn.execute("INSERT INTO mcp_keys (id, agency_id, key_digest, prefix, created_by, created_at, updated_at) " \
                     "VALUES (gen_random_uuid(), '#{agency.id}', 'd2', 'p', '#{foreign_user.id}', now(), now())")
      end
    end

    it "rejects another agency's snapshot for snapshot_uploads.snapshot_id and another agency's upload for snapshots.upload_id" do
      foreign_snapshot_id = conn.select_value(
        "INSERT INTO snapshots (id, agency_id, as_of, created_at, updated_at) VALUES (gen_random_uuid(), '#{other.id}', now(), now(), now()) RETURNING id"
      )
      rejected do
        conn.execute("INSERT INTO snapshot_uploads (id, agency_id, user_id, snapshot_id, status, created_at, updated_at) " \
                     "VALUES (gen_random_uuid(), '#{agency.id}', '#{own_user.id}', '#{foreign_snapshot_id}', 'committed', now(), now())")
      end

      foreign_upload_id = conn.select_value(
        "INSERT INTO snapshot_uploads (id, agency_id, user_id, status, created_at, updated_at) " \
        "VALUES (gen_random_uuid(), '#{other.id}', '#{foreign_user.id}', 'validated', now(), now()) RETURNING id"
      )
      rejected { insert_snapshot(upload_id: foreign_upload_id) }
    end

    it "rejects another agency's conversation for ai_usage_events.conversation_id" do
      foreign_conversation_id = conn.select_value(
        "INSERT INTO agent_conversations (id, agency_id, user_id, created_at, updated_at) " \
        "VALUES (gen_random_uuid(), '#{other.id}', '#{foreign_user.id}', now(), now()) RETURNING id"
      )
      rejected do
        conn.execute("INSERT INTO ai_usage_events (id, agency_id, user_id, conversation_id, created_at, updated_at) " \
                     "VALUES (gen_random_uuid(), '#{agency.id}', '#{own_user.id}', '#{foreign_conversation_id}', now(), now())")
      end
    end
  end
end
