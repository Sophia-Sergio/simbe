# Every lead has a person, in its own agency. The foreign key is deferred so the importer can COPY the
# leads first and the people after, in one transaction (checked at commit).
class EnforceLeadsPerson < ActiveRecord::Migration[8.1]
  def change
    change_column_null :leads, :person_id, false
    add_index :leads, %i[agency_id person_id]
    add_foreign_key :leads, :people, column: %i[agency_id person_id], primary_key: %i[agency_id id], deferrable: :deferred
  end
end
