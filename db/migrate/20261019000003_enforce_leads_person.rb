# Every lead has a person, in its own agency. The foreign key is immediate (not deferred): the importer
# COPYs the people before the leads. A deferred key queued one check per lead until commit and made a
# 30k-lead import several times slower.
class EnforceLeadsPerson < ActiveRecord::Migration[8.1]
  def change
    change_column_null :leads, :person_id, false
    add_index :leads, %i[agency_id person_id]
    add_foreign_key :leads, :people, column: %i[agency_id person_id], primary_key: %i[agency_id id]
  end
end
