# Gives every existing lead a person: one per distinct normalised email in an agency, and one per
# lead with a blank email. Plain SQL and idempotent, so it does not depend on application code.
class BackfillPeople < ActiveRecord::Migration[8.1]
  KEY = "NULLIF(lower(btrim(%s)), '')".freeze

  def up
    key = format(KEY, "l.email")

    execute "UPDATE leads l SET person_id = gen_random_uuid() WHERE l.person_id IS NULL AND #{key} IS NULL"
    execute <<~SQL
      INSERT INTO people (id, agency_id, email_key, created_at, updated_at)
      SELECT l.person_id, l.agency_id, NULL, now(), now() FROM leads l
      WHERE #{key} IS NULL AND NOT EXISTS (SELECT 1 FROM people p WHERE p.id = l.person_id)
    SQL
    execute <<~SQL
      INSERT INTO people (id, agency_id, email_key, created_at, updated_at)
      SELECT gen_random_uuid(), k.agency_id, k.email_key, now(), now()
      FROM (SELECT DISTINCT l.agency_id, #{key} AS email_key FROM leads l WHERE #{key} IS NOT NULL) k
      WHERE NOT EXISTS (SELECT 1 FROM people p WHERE p.agency_id = k.agency_id AND p.email_key = k.email_key)
    SQL
    execute <<~SQL
      UPDATE leads l SET person_id = p.id FROM people p
      WHERE l.person_id IS NULL AND p.agency_id = l.agency_id AND p.email_key = #{key}
    SQL
  end

  def down; end
end
