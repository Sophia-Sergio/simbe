require "rails_helper"

# docs/conventions/database.md: timestamps are timestamptz, stored in UTC.
RSpec.describe "timestamp columns" do
  it "are all timestamptz (Solid Queue's own tables aside)" do
    conn = ActiveRecord::Base.connection
    # Solid Queue's own tables and Rails' bookkeeping table are not Simbe tables.
    ignored = %w[ar_internal_metadata schema_migrations]
    offenders = conn.tables.reject { |t| t.start_with?("solid_queue_") || ignored.include?(t) }.flat_map do |table|
      conn.columns(table).select { |column| column.name.end_with?("_at") }.filter_map do |column|
        "#{table}.#{column.name} is #{column.sql_type}" unless column.sql_type == "timestamp with time zone"
      end
    end
    expect(offenders).to be_empty
  end
end
