# Metrics + actions domain: per-day ad spend (metrics pack) and per-user action completions
# (leads pack). Both are agency-scoped.
class CreateMetricsTables < ActiveRecord::Migration[8.1]
  def change
    create_table :ad_spend_daily, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.date :date, null: false
      t.string :platform, null: false
      t.string :channel
      t.string :campaign
      t.bigint :spend_cents, null: false, default: 0
      t.string :source, null: false, default: "sample"
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id date platform channel campaign], unique: true,
        name: "index_ad_spend_daily_unique"
    end
    add_check_constraint :ad_spend_daily, "platform IN ('meta','google')", name: "ad_spend_daily_platform_check"
    add_check_constraint :ad_spend_daily, "source IN ('sample','import','connected')", name: "ad_spend_daily_source_check"

    create_table :action_completions, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.uuid :user_id, null: false
      t.uuid :lead_external_id, null: false
      t.string :queue, null: false
      t.timestamptz :snapshot_as_of, null: false
      t.timestamptz :completed_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id user_id lead_external_id queue snapshot_as_of], unique: true,
        name: "index_action_completions_unique"
    end
  end
end
