-- Loads every agency folder under /exports into one database, tagged by agency_id.
-- Safe to re-run: each agency is replaced inside one transaction (full snapshot reload).
--
--   docker compose exec -T db psql -U harbor -d harbor -v ON_ERROR_STOP=1 < db/load.sql
--
-- Override the CSV location with -v exports_dir=/some/path (default /exports, the compose mount).

\set ON_ERROR_STOP 1
\if :{?exports_dir}
\else
  \set exports_dir '/exports'
\endif
SET client_min_messages = warning;
SELECT set_config('load.exports_dir', :'exports_dir', false) \g /dev/null

BEGIN;

-- ---------------------------------------------------------------- schema
CREATE TABLE IF NOT EXISTS agencies (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  timezone            text NOT NULL,
  qualified_milestone text NOT NULL
    CHECK (qualified_milestone IN ('application_submitted','consult_attended','records','accepted'))
);

INSERT INTO agencies (id, name, timezone, qualified_milestone) VALUES
  ('harbor',   'Harbor Surrogacy',         'America/Los_Angeles', 'consult_attended'),
  ('lakeside', 'Lakeside Family Building', 'America/Chicago',     'records')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, timezone = EXCLUDED.timezone, qualified_milestone = EXCLUDED.qualified_milestone;

CREATE TABLE IF NOT EXISTS leads (
  agency_id          text NOT NULL REFERENCES agencies(id),
  lead_id            uuid NOT NULL,
  created_at         timestamptz NOT NULL,
  first_name         text,
  last_name          text,
  email              text,
  phone              text,
  state              text,
  source             text,
  campaign           text,
  ad                 text,
  coordinator        text,
  current_stage      text NOT NULL,
  outcome            text NOT NULL,
  outcome_reason     text,
  outcome_updated_at timestamptz,
  paused_until       date,
  PRIMARY KEY (agency_id, lead_id)
);

CREATE TABLE IF NOT EXISTS stage_history (
  agency_id  text NOT NULL,
  lead_id    uuid NOT NULL,
  stage      text NOT NULL,
  entered_at timestamptz NOT NULL,
  PRIMARY KEY (agency_id, lead_id, stage),
  FOREIGN KEY (agency_id, lead_id) REFERENCES leads ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_log (
  agency_id    text NOT NULL,
  lead_id      uuid NOT NULL,
  contacted_at timestamptz NOT NULL,
  direction    text NOT NULL,
  channel      text NOT NULL,
  contacted_by text NOT NULL,
  PRIMARY KEY (agency_id, lead_id, contacted_at, direction, channel),
  FOREIGN KEY (agency_id, lead_id) REFERENCES leads ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS screener_answers (
  agency_id         text NOT NULL,
  lead_id           uuid NOT NULL,
  submitted_at      timestamptz NOT NULL,
  question          text NOT NULL,
  answer            text,
  meets_requirement text NOT NULL,
  PRIMARY KEY (agency_id, lead_id, question),
  FOREIGN KEY (agency_id, lead_id) REFERENCES leads ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_sessions (
  agency_id    text NOT NULL,
  lead_id      uuid NOT NULL,
  started_at   timestamptz NOT NULL,
  landing_url  text,
  pages_viewed text,
  referrer     text,
  device       text,
  PRIMARY KEY (agency_id, lead_id, started_at),
  FOREIGN KEY (agency_id, lead_id) REFERENCES leads ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  agency_id     text NOT NULL,
  lead_id       uuid NOT NULL,
  booked_at     timestamptz NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status        text NOT NULL,
  PRIMARY KEY (agency_id, lead_id, booked_at),
  FOREIGN KEY (agency_id, lead_id) REFERENCES leads ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applications (
  agency_id              text NOT NULL,
  lead_id                uuid NOT NULL,
  started_at             timestamptz NOT NULL,
  submitted_at           timestamptz,
  percent_complete       int NOT NULL,
  last_section_completed text,
  PRIMARY KEY (agency_id, lead_id, started_at),
  FOREIGN KEY (agency_id, lead_id) REFERENCES leads ON DELETE CASCADE
);

-- ---------------------------------------------------------------- load
-- Server-side COPY reads from the container's /exports mount (the harbor role is a superuser).
-- Child tables use ON DELETE CASCADE, so deleting an agency's leads clears its whole snapshot.
DO $$
DECLARE
  ag  text;
  dir text := current_setting('load.exports_dir');
BEGIN
  FOR ag IN SELECT id FROM agencies ORDER BY id LOOP
    DELETE FROM leads WHERE agency_id = ag;

    CREATE TEMP TABLE stg_leads (LIKE leads) ON COMMIT DROP;
    ALTER TABLE stg_leads DROP COLUMN agency_id;
    EXECUTE format('COPY stg_leads FROM %L WITH (FORMAT csv, HEADER true)', dir || '/' || ag || '/leads.csv');
    INSERT INTO leads SELECT ag, s.* FROM stg_leads s;
    DROP TABLE stg_leads;

    CREATE TEMP TABLE stg (LIKE stage_history) ON COMMIT DROP;
    ALTER TABLE stg DROP COLUMN agency_id;
    EXECUTE format('COPY stg FROM %L WITH (FORMAT csv, HEADER true)', dir || '/' || ag || '/stage_history.csv');
    INSERT INTO stage_history SELECT ag, s.* FROM stg s;
    DROP TABLE stg;

    CREATE TEMP TABLE stg (LIKE contact_log) ON COMMIT DROP;
    ALTER TABLE stg DROP COLUMN agency_id;
    EXECUTE format('COPY stg FROM %L WITH (FORMAT csv, HEADER true)', dir || '/' || ag || '/contact_log.csv');
    INSERT INTO contact_log SELECT ag, s.* FROM stg s;
    DROP TABLE stg;

    CREATE TEMP TABLE stg (LIKE screener_answers) ON COMMIT DROP;
    ALTER TABLE stg DROP COLUMN agency_id;
    EXECUTE format('COPY stg FROM %L WITH (FORMAT csv, HEADER true)', dir || '/' || ag || '/screener_answers.csv');
    INSERT INTO screener_answers SELECT ag, s.* FROM stg s;
    DROP TABLE stg;

    CREATE TEMP TABLE stg (LIKE web_sessions) ON COMMIT DROP;
    ALTER TABLE stg DROP COLUMN agency_id;
    EXECUTE format('COPY stg FROM %L WITH (FORMAT csv, HEADER true)', dir || '/' || ag || '/web_sessions.csv');
    INSERT INTO web_sessions SELECT ag, s.* FROM stg s;
    DROP TABLE stg;

    CREATE TEMP TABLE stg (LIKE appointments) ON COMMIT DROP;
    ALTER TABLE stg DROP COLUMN agency_id;
    EXECUTE format('COPY stg FROM %L WITH (FORMAT csv, HEADER true)', dir || '/' || ag || '/appointments.csv');
    INSERT INTO appointments SELECT ag, s.* FROM stg s;
    DROP TABLE stg;

    CREATE TEMP TABLE stg (LIKE applications) ON COMMIT DROP;
    ALTER TABLE stg DROP COLUMN agency_id;
    EXECUTE format('COPY stg FROM %L WITH (FORMAT csv, HEADER true)', dir || '/' || ag || '/applications.csv');
    INSERT INTO applications SELECT ag, s.* FROM stg s;
    DROP TABLE stg;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- views (see docs/tables-summary.md)
CREATE OR REPLACE VIEW lead_milestones AS
SELECT l.agency_id, l.lead_id, l.created_at,
  (SELECT MAX(a.submitted_at) FROM applications a
    WHERE a.agency_id = l.agency_id AND a.lead_id = l.lead_id)                           AS application_submitted_at,
  (SELECT MIN(p.scheduled_for) FROM appointments p
    WHERE p.agency_id = l.agency_id AND p.lead_id = l.lead_id AND p.status = 'attended') AS consult_attended_at,
  (SELECT s.entered_at FROM stage_history s
    WHERE s.agency_id = l.agency_id AND s.lead_id = l.lead_id AND s.stage = 'records')   AS records_at,
  (SELECT s.entered_at FROM stage_history s
    WHERE s.agency_id = l.agency_id AND s.lead_id = l.lead_id AND s.stage = 'accepted')  AS accepted_at
FROM leads l;

CREATE OR REPLACE VIEW lead_qualification AS
SELECT m.*, a.timezone,
  CASE a.qualified_milestone
    WHEN 'application_submitted' THEN m.application_submitted_at
    WHEN 'consult_attended'      THEN m.consult_attended_at
    WHEN 'records'               THEN m.records_at
    WHEN 'accepted'              THEN m.accepted_at
  END AS qualified_at
FROM lead_milestones m
JOIN agencies a ON a.id = m.agency_id;

COMMIT;

-- ---------------------------------------------------------------- summary
SELECT a.id AS agency,
  (SELECT count(*) FROM leads            WHERE agency_id = a.id) AS leads,
  (SELECT count(*) FROM stage_history    WHERE agency_id = a.id) AS stage_history,
  (SELECT count(*) FROM contact_log      WHERE agency_id = a.id) AS contact_log,
  (SELECT count(*) FROM screener_answers WHERE agency_id = a.id) AS screener_answers,
  (SELECT count(*) FROM web_sessions     WHERE agency_id = a.id) AS web_sessions,
  (SELECT count(*) FROM appointments     WHERE agency_id = a.id) AS appointments,
  (SELECT count(*) FROM applications     WHERE agency_id = a.id) AS applications,
  (SELECT count(qualified_at) FROM lead_qualification WHERE agency_id = a.id) AS qualified
FROM agencies a ORDER BY a.id;
