# The exports carry no ad spend, so Simbe no longer stores or invents it. Drops the sample
# spend ledger and the stub ad-account connections that existed only to generate it.
class DropAdSpendAndConnections < ActiveRecord::Migration[8.1]
  def up
    drop_table :ad_spend_daily
    drop_table :ad_connections
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "ad spend was sample data; nothing to restore"
  end
end
