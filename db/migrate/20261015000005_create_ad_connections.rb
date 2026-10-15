# Ad connections (connection pack): one connection per platform per agency.
class CreateAdConnections < ActiveRecord::Migration[8.1]
  def change
    create_table :ad_connections, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :platform, null: false
      t.string :status
      t.timestamptz :connected_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id platform], unique: true
    end
  end
end
