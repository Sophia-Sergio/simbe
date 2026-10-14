-- Exploration queries for the loaded exports (see db/load.sql).
-- Every query is scoped to one agency or groups by agency_id; never mix agencies in one answer for a client.
-- Times are shown in the agency's own timezone (agencies.timezone); storage is UTC.


-- =====================================================================
-- 1. A successful case, end to end: one accepted HARBOR lead's timeline
--    Swap the lead: in `picked`, replace the WHERE/ORDER/LIMIT with  WHERE l.lead_id = '<lead_id>'
-- =====================================================================
WITH picked AS (
  SELECT l.agency_id, l.lead_id, a.timezone FROM leads l JOIN agencies a ON a.id = l.agency_id
  WHERE l.agency_id = 'harbor' AND l.outcome = 'accepted' AND l.source IS NOT NULL
  ORDER BY l.created_at LIMIT 1
),
events AS (
  SELECT w.started_at AS at, 'web visit' AS kind,
         coalesce(split_part(w.landing_url, '?', 1), '') || ' (' || w.device || ')' AS detail
  FROM web_sessions w JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT s.entered_at, 'stage', s.stage FROM stage_history s JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT c.contacted_at, 'contact', c.direction || ' ' || c.channel || ' by ' || c.contacted_by
  FROM contact_log c JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT a.started_at, 'application', 'started' FROM applications a JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT a.submitted_at, 'application', 'submitted (' || a.percent_complete || '%)'
  FROM applications a JOIN picked USING (agency_id, lead_id) WHERE a.submitted_at IS NOT NULL
  UNION ALL
  SELECT p.booked_at, 'consult', 'booked for ' || to_char(p.scheduled_for AT TIME ZONE picked.timezone, 'YYYY-MM-DD')
  FROM appointments p JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT p.scheduled_for, 'consult', p.status FROM appointments p JOIN picked USING (agency_id, lead_id)
)
SELECT to_char(e.at AT TIME ZONE p.timezone, 'YYYY-MM-DD HH24:MI') AS local_time,
       e.kind, e.detail,
       (e.at AT TIME ZONE p.timezone)::date - first_value((e.at AT TIME ZONE p.timezone)::date) OVER (ORDER BY e.at) AS day_n
FROM events e CROSS JOIN picked p
ORDER BY e.at;


-- =====================================================================
-- 2. Same, for LAKESIDE (only the agency filter changes)
-- =====================================================================
WITH picked AS (
  SELECT l.agency_id, l.lead_id, a.timezone FROM leads l JOIN agencies a ON a.id = l.agency_id
  WHERE l.agency_id = 'lakeside' AND l.outcome = 'accepted' AND l.source IS NOT NULL
  ORDER BY l.created_at LIMIT 1
),
events AS (
  SELECT w.started_at AS at, 'web visit' AS kind,
         coalesce(split_part(w.landing_url, '?', 1), '') || ' (' || w.device || ')' AS detail
  FROM web_sessions w JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT s.entered_at, 'stage', s.stage FROM stage_history s JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT c.contacted_at, 'contact', c.direction || ' ' || c.channel || ' by ' || c.contacted_by
  FROM contact_log c JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT a.started_at, 'application', 'started' FROM applications a JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT a.submitted_at, 'application', 'submitted (' || a.percent_complete || '%)'
  FROM applications a JOIN picked USING (agency_id, lead_id) WHERE a.submitted_at IS NOT NULL
  UNION ALL
  SELECT p.booked_at, 'consult', 'booked for ' || to_char(p.scheduled_for AT TIME ZONE picked.timezone, 'YYYY-MM-DD')
  FROM appointments p JOIN picked USING (agency_id, lead_id)
  UNION ALL
  SELECT p.scheduled_for, 'consult', p.status FROM appointments p JOIN picked USING (agency_id, lead_id)
)
SELECT to_char(e.at AT TIME ZONE p.timezone, 'YYYY-MM-DD HH24:MI') AS local_time,
       e.kind, e.detail,
       (e.at AT TIME ZONE p.timezone)::date - first_value((e.at AT TIME ZONE p.timezone)::date) OVER (ORDER BY e.at) AS day_n
FROM events e CROSS JOIN picked p
ORDER BY e.at;


-- =====================================================================
-- 3. Funnel: leads reaching each stage, % of all leads, % of previous stage
-- =====================================================================
WITH stages(stage, ord) AS (
  VALUES ('inquiry',1), ('pre_screen',2), ('application',3), ('consult',4), ('records',5), ('accepted',6)
),
reached AS (
  SELECT s.agency_id, st.stage, st.ord, count(*) AS leads
  FROM stage_history s JOIN stages st USING (stage)
  GROUP BY 1, 2, 3
)
SELECT agency_id, stage, leads,
       round(100.0 * leads / first_value(leads) OVER w, 1) AS pct_of_all_leads,
       round(100.0 * leads / lag(leads) OVER w, 1)         AS pct_of_previous_stage
FROM reached
WINDOW w AS (PARTITION BY agency_id ORDER BY ord)
ORDER BY agency_id, ord;


-- =====================================================================
-- 4. Where leads are now: current stage x outcome, % of the agency
-- =====================================================================
SELECT agency_id, current_stage, outcome, count(*) AS leads,
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY agency_id), 1) AS pct
FROM leads
GROUP BY 1, 2, 3
ORDER BY agency_id, array_position(ARRAY['pre_screen','application','consult','records','accepted'], current_stage), leads DESC;


-- =====================================================================
-- 5. Why leads drop out: every reason as % of all leads
-- =====================================================================
SELECT agency_id, outcome, outcome_reason, count(*) AS leads,
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY agency_id), 1) AS pct_of_all_leads
FROM leads
WHERE outcome IN ('not_eligible', 'unresponsive', 'withdrew')
GROUP BY 1, 2, 3
ORDER BY agency_id, leads DESC;


-- =====================================================================
-- 6. Channel performance: volume, qualified %, accepted % per normalized source
--    (source spellings are inconsistent: fb/Facebook/facebook, ig/instagram, Google/google)
-- =====================================================================
WITH chan AS (
  SELECT q.agency_id, q.lead_id, q.qualified_at, l.outcome,
         CASE lower(coalesce(l.source, ''))
           WHEN 'facebook' THEN 'Facebook'  WHEN 'fb'        THEN 'Facebook'
           WHEN 'instagram' THEN 'Instagram' WHEN 'ig'       THEN 'Instagram'
           WHEN 'google'   THEN 'Google'    WHEN 'tiktok'    THEN 'TikTok'
           WHEN 'referral' THEN 'Referral'  WHEN ''          THEN '(untagged)'
           ELSE l.source END AS channel
  FROM lead_qualification q JOIN leads l USING (agency_id, lead_id)
)
SELECT agency_id, channel, count(*) AS leads,
       count(qualified_at) AS qualified,
       round(100.0 * count(qualified_at) / count(*), 1) AS qualified_pct,
       round(100.0 * count(*) FILTER (WHERE outcome = 'accepted') / count(*), 1) AS accepted_pct
FROM chan
GROUP BY 1, 2
ORDER BY agency_id, leads DESC;


-- =====================================================================
-- 7. Campaign / ad performance (tagged leads only), best qualified rate first
-- =====================================================================
SELECT q.agency_id, l.campaign, coalesce(l.ad, '-') AS ad, count(*) AS leads,
       count(q.qualified_at) AS qualified,
       round(100.0 * count(q.qualified_at) / count(*), 1) AS qualified_pct
FROM lead_qualification q JOIN leads l USING (agency_id, lead_id)
WHERE l.campaign IS NOT NULL
GROUP BY 1, 2, 3
HAVING count(*) >= 30
ORDER BY agency_id, qualified_pct DESC;


-- =====================================================================
-- 8. Screener: % of leads failing each criterion (a lead can fail several)
-- =====================================================================
SELECT s.agency_id, s.question,
       count(*) FILTER (WHERE s.meets_requirement = 'no')     AS failed,
       count(*) FILTER (WHERE s.meets_requirement = 'review') AS review,
       round(100.0 * count(*) FILTER (WHERE s.meets_requirement = 'no') / count(*), 1) AS failed_pct
FROM screener_answers s
GROUP BY 1, 2
HAVING count(*) FILTER (WHERE s.meets_requirement <> 'yes') > 0
ORDER BY agency_id, failed DESC;


-- =====================================================================
-- 9. Speed to lead per coordinator: hours from signup to first outbound touch
--    (business-hours effects not adjusted; median is more honest than average)
-- =====================================================================
WITH first_touch AS (
  SELECT l.agency_id, l.lead_id, l.coordinator, l.outcome,
         min(c.contacted_at) - l.created_at AS wait
  FROM leads l
  JOIN contact_log c ON c.agency_id = l.agency_id AND c.lead_id = l.lead_id AND c.direction = 'outbound'
  GROUP BY 1, 2, 3, 4, l.created_at
)
SELECT agency_id, coordinator, count(*) AS leads,
       round((extract(epoch FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY wait)) / 3600)::numeric, 1) AS median_hours,
       round((extract(epoch FROM percentile_cont(0.9) WITHIN GROUP (ORDER BY wait)) / 3600)::numeric, 1) AS p90_hours,
       round(100.0 * count(*) FILTER (WHERE outcome = 'unresponsive') / count(*), 1) AS unresponsive_pct
FROM first_touch
GROUP BY 1, 2
ORDER BY agency_id, median_hours;


-- =====================================================================
-- 10. Does speed matter? Unresponsive % by how fast the first touch came
--     (only leads that passed the screener: rejected leads get a fast "no")
-- =====================================================================
WITH ok AS (
  SELECT agency_id, lead_id FROM screener_answers
  GROUP BY 1, 2 HAVING bool_and(meets_requirement <> 'no')
),
first_touch AS (
  SELECT l.agency_id, l.lead_id, l.outcome,
         extract(epoch FROM min(c.contacted_at) - l.created_at) / 3600 AS hours
  FROM leads l JOIN ok USING (agency_id, lead_id)
  JOIN contact_log c ON c.agency_id = l.agency_id AND c.lead_id = l.lead_id AND c.direction = 'outbound'
  GROUP BY 1, 2, 3, l.created_at
)
SELECT agency_id,
       CASE WHEN hours < 1 THEN '1: < 1 h' WHEN hours < 4 THEN '2: 1-4 h'
            WHEN hours < 24 THEN '3: 4-24 h' ELSE '4: > 24 h' END AS first_touch,
       count(*) AS leads,
       round(100.0 * count(*) FILTER (WHERE outcome = 'unresponsive') / count(*), 1) AS unresponsive_pct,
       round(100.0 * count(*) FILTER (WHERE outcome = 'accepted') / count(*), 1)     AS accepted_pct
FROM first_touch
GROUP BY 1, 2
ORDER BY 1, 2;


-- =====================================================================
-- 11. Consult outcomes: attended / no-show / cancelled / still scheduled
-- =====================================================================
SELECT agency_id, status, count(*) AS bookings,
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY agency_id), 1) AS pct
FROM appointments
GROUP BY 1, 2
ORDER BY agency_id, bookings DESC;


-- =====================================================================
-- 12. Application abandonment: where unfinished applications stop
-- =====================================================================
SELECT agency_id,
       coalesce(last_section_completed, '(none)') AS last_section_completed,
       count(*) AS applications,
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY agency_id), 1) AS pct_of_unfinished
FROM applications
WHERE submitted_at IS NULL
GROUP BY 1, 2
ORDER BY agency_id, applications DESC;


-- =====================================================================
-- 13. Paused leads to re-engage: due date passed or within 30 days of the export
--     "Today" = the export's last contact, not the clock: the data is a snapshot.
-- =====================================================================
WITH as_of AS (
  SELECT l.agency_id, (max(c.contacted_at) AT TIME ZONE a.timezone)::date AS today
  FROM leads l JOIN contact_log c USING (agency_id, lead_id) JOIN agencies a ON a.id = l.agency_id
  GROUP BY l.agency_id, a.timezone
)
SELECT l.agency_id, l.lead_id, l.first_name, l.coordinator, l.paused_until,
       l.paused_until - as_of.today AS days_until_due
FROM leads l JOIN as_of USING (agency_id)
WHERE l.outcome = 'paused'
  AND l.paused_until <= as_of.today + 30
ORDER BY l.agency_id, l.paused_until;


-- =====================================================================
-- 14. Monthly cohorts: leads per signup month and % qualified so far
--     (recent months are not finished yet: qualifying takes 2-3 weeks)
-- =====================================================================
SELECT agency_id,
       to_char(date_trunc('month', created_at AT TIME ZONE timezone), 'YYYY-MM') AS signup_month,
       count(*) AS leads,
       count(qualified_at) AS qualified,
       round(100.0 * count(qualified_at) / count(*), 1) AS qualified_pct
FROM lead_qualification
GROUP BY 1, 2
ORDER BY 1, 2;


-- =====================================================================
-- 15. Repeat inquiries: same email, more than one lead
-- =====================================================================
SELECT agency_id, lower(email) AS email, count(*) AS leads,
       string_agg(outcome, ' -> ' ORDER BY created_at) AS outcomes_in_order,
       min(created_at)::date AS first_seen, max(created_at)::date AS last_seen
FROM leads
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY agency_id, leads DESC, first_seen
LIMIT 50;
