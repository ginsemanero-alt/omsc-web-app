-- ============================================================
-- OMSC Guidance System — schema migrations
--
-- Run each statement manually in the Supabase SQL Editor, in the
-- order they appear in this file. Statements are grouped by the
-- phase that introduced them. Nothing in this file is run
-- automatically.
-- ============================================================


-- ------------------------------------------------------------
-- PHASE 1c — Collapse the "counselor" role into "admin"
--
-- The counselor and admin roles are merged into a single admin
-- role (see PROMPT.md Phase 1c). Existing counselor accounts
-- need their `role` column updated so they still resolve to a
-- dashboard after the frontend stops recognizing 'counselor'.
-- ------------------------------------------------------------

UPDATE users SET role = 'admin' WHERE role = 'counselor';


-- ------------------------------------------------------------
-- PHASE 3a — Fix the IP (Indigenous Peoples) column name bug
--
-- Registration wrote is_indigenous into `users`, but
-- AnalyticsDashboard.tsx filters is_ip from `profiles` — they
-- never matched, so the IP breakdown always rendered 0. The
-- frontend/backend code now writes is_ip everywhere. This just
-- renames the existing `users` column to match. Confirmed via
-- schema introspection that users.is_indigenous is `text` (not
-- boolean), same as the column it's being renamed to line up
-- with in spirit — so this is a plain rename, no cast needed.
--
-- (is_pwd was audited the same way: already named consistently
-- as `is_pwd` in both `users` and `profiles`, so no rename is
-- needed there. It does, however, differ in TYPE between the two
-- tables — users.is_pwd is `text`, profiles.is_pwd is `boolean`.
-- That's part of the users/profiles unification decision, not
-- fixed here.)
-- ------------------------------------------------------------

ALTER TABLE users RENAME COLUMN is_indigenous TO is_ip;


-- ------------------------------------------------------------
-- PHASE 3b — Unify demographics on `profiles`
--
-- Decision: `profiles` is now the single source of truth for
-- student demographics (program, year_level, age, gender, is_ip,
-- is_pwd, campus). `users` keeps only account/access-control
-- fields (student_id, name, email, password, role, campus,
-- status). `profiles.id` = the Supabase Auth user's uuid, which
-- is why it was chosen over `users.id` (an unrelated bigint
-- auto-increment id that can't be tied to auth.uid() for RLS).
--
-- api/index.js's /api/register now creates the Supabase Auth user
-- first, then inserts the account row into `users` and the
-- demographics row into `profiles` in the same request — so new
-- registrations need no second form.
--
-- Run this AFTER the is_ip rename above. It's non-destructive: it
-- only backfills `profiles` for existing accounts that don't have
-- a profile row yet, by joining `users` to `auth.users` on email
-- to get the uuid `profiles.id` needs. Accounts with no matching
-- auth.users row are skipped (their Supabase Auth user was never
-- successfully created under the old registration code) — those
-- students will pick up a profiles row automatically the next
-- time they log in and the /api/login fallback creates their auth
-- user, or by filling in the profile form once.
-- ------------------------------------------------------------

INSERT INTO profiles (id, full_name, student_id, campus, program, year_level, age, gender, is_ip, is_pwd, user_role)
SELECT
  au.id,
  u.name,
  u.student_id,
  u.campus,
  u.program,
  u.year_level::text,
  u.age,
  u.gender,
  (u.is_ip = 'Yes'),
  (u.is_pwd = 'Yes'),
  u.role
FROM users u
JOIN auth.users au ON au.email = u.email
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = au.id
);

-- Once you've confirmed (a) the backfill above ran cleanly and
-- (b) the app works end to end with demographics coming from
-- `profiles` (registration, profile edit, analytics), the old
-- demographic columns on `users` are dead weight and can be
-- dropped. Left commented out — run manually when ready, this is
-- destructive.

-- ALTER TABLE users DROP COLUMN program;
-- ALTER TABLE users DROP COLUMN year_level;
-- ALTER TABLE users DROP COLUMN age;
-- ALTER TABLE users DROP COLUMN gender;
-- ALTER TABLE users DROP COLUMN is_ip;
-- ALTER TABLE users DROP COLUMN is_pwd;


-- ------------------------------------------------------------
-- PHASE 1b — Remove the registration/attendance feature
--
-- The panel never asked for program registration or attendance
-- tracking. All frontend code that read/wrote
-- `program_registrations` has been removed (ProgramsActivities,
-- AnalyticsDashboard). This statement is commented out —
-- uncomment and run it ONLY after you've confirmed the app still
-- works end to end (programs list, analytics, materials) with
-- the frontend changes deployed. This is destructive and
-- irreversible: it drops the table and all rows in it.
-- ------------------------------------------------------------

-- DROP TABLE program_registrations;


-- ------------------------------------------------------------
-- PHASE 4a — Knowledge scoring
--
-- surveys need a way to distinguish a scored "Knowledge
-- Assessment" from an unscored "Opinion Survey" — SurveyBuilder.tsx
-- now writes this. survey_responses need somewhere to persist the
-- computed score once QuizzesSurveys.tsx grades a submission.
--
-- Per-question data (correct_option, and the optional
-- related_program_id / related_material_id used to link a missed
-- question back to the program or material it covers) lives inside
-- the existing questions_data jsonb column — no schema change
-- needed for those, they're just additional keys on each question
-- object.
-- ------------------------------------------------------------

ALTER TABLE surveys ADD COLUMN type text NOT NULL DEFAULT 'opinion';
ALTER TABLE surveys ADD CONSTRAINT surveys_type_check CHECK (type IN ('knowledge', 'opinion'));

ALTER TABLE survey_responses ADD COLUMN score integer;
ALTER TABLE survey_responses ADD COLUMN total_scored integer;
ALTER TABLE survey_responses ADD COLUMN percentage numeric;


-- ------------------------------------------------------------
-- PHASE 4b — Constrain the guidance-service / program-component
-- columns on `programs`
--
-- Both columns already exist (added outside this migration log,
-- confirmed via schema introspection) and ProgramManager.tsx
-- already writes to them from a fixed dropdown. This just adds a
-- CHECK constraint so the column can't drift from that fixed list
-- via any other write path (a direct SQL edit, a future script,
-- etc).
--
-- ProgramManager.tsx's dropdown previously wrote "Research &
-- Evaluation" (an ampersand), which doesn't match the panel's
-- exact wording ("Research and Evaluation") used below and now
-- used by the fixed dropdown. Confirmed via direct query that one
-- existing program (id 38) has the old value — normalize it before
-- adding the constraint, or the ALTER will fail.
-- ------------------------------------------------------------

UPDATE programs SET guidance_service = 'Research and Evaluation' WHERE guidance_service = 'Research & Evaluation';

ALTER TABLE programs ADD CONSTRAINT programs_guidance_service_check
  CHECK (guidance_service IN (
    'Information Services', 'Individual Inventory', 'Research and Evaluation',
    'Career Orientation', 'Testing Services', 'Counseling Services'
  ));

ALTER TABLE programs ADD CONSTRAINT programs_program_component_check
  CHECK (program_component IN (
    'Group Guidance', 'Individual Student Planning', 'Responsive Services', 'System Support'
  ));
-- ------------------------------------------------------------
-- PHASE 5 — Enable Row Level Security (RLS)
--
-- CRITICAL. Every app table was reachable for both reads and
-- writes by anyone holding just the public anon key — which is,
-- by design, embedded in the client-side JS bundle and trivially
-- extractable by anyone, not a secret. Confirmed live: an
-- unauthenticated request could INSERT directly into `users` with
-- role: 'admin', completely bypassing /api/register's role
-- hardcoding and every permission check in the app, because
-- Postgres had no policy telling it to reject the write. Same for
-- programs, materials, and surveys (arbitrary create/edit/delete).
--
-- This enables RLS on every app table and adds policies matching
-- exactly what the current frontend code actually does (see the
-- comment above each block) — nothing here should change any
-- legitimate in-app behavior, only reject requests the app itself
-- never makes. Run this as one script; is_admin() is used by every
-- policy below it.
--
-- is_admin() bridges the JWT's email to users.role — the same way
-- useAuth.tsx determines role client-side — so policies can check
-- "is the current session an admin" without repeating that
-- subquery everywhere. SECURITY DEFINER is required here: without
-- it, this function's own query against `users` would immediately
-- trigger users' RLS policies (which call is_admin()), recursing
-- forever. SECURITY DEFINER runs the function as its owner
-- (the query-editor's role, effectively superuser), which bypasses
-- RLS for that one internal lookup only.
-- ------------------------------------------------------------

-- Every ALTER TABLE ... ENABLE ROW LEVEL SECURITY below is already
-- idempotent (re-running it on a table that already has RLS enabled
-- is a harmless no-op). Every CREATE POLICY is preceded by a DROP
-- POLICY IF EXISTS for the same reason — this whole script is safe
-- to run again in full, including after a partial/interrupted run.

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE email = (auth.jwt() ->> 'email') AND role = 'admin'
  );
$$;

-- ---- programs ----
-- Read: public — ProgramsPage.tsx and HomePage.tsx render these
-- with no login required. Write: admin only (ProgramManager.tsx).
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS programs_select_public ON programs;
CREATE POLICY programs_select_public ON programs
  FOR SELECT USING (true);
DROP POLICY IF EXISTS programs_insert_admin ON programs;
CREATE POLICY programs_insert_admin ON programs
  FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS programs_update_admin ON programs;
CREATE POLICY programs_update_admin ON programs
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS programs_delete_admin ON programs;
CREATE POLICY programs_delete_admin ON programs
  FOR DELETE USING (is_admin());

-- ---- materials ----
-- Read: public (MaterialsPage.tsx). Write: admin only
-- (MaterialLibrary.tsx).
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS materials_select_public ON materials;
CREATE POLICY materials_select_public ON materials
  FOR SELECT USING (true);
DROP POLICY IF EXISTS materials_insert_admin ON materials;
CREATE POLICY materials_insert_admin ON materials
  FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS materials_update_admin ON materials;
CREATE POLICY materials_update_admin ON materials
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS materials_delete_admin ON materials;
CREATE POLICY materials_delete_admin ON materials
  FOR DELETE USING (is_admin());

-- ---- surveys ----
-- Read: admins see everything, drafts included (SurveyBuilder.tsx);
-- everyone else (including anonymous — /take-survey/:id is a public
-- route) only sees non-draft surveys. A draft's questions_data
-- carries the correct_option answer key, which shouldn't be
-- readable before the survey is actually published. Write: admin
-- only.
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS surveys_select_published_or_admin ON surveys;
CREATE POLICY surveys_select_published_or_admin ON surveys
  FOR SELECT USING (status <> 'draft' OR is_admin());
DROP POLICY IF EXISTS surveys_insert_admin ON surveys;
CREATE POLICY surveys_insert_admin ON surveys
  FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS surveys_update_admin ON surveys;
CREATE POLICY surveys_update_admin ON surveys
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS surveys_delete_admin ON surveys;
CREATE POLICY surveys_delete_admin ON surveys
  FOR DELETE USING (is_admin());

-- ---- survey_responses ----
-- A student can insert/read only their own response, matched via
-- users.id (what survey_responses.user_id actually references —
-- not the auth uuid; see QuizzesSurveys.tsx). Admins can read
-- everything for Analytics/Reports. No update/delete policy for
-- non-admins: nothing in the app ever edits a submitted response.
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS survey_responses_select_own_or_admin ON survey_responses;
CREATE POLICY survey_responses_select_own_or_admin ON survey_responses
  FOR SELECT USING (
    is_admin() OR
    user_id IN (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email'))
  );
DROP POLICY IF EXISTS survey_responses_insert_own ON survey_responses;
CREATE POLICY survey_responses_insert_own ON survey_responses
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email'))
  );

-- ---- profiles ----
-- A student can read/update only their own row — profiles.id is
-- the Supabase Auth uuid directly (see StudentProfile.tsx). Admins
-- can read everything for Analytics/User Management. No INSERT
-- policy for non-admins: registration writes profiles via the
-- backend's service-role key, which always bypasses RLS regardless
-- of policy, so this doesn't need to (and shouldn't) allow a
-- client-side insert path.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON profiles;
CREATE POLICY profiles_select_own_or_admin ON profiles
  FOR SELECT USING (is_admin() OR id = auth.uid());
DROP POLICY IF EXISTS profiles_update_own_or_admin ON profiles;
CREATE POLICY profiles_update_own_or_admin ON profiles
  FOR UPDATE USING (is_admin() OR id = auth.uid())
  WITH CHECK (is_admin() OR id = auth.uid());

-- ---- users ----
-- A signed-in user can read/update only their own row — needed by
-- useAuth.tsx's role lookup and by TopNavBar's profile fetch.
-- Admins can read/update everyone (User Management). No INSERT
-- policy for non-admins: registration and staff creation both go
-- through backend endpoints using the service-role key, which
-- bypasses RLS — this table should never accept a client-side
-- insert at all, admin or not.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own_or_admin ON users;
CREATE POLICY users_select_own_or_admin ON users
  FOR SELECT USING (is_admin() OR email = (auth.jwt() ->> 'email'));
DROP POLICY IF EXISTS users_update_own_or_admin ON users;
CREATE POLICY users_update_own_or_admin ON users
  FOR UPDATE USING (is_admin() OR email = (auth.jwt() ->> 'email'))
  WITH CHECK (is_admin() OR email = (auth.jwt() ->> 'email'));
DROP POLICY IF EXISTS users_delete_admin ON users;
CREATE POLICY users_delete_admin ON users
  FOR DELETE USING (is_admin());

-- ------------------------------------------------------------
-- PHASE 5b — Remove pre-existing "allow all" policies
--
-- After running PHASE 5 above, `surveys` and `users` were STILL
-- fully writable by anonymous requests — every other table was
-- correctly locked down. Cause: both tables already carried a
-- leftover permissive policy from some earlier, unrelated setup
-- (`"Allow all access"` on surveys, `"Allow all"` on users, both
-- `FOR ALL USING (true)`), plus a few redundant duplicate SELECT
-- policies on surveys. Postgres OR's multiple permissive policies
-- for the same command together, so PHASE 5's correctly-restrictive
-- policies were being overridden by these — same table, unrelated
-- policy name, so PHASE 5's `DROP POLICY IF EXISTS` (which only
-- matches its own policy names) never touched them. Found by
-- querying pg_policies directly; confirmed no other app table
-- carried a similar leftover.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Allow all access" ON surveys;
DROP POLICY IF EXISTS "Allow public read" ON surveys;
DROP POLICY IF EXISTS "Allow students to view surveys" ON surveys;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON surveys;

DROP POLICY IF EXISTS "Allow all" ON users;

-- ------------------------------------------------------------
-- PHASE 6 — Admin activity log
--
-- Records who did what: create/update/delete on Programs, Materials,
-- Surveys, and User Management (admin accounts and student account
-- edits/deletes). Scope is admin actions only — no student activity
-- is tracked here. Written by src/lib/activityLog.ts, called from
-- each admin panel's mutation handlers after a write succeeds.
--
-- entity_id is text (not bigint/uuid) because it has to hold both —
-- programs/materials/users use bigint ids, surveys use a uuid.
--
-- No UPDATE or DELETE policy at all, including for admins: an audit
-- log that its own subjects can edit or erase isn't one. Rows are
-- append-only from the app's perspective; only direct SQL access
-- (which this project's admins already have, via the Supabase
-- dashboard) can remove them, e.g. for retention/cleanup.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activity_logs (
  id bigserial PRIMARY KEY,
  actor_email text NOT NULL,
  actor_name text,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity_type text NOT NULL CHECK (entity_type IN ('program', 'material', 'survey', 'user')),
  entity_id text,
  entity_label text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs (created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_logs_select_admin ON activity_logs;
CREATE POLICY activity_logs_select_admin ON activity_logs
  FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS activity_logs_insert_admin ON activity_logs;
CREATE POLICY activity_logs_insert_admin ON activity_logs
  FOR INSERT WITH CHECK (is_admin());
