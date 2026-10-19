require "rails_helper"
RSpec.describe "schema" do
  conn = ActiveRecord::Base.connection
  tenant_tables = conn.tables.reject { _1.match?(/\Asolid_queue_/) } - %w[schema_migrations ar_internal_metadata agencies]

  it "creates every table the app needs" do
    expect(conn.tables).to include(*%w[agencies users auth_sessions leads stage_events contacts screener_answers web_sessions appointments applications
      lead_facts snapshots snapshot_uploads action_completions invitations agent_conversations agent_messages ai_usage_events mcp_keys])
  end

  tenant_tables.reject { _1.in?(%w[auth_sessions agent_messages]) }.each do |t|
    it "#{t} has agency_id NOT NULL and an index that starts with it" do
      col = conn.columns(t).find { _1.name == "agency_id" }
      expect(col).to be_present
      expect(col.null).to be(false)
      expect(conn.indexes(t).any? { _1.columns.first == "agency_id" }).to be(true), "#{t} needs an index on agency_id first"
    end
  end

  it "encrypts screener answers at rest" do
    agency = create(:agency); Current.agency = agency
    lead = Lead.create!(external_id: SecureRandom.uuid, lead_created_at: Time.current, channel: "Unknown", current_stage: "pre_screen", outcome: "open")
    sa = ScreenerAnswer.create!(lead: lead, submitted_at: Time.current, question: "How old are you?", answer: "36", meets_requirement: "yes")
    raw = conn.select_value("select answer from screener_answers where id = '#{sa.id}'")
    expect(raw).not_to eq("36"); expect(sa.reload.answer).to eq("36")
  end

  it "enforces unique external_id per agency but allows it across agencies" do
    attrs = { external_id: SecureRandom.uuid, lead_created_at: Time.current, channel: "Unknown", current_stage: "pre_screen", outcome: "open" }
    Current.agency = create(:agency); Lead.create!(attrs)
    expect { Lead.create!(attrs) }.to raise_error(ActiveRecord::RecordNotUnique)
    Current.agency = create(:agency); expect { Lead.create!(attrs) }.not_to raise_error
  end

  it "cascades lead children and lead_facts on delete" do
    Current.agency = create(:agency)
    lead = Lead.create!(external_id: SecureRandom.uuid, lead_created_at: Time.current, channel: "Unknown", current_stage: "pre_screen", outcome: "open")
    StageEvent.create!(lead: lead, stage: "inquiry", entered_at: Time.current)
    LeadFact.create!(lead: lead, furthest_stage: "inquiry")
    lead.delete
    expect(StageEvent.count + LeadFact.count).to eq(0)
  end
end
