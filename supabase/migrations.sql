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

-- ------------------------------------------------------------
-- PHASE 7 — Storage policies for material-covers / material-files
--
-- MaterialLibrary.tsx's upload form (PDF/audio attachments, cover
-- images) has always uploaded to buckets named `material-covers` and
-- `material-files` — but neither bucket had ever actually been
-- created, so every upload failed with "Bucket not found". After
-- creating the two buckets (public, done via the Storage API, not
-- SQL — see the app's own Supabase Storage dashboard), uploads still
-- failed, now with "new row violates row-level security policy":
-- `program-posters` and `materials` already had storage.objects
-- policies from earlier in the project, but these two brand-new
-- buckets had none, and Supabase enables RLS on storage.objects by
-- default with zero policies — meaning zero access — until some are
-- added.
--
-- These mirror the materials table's own PHASE 3-era policy: public
-- read (materials are shown to every visitor, no login required),
-- admin-only write.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS material_covers_select_public ON storage.objects;
CREATE POLICY material_covers_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'material-covers');
DROP POLICY IF EXISTS material_covers_insert_admin ON storage.objects;
CREATE POLICY material_covers_insert_admin ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'material-covers' AND is_admin());
DROP POLICY IF EXISTS material_covers_update_admin ON storage.objects;
CREATE POLICY material_covers_update_admin ON storage.objects
  FOR UPDATE USING (bucket_id = 'material-covers' AND is_admin())
  WITH CHECK (bucket_id = 'material-covers' AND is_admin());
DROP POLICY IF EXISTS material_covers_delete_admin ON storage.objects;
CREATE POLICY material_covers_delete_admin ON storage.objects
  FOR DELETE USING (bucket_id = 'material-covers' AND is_admin());

DROP POLICY IF EXISTS material_files_select_public ON storage.objects;
CREATE POLICY material_files_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'material-files');
DROP POLICY IF EXISTS material_files_insert_admin ON storage.objects;
CREATE POLICY material_files_insert_admin ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'material-files' AND is_admin());
DROP POLICY IF EXISTS material_files_update_admin ON storage.objects;
CREATE POLICY material_files_update_admin ON storage.objects
  FOR UPDATE USING (bucket_id = 'material-files' AND is_admin())
  WITH CHECK (bucket_id = 'material-files' AND is_admin());
DROP POLICY IF EXISTS material_files_delete_admin ON storage.objects;
CREATE POLICY material_files_delete_admin ON storage.objects
  FOR DELETE USING (bucket_id = 'material-files' AND is_admin());

-- ------------------------------------------------------------
-- PHASE 7b — materials.image_url was missing entirely
--
-- Once the storage side of PHASE 7 was fixed, the upload form's final
-- step — the insert into `materials` — still failed: "Could not find
-- the 'image_url' column of 'materials' in the schema cache".
-- MaterialLibrary.tsx has always sent an `image_url` field (the cover
-- image uploaded to material-covers), but the column was never added
-- to the table. Confirmed by inspecting materials' actual columns —
-- no image_url, no equivalently-named alternative.
-- ------------------------------------------------------------

ALTER TABLE materials ADD COLUMN IF NOT EXISTS image_url text;

-- ------------------------------------------------------------
-- PHASE 8 — materials.downloads was never actually incremented
--
-- AnalyticsDashboard.tsx and ReportsCenter.tsx both read and total
-- materials.downloads (the "IEC Downloads" figure), but nothing in
-- the app ever wrote to it — every Download/Save button in
-- IECMaterials.tsx called only the browser-side file-saving helper,
-- never touched the database. The count was 0 forever regardless of
-- real usage.
--
-- Students don't have UPDATE access to `materials` (PHASE 5: admin-
-- only write), and a plain read-current-value-then-write from the
-- client would also lose increments if two students downloaded the
-- same material around the same time. This function does the
-- increment atomically in the database instead, and is the one
-- narrow, safe carve-out from that admin-only write policy: it can
-- only ever add exactly 1 to one row's download count, nothing else.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_material_downloads(material_id bigint) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE materials SET downloads = COALESCE(downloads, 0) + 1 WHERE id = material_id;
$$;

REVOKE ALL ON FUNCTION increment_material_downloads(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_material_downloads(bigint) TO anon, authenticated;

-- ------------------------------------------------------------
-- PHASE 9 — admin-only DELETE on survey_responses
--
-- The Survey Responses view (SurveyBuilder.tsx) had no way to remove
-- an individual submission — PHASE 5 gave survey_responses a SELECT
-- and an INSERT policy but never a DELETE one, so an admin trying to
-- delete a response (e.g. a test/junk submission) from the UI would
-- have silently done nothing under RLS. Admin-only, matching every
-- other admin-write policy in this file.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS survey_responses_delete_admin ON survey_responses;
CREATE POLICY survey_responses_delete_admin ON survey_responses
  FOR DELETE USING (is_admin());

-- ------------------------------------------------------------
-- PHASE 10 — Free-text display date for Programs & Activities
--
-- `programs.date` stays a real date (used for the upcoming/completed
-- comparison and sort order) — this just adds an optional override
-- for how it's PRINTED, so a multi-day event ("February 18-19, 2026")
-- doesn't have to be squeezed into a single-date picker. Additive
-- only; `date` itself is untouched.
-- ------------------------------------------------------------

ALTER TABLE programs ADD COLUMN IF NOT EXISTS date_display text;

-- ------------------------------------------------------------
-- PHASE 11 — Track student login/logout in the Activity Log
--
-- activity_logs was admin-actions-only (create/update/delete on
-- Programs/Materials/Surveys/Users), written via the client-side
-- logActivity() helper under an admin-only INSERT policy — a student
-- session could never write here at all. Extends both the action
-- CHECK constraint and the INSERT policy so a student can log their
-- OWN login/logout (and only that: action must be login/logout, and
-- actor_email must match their own JWT — they still can't insert a
-- create/update/delete row for anything, nor log an event as anyone
-- else).
-- ------------------------------------------------------------

ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_action_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_action_check
  CHECK (action IN ('create', 'update', 'delete', 'login', 'logout'));

-- Renamed from activity_logs_insert_admin, since it's no longer
-- admin-only.
DROP POLICY IF EXISTS activity_logs_insert_admin ON activity_logs;
DROP POLICY IF EXISTS activity_logs_insert ON activity_logs;
CREATE POLICY activity_logs_insert ON activity_logs
  FOR INSERT WITH CHECK (
    is_admin()
    OR (action IN ('login', 'logout') AND actor_email = (auth.jwt() ->> 'email'))
  );

-- ------------------------------------------------------------
-- PHASE 12 — Track which students browse Programs & Activities
--
-- Deliberately NOT one row per page load — a student re-opening the
-- Programs tab a dozen times in one sitting would flood this table
-- and bury every other entry in the Activity Log. ProgramsActivities.tsx
-- logs at most once per browser session (a sessionStorage flag guards
-- it), giving a meaningful "this student browsed Programs this
-- session" signal without the noise. Same self-service shape as
-- PHASE 11's login/logout: a student can only log their own view.
--
-- Account creation (self-registration) reuses the existing 'create'
-- action and needs no migration — it's written server-side in
-- /api/register with the service-role client, which bypasses RLS
-- entirely.
-- ------------------------------------------------------------

ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_action_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_action_check
  CHECK (action IN ('create', 'update', 'delete', 'login', 'logout', 'view'));

DROP POLICY IF EXISTS activity_logs_insert ON activity_logs;
CREATE POLICY activity_logs_insert ON activity_logs
  FOR INSERT WITH CHECK (
    is_admin()
    OR (action IN ('login', 'logout', 'view') AND actor_email = (auth.jwt() ->> 'email'))
  );

-- ------------------------------------------------------------
-- PHASE 13 — Let a survey carry an IEC category too
--
-- surveys.category uses the 6 Guidance Services (CATEGORIES in
-- SurveyBuilder.tsx) so it lines up with programs.guidance_service via
-- related_program_id — that link stays as-is. materials.category uses
-- a completely different 8-value IEC Categories scheme (IEC_CATEGORIES,
-- now shared from src/lib/iecCategories.ts), so a survey could never be
-- tied to the materials covering the same topic. Adds a second,
-- optional column instead of repurposing the existing one.
-- ------------------------------------------------------------

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS iec_category text;

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_iec_category_check;
ALTER TABLE surveys ADD CONSTRAINT surveys_iec_category_check
  CHECK (iec_category IS NULL OR iec_category IN (
    'Guidance Services', 'Academic Development', 'Career Development',
    'Personal & Social Development', 'Mental Health & Wellness',
    'Psychological Testing & Assessment',
    'Safe & Positive Learning Environment', 'Student Programs & Resources'
  ));

-- ------------------------------------------------------------
-- PHASE 14 — Program entries (a timeline within one program)
--
-- A single program row has one date/time_range, which can't represent
-- a month-long campaign (e.g. Suicide Prevention Month) made up of
-- several distinct week-by-week activities, each with its own photos.
-- This is NOT a calendar/scheduling feature — program_entries is a
-- simple ordered timeline of sub-entries belonging to one program,
-- shown as a vertical scroll, not tabs or a calendar grid.
--
-- duration_label is a free-text field the admin types directly (e.g.
-- "1 Month", "3 Days") — deliberately not derived/parsed from `date`
-- or `date_display`, since this app already treats parsing an end date
-- back out of arbitrary display text as unreliable (see
-- getEffectiveProgramStatus's date_display comment in
-- src/lib/programStatus.ts).
-- ------------------------------------------------------------

ALTER TABLE programs ADD COLUMN IF NOT EXISTS duration_label text;

CREATE TABLE IF NOT EXISTS program_entries (
  id          bigserial primary key,
  program_id  bigint not null references programs(id) on delete cascade,
  label       text not null,
  description text,
  caption     text,
  -- Array, not a single image_url — an entry like "Week 1" can carry
  -- more than one photo.
  image_urls  text[],
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS program_entries_program_id_sort_order_idx
  ON program_entries (program_id, sort_order);

-- Same shape as the programs table's own policies (see PHASE 5): public
-- read, admin-only write.
ALTER TABLE program_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_entries_select_public ON program_entries;
CREATE POLICY program_entries_select_public ON program_entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS program_entries_insert_admin ON program_entries;
CREATE POLICY program_entries_insert_admin ON program_entries
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS program_entries_update_admin ON program_entries;
CREATE POLICY program_entries_update_admin ON program_entries
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS program_entries_delete_admin ON program_entries;
CREATE POLICY program_entries_delete_admin ON program_entries
  FOR DELETE USING (is_admin());

-- ------------------------------------------------------------
-- PHASE 15 — Archive instead of permanent delete
--
-- Every Delete button (Programs, Materials, Surveys, Users) used to
-- run a real DELETE immediately. Now it only sets archived_at — the
-- row still exists, just excluded from every list/query/count the app
-- runs against these four tables (added directly to each query, not
-- via RLS: the new Archive screen still needs admins to SELECT
-- archived rows, so a SELECT-level policy can't distinguish "list
-- view" from "archive view").
--
-- No new RLS policies needed — every table here already has admin
-- UPDATE (for archiving/restoring) and admin DELETE (for the Archive
-- screen's permanent delete) from PHASE 5.
-- ------------------------------------------------------------

ALTER TABLE programs  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE surveys   ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE users     ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ------------------------------------------------------------
-- PHASE 16 — About page content, editable instead of hardcoded
--
-- AboutPage.tsx's prose (heading, director, intro paragraphs, contact
-- details) was hardcoded JSX — no admin could reword it without a
-- code change and redeploy, which is exactly the problem now that the
-- institution has been renamed OMSC -> OMSU. Singleton table (one
-- row, id = 1) rather than per-field settings rows: this content is
-- always read and written as one whole record, never queried by
-- individual field.
--
-- The "Core Service Components" and "Quality Policy Objectives" lists
-- stay hardcoded in AboutPage.tsx for now — turning those into
-- admin-editable repeatable lists is a larger, separate feature.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS about_content (
  id                          integer primary key default 1,
  heading_title               text not null default 'The Guidance and Testing Center',
  hero_intro                  text,
  director_name               text,
  director_title              text,
  collaborative_approach_text text,
  contact_email                text,
  contact_facebook             text,
  contact_phone                text,
  updated_at                  timestamptz not null default now(),
  constraint about_content_singleton check (id = 1)
);

INSERT INTO about_content (
  id, heading_title, hero_intro, director_name, director_title,
  collaborative_approach_text, contact_email, contact_facebook, contact_phone
) VALUES (
  1,
  'The Guidance and Testing Center',
  'The Guidance and Testing Center is an essential and integral part of the overall educational process. School counselors, working within the framework of the program, make major contributions to the primary educational mission and vision of the institution by providing students with Guidance and Counseling activities and services that facilitate and enhance their academic, career, and personal and social development.',
  'Dr. Angelina C. Paquibot',
  'Guidance and Testing Center Director',
  'While school Counselors are available to respond to the unique needs of each student, the Guidance and Counseling approach is collaborative among teachers, parents and administrators. As a developmental program, it addresses the needs of all students in OMSU by facilitating their growth as well as helping to create positive and safe learning environments.',
  'guidanceofficeomsc@gmail.com',
  'OMSU Guidance and Testing Center',
  '043-491-0925 / 09632086253'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE about_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS about_content_select_public ON about_content;
CREATE POLICY about_content_select_public ON about_content
  FOR SELECT USING (true);

DROP POLICY IF EXISTS about_content_update_admin ON about_content;
CREATE POLICY about_content_update_admin ON about_content
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- ------------------------------------------------------------
-- PHASE 17 — In-app notifications, alongside the existing email
--
-- Publishing a Program or activating a Survey only ever emailed
-- students (see notifyStudents.ts / /api/notify-students) — nothing
-- shown inside the app itself, and nothing at all if RESEND_API_KEY
-- isn't configured. One row per active student per publish event.
-- Inserted only by /api/notify-students with the service-role key
-- (same reason `users` has no client-side INSERT policy: this table
-- doesn't need one either), read/marked-read by the student it
-- belongs to.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  type        text not null check (type in ('program', 'survey')),
  title       text not null,
  message     text,
  action_path text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_read_at_idx
  ON notifications (user_id, read_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE USING (
    user_id IN (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email'))
  ) WITH CHECK (
    user_id IN (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email'))
  );

-- ------------------------------------------------------------
-- PHASE 18 — Analytics AI Insight cache
--
-- One cached explanation for the whole Analytics dashboard (see
-- /api/analytics-insight), keyed by a fixed section id with a hash
-- of the aggregate numbers it was generated from. All reads/writes
-- go through that endpoint's service-role client, never the
-- browser's own — same reasoning as `notifications` needing no
-- client-side INSERT policy, this needs no client-side write
-- policy at all. The admin-only SELECT policy exists only so a
-- future admin-facing read doesn't need a new policy to be added.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS analytics_insights (
  section      text primary key,
  insight      text not null,
  data_hash    text not null,
  model_used   text not null,
  generated_at timestamptz not null default now()
);

ALTER TABLE analytics_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_insights_select_admin ON analytics_insights;
CREATE POLICY analytics_insights_select_admin ON analytics_insights
  FOR SELECT USING (is_admin());

-- ------------------------------------------------------------
-- PHASE 19 — Mark test/seed accounts apart from real students
--
-- Needed before seeding real research-participant accounts
-- (scripts/seed-omsu-students.cjs) alongside any load-test/fake
-- accounts, so the two are never confused. Defaults to false —
-- every existing row (all real, today) stays correctly marked
-- with no backfill needed; any fake/load-test batch must set this
-- to true explicitly.
-- ------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- PHASE 20 — Multi-photo program poster/cover gallery
--
-- programs.image_url stays exactly as-is (the primary cover shown
-- on every card/thumbnail everywhere) — this only adds room for
-- additional cover photos, so nothing that already reads image_url
-- needs to change.
-- ------------------------------------------------------------

ALTER TABLE programs ADD COLUMN IF NOT EXISTS gallery_urls text[];

-- ------------------------------------------------------------
-- PHASE 21 — Campus-scoped programs and IEC materials (optional)
--
-- OMSU has three campuses (San Jose, Labangan, Murtha). campus is
-- optional on both tables: NULL = university-wide, visible to every
-- campus; a campus name = only that campus's students see it
-- (filtered client-side in the student views; public pages show
-- everything). programs had no campus column at all. materials had
-- one defaulting to 'San Jose Campus' that no form ever set, so every
-- existing material was San Jose-only by accident — reset to NULL.
-- ------------------------------------------------------------

ALTER TABLE programs ADD COLUMN IF NOT EXISTS campus text;

ALTER TABLE materials ALTER COLUMN campus DROP DEFAULT;

-- ONE-TIME backfill: unlike the rest of this file, do NOT re-run this
-- line once admins have started assigning campuses on purpose.
UPDATE materials SET campus = NULL WHERE campus IS NOT NULL;

ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_campus_check;
ALTER TABLE programs ADD CONSTRAINT programs_campus_check
  CHECK (campus IS NULL OR campus IN ('San Jose Campus', 'Labangan Campus', 'Murtha Campus'));
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_campus_check;
ALTER TABLE materials ADD CONSTRAINT materials_campus_check
  CHECK (campus IS NULL OR campus IN ('San Jose Campus', 'Labangan Campus', 'Murtha Campus'));

-- ------------------------------------------------------------
-- PHASE 22 — Pre-test / post-test for knowledge assessments
--
-- One-group pretest-posttest design: each program has one knowledge
-- assessment; a student answers it BEFORE the program's IEC
-- materials (pre) and AGAIN AFTER (post), same instrument.
--
-- surveys.program_id links an assessment to its program (at most one
-- active one per program). survey_responses.attempt_type marks each
-- knowledge response 'pre' or 'post' — assigned by a trigger, never
-- by the browser, so a student can't submit a "post" without a
-- "pre". Exactly one of each per student per assessment (unique
-- constraint). Opinion surveys keep attempt_type NULL and stay one
-- response per student (separate partial unique index, because
-- UNIQUE treats NULLs as distinct).
-- ------------------------------------------------------------

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS program_id integer
  REFERENCES programs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS surveys_one_knowledge_per_program
  ON surveys (program_id)
  WHERE type = 'knowledge' AND program_id IS NOT NULL AND archived_at IS NULL;

ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS attempt_type text;

ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_attempt_type_check;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_attempt_type_check
  CHECK (attempt_type IS NULL OR attempt_type IN ('pre', 'post'));

ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_one_per_attempt;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_one_per_attempt
  UNIQUE (user_id, survey_id, attempt_type);

CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_one_opinion
  ON survey_responses (user_id, survey_id) WHERE attempt_type IS NULL;

CREATE OR REPLACE FUNCTION set_attempt_type() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT type FROM surveys WHERE id = NEW.survey_id) IS DISTINCT FROM 'knowledge' THEN
    NEW.attempt_type := NULL;
  ELSIF EXISTS (
    SELECT 1 FROM survey_responses
    WHERE user_id = NEW.user_id
      AND survey_id = NEW.survey_id
      AND attempt_type = 'pre'
  ) THEN
    -- A third attempt also lands here and is rejected by
    -- survey_responses_one_per_attempt.
    NEW.attempt_type := 'post';
  ELSE
    NEW.attempt_type := 'pre';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS survey_responses_set_attempt_type ON survey_responses;
CREATE TRIGGER survey_responses_set_attempt_type
  BEFORE INSERT ON survey_responses
  FOR EACH ROW EXECUTE FUNCTION set_attempt_type();

-- ------------------------------------------------------------
-- PHASE 23 — Learning Gain aggregation (admin-only RPC)
--
-- Powers the Learning Gain section of the Analytics Dashboard
-- (LearningGainSection.tsx). All aggregation happens here; the
-- client only receives one row per group.
--
-- Pairing: one row per student per assessment. "Paired" = has both
-- a pre and a post; "incomplete" = pre only (attrition). Scores are
-- percentages (score / total_scored × 100). Test accounts
-- (users.is_test_account) are excluded. Demographics come from
-- profiles, matched through auth.users by email (profiles.id is the
-- auth uuid), falling back to student_id.
--
-- Normalized gain is Hake's class-average <g> computed from the
-- group means: (mean_post − mean_pre) / (100 − mean_pre); NULL when
-- mean_pre is 100 (no room to gain). sd_diff (sample SD of
-- post − pre) is returned so the client can compute the paired
-- t-test: t = mean_gain / (sd_diff / √n), df = n − 1.
--
-- Access: functions aren't covered by RLS, so the admin check is
-- inside the function (is_admin(), same rule as every admin-only
-- policy) and EXECUTE is revoked from anon/public. SECURITY DEFINER
-- is needed to read auth.users and every student's responses.
--
-- p_age_brackets comes from AGE_BRACKETS in src/lib/learningGain.ts
-- so the brackets live in one place; the default here is only a
-- fallback. Academic year = calendar year of the pre-test, the same
-- year-of-created_at rule the rest of the dashboard uses.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION learning_gain_summary(
  p_program_id    integer DEFAULT NULL,
  p_course        text    DEFAULT NULL,
  p_year_level    text    DEFAULT NULL,
  p_gender        text    DEFAULT NULL,
  p_age_bracket   text    DEFAULT NULL,
  p_academic_year integer DEFAULT NULL,
  p_age_brackets  jsonb   DEFAULT '[
    {"label": "17–18",        "min": 17, "max": 18},
    {"label": "19–20",        "min": 19, "max": 20},
    {"label": "21–22",        "min": 21, "max": 22},
    {"label": "23 and above", "min": 23, "max": null}
  ]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can view learning gain analytics'
      USING ERRCODE = '42501';
  END IF;

  WITH per_student AS (
    -- One row per student per assessment: their pre and post scores.
    SELECT
      r.user_id,
      r.survey_id,
      s.program_id,
      MAX(COALESCE(r.score::numeric * 100 / NULLIF(r.total_scored, 0), r.percentage))
        FILTER (WHERE r.attempt_type = 'pre')  AS pre,
      MAX(COALESCE(r.score::numeric * 100 / NULLIF(r.total_scored, 0), r.percentage))
        FILTER (WHERE r.attempt_type = 'post') AS post,
      MIN(r.created_at) FILTER (WHERE r.attempt_type = 'pre') AS pre_at
    FROM survey_responses r
    JOIN surveys s ON s.id = r.survey_id
    WHERE s.type = 'knowledge'
      AND s.program_id IS NOT NULL
      AND r.attempt_type IN ('pre', 'post')
    GROUP BY r.user_id, r.survey_id, s.program_id
  ),
  students AS (
    SELECT
      ps.*,
      COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified')    AS course,
      COALESCE(NULLIF(TRIM(prof.year_level), ''), 'Not specified') AS year_level,
      COALESCE(NULLIF(TRIM(prof.gender), ''), 'Not specified')     AS gender,
      CASE WHEN prof.is_pwd THEN 'PWD' ELSE 'Non-PWD' END          AS pwd,
      CASE WHEN prof.is_ip  THEN 'IP'  ELSE 'Non-IP'  END          AS ip,
      CASE
        WHEN prof.age IS NULL THEN 'Not specified'
        ELSE COALESCE(
          (SELECT b ->> 'label'
             FROM jsonb_array_elements(p_age_brackets) b
            WHERE prof.age >= (b ->> 'min')::int
              AND (b ->> 'max' IS NULL OR prof.age <= (b ->> 'max')::int)
            LIMIT 1),
          'Outside brackets')
      END AS age_bracket
    FROM per_student ps
    JOIN users u ON u.id = ps.user_id AND NOT u.is_test_account
    LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
    LEFT JOIN LATERAL (
      SELECT p.*
        FROM profiles p
       WHERE p.id = au.id
          OR (u.student_id IS NOT NULL AND p.student_id = u.student_id)
       ORDER BY (p.id = au.id) DESC NULLS LAST
       LIMIT 1
    ) prof ON true
    WHERE ps.pre IS NOT NULL
  ),
  filtered AS (
    SELECT *
      FROM students
     WHERE (p_program_id    IS NULL OR program_id  = p_program_id)
       AND (p_course        IS NULL OR course      = p_course)
       AND (p_year_level    IS NULL OR year_level  = p_year_level)
       AND (p_gender        IS NULL OR gender      = p_gender)
       AND (p_age_bracket   IS NULL OR age_bracket = p_age_bracket)
       AND (p_academic_year IS NULL OR EXTRACT(YEAR FROM pre_at)::int = p_academic_year)
  ),
  grouped AS (
    SELECT
      CASE
        WHEN GROUPING(program_id)  = 0 THEN 'program'
        WHEN GROUPING(course)      = 0 THEN 'course'
        WHEN GROUPING(gender)      = 0 THEN 'gender'
        WHEN GROUPING(age_bracket) = 0 THEN 'age_bracket'
        WHEN GROUPING(year_level)  = 0 THEN 'year_level'
        WHEN GROUPING(pwd)         = 0 THEN 'pwd'
        WHEN GROUPING(ip)          = 0 THEN 'ip'
        ELSE 'overall'
      END AS dimension,
      COALESCE(program_id::text, course, gender, age_bracket, year_level, pwd, ip, 'All') AS key,
      COUNT(*) FILTER (WHERE post IS NOT NULL)                AS paired_n,
      COUNT(*) FILTER (WHERE post IS NULL)                    AS incomplete_n,
      COUNT(*) FILTER (WHERE post IS NOT NULL AND pre >= 100) AS ceiling_n,
      AVG(pre)                FILTER (WHERE post IS NOT NULL) AS mean_pre,
      AVG(post)               FILTER (WHERE post IS NOT NULL) AS mean_post,
      AVG(post - pre)         FILTER (WHERE post IS NOT NULL) AS mean_gain,
      STDDEV_SAMP(post - pre) FILTER (WHERE post IS NOT NULL) AS sd_diff
    FROM filtered
    GROUP BY GROUPING SETS (
      (program_id), (course), (gender), (age_bracket), (year_level), (pwd), (ip), ()
    )
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'dimension',    g.dimension,
        'key',          g.key,
        'paired_n',     g.paired_n,
        'incomplete_n', g.incomplete_n,
        'ceiling_n',    g.ceiling_n,
        'mean_pre',     ROUND(g.mean_pre, 2),
        'mean_post',    ROUND(g.mean_post, 2),
        'mean_gain',    ROUND(g.mean_gain, 2),
        'sd_diff',      ROUND(g.sd_diff, 4),
        'norm_gain',    CASE
                          WHEN g.mean_pre IS NULL OR g.mean_pre >= 100 THEN NULL
                          ELSE ROUND((g.mean_post - g.mean_pre) / (100 - g.mean_pre), 4)
                        END
      ))
      FROM grouped g
    ), '[]'::jsonb),
    -- Filter choices, from all (unfiltered) data so picking one filter
    -- never hides the options of another.
    'options', jsonb_build_object(
      'programs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) ORDER BY p.title)
          FROM programs p
         WHERE EXISTS (
           SELECT 1 FROM surveys s
            WHERE s.program_id = p.id AND s.type = 'knowledge' AND s.archived_at IS NULL
         )
      ), '[]'::jsonb),
      'courses',     COALESCE((SELECT jsonb_agg(DISTINCT course)     FROM students), '[]'::jsonb),
      'year_levels', COALESCE((SELECT jsonb_agg(DISTINCT year_level) FROM students), '[]'::jsonb),
      'genders',     COALESCE((SELECT jsonb_agg(DISTINCT gender)     FROM students), '[]'::jsonb),
      'years',       COALESCE((SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM pre_at)::int) FROM students), '[]'::jsonb)
    )
  ) INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- PHASE 24 — Answer key and scoring move to the server
--
-- Before this, every active survey (answer key included, in
-- questions_data[].correct_option) was readable by anyone, even
-- signed out, and the browser computed its own score and inserted
-- it — so a student could read the key or submit any score.
--
-- Now:
-- - Only admins read `surveys` and `survey_responses` directly.
-- - Students go through the functions below, which identify them
--   from their session (never from a client-supplied id):
--     student_list_surveys()          active surveys, NO answer key
--     submit_assessment(id, answers)  scores on the server + inserts
--     student_my_results()            own results; no score for pre-tests
--     get_assessment_review(id)       answer key + pre/post answers,
--                                     only after the student's post-test
-- - attempt_type is still assigned by set_attempt_type() (PHASE 22).
-- ------------------------------------------------------------

-- The signed-in user's users.id (bigint). users <-> auth is by email,
-- same as is_admin().
CREATE OR REPLACE FUNCTION current_user_row_id() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM users
   WHERE lower(email) = lower(auth.jwt() ->> 'email')
   LIMIT 1;
$$;

-- questions_data without any correct_option.
CREATE OR REPLACE FUNCTION strip_answer_key(questions jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(questions) <> 'array' THEN '[]'::jsonb
    ELSE COALESCE(
      (SELECT jsonb_agg(item - 'correct_option' ORDER BY position)
         FROM jsonb_array_elements(questions) WITH ORDINALITY AS q(item, position)),
      '[]'::jsonb)
  END;
$$;

CREATE OR REPLACE FUNCTION student_list_surveys() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_user_row_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in to view assessments.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',             s.id,
      'title',          s.title,
      'description',    s.description,
      'category',       s.category,
      'iec_category',   s.iec_category,
      'type',           s.type,
      'status',         s.status,
      'program_id',     s.program_id,
      'created_at',     s.created_at,
      'questions_data', strip_answer_key(s.questions_data),
      'attempts',       COALESCE(a.attempts, '[]'::jsonb)
    ) ORDER BY s.created_at DESC)
    FROM surveys s
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(COALESCE(r.attempt_type, 'single')) AS attempts
        FROM survey_responses r
       WHERE r.survey_id = s.id AND r.user_id = v_user
    ) a ON true
    WHERE s.status = 'active' AND s.archived_at IS NULL
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION submit_assessment(p_survey_id uuid, p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user    bigint := current_user_row_id();
  v_survey  surveys%ROWTYPE;
  v_total   integer;
  v_correct integer;
  v_pct     numeric;
  v_attempt text;
  v_pre     numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in to submit.' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers must be an object keyed by question id.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_survey FROM surveys
   WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
  END IF;

  -- Scored items: multiple choice with a correct_option, the same rule
  -- the browser used before.
  IF v_survey.type = 'knowledge' THEN
    SELECT
      COUNT(*) FILTER (WHERE q->>'type' = 'mcq' AND COALESCE(q->>'correct_option', '') <> ''),
      COUNT(*) FILTER (WHERE q->>'type' = 'mcq' AND COALESCE(q->>'correct_option', '') <> ''
                         AND p_answers ->> (q->>'id') = q->>'correct_option')
      INTO v_total, v_correct
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_survey.questions_data) = 'array'
             THEN v_survey.questions_data ELSE '[]'::jsonb END) AS q;
    v_pct := CASE WHEN v_total > 0 THEN ROUND(v_correct * 100.0 / v_total) END;
  END IF;

  BEGIN
    INSERT INTO survey_responses (survey_id, user_id, answers, score, total_scored, percentage)
    VALUES (
      p_survey_id, v_user, p_answers,
      CASE WHEN v_survey.type = 'knowledge' THEN v_correct END,
      CASE WHEN v_survey.type = 'knowledge' THEN v_total END,
      v_pct)
    RETURNING attempt_type INTO v_attempt;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You have already completed this assessment.' USING ERRCODE = '23505';
  END;

  -- Pre-test: no score back. Post-test: score plus the pre-test's, for
  -- showing improvement.
  IF v_attempt = 'post' THEN
    SELECT percentage INTO v_pre FROM survey_responses
     WHERE survey_id = p_survey_id AND user_id = v_user AND attempt_type = 'pre';
    RETURN jsonb_build_object(
      'attempt_type', v_attempt, 'score', v_correct, 'total', v_total,
      'percentage', v_pct, 'pre_percentage', v_pre);
  END IF;

  RETURN jsonb_build_object('attempt_type', v_attempt);
END $$;

CREATE OR REPLACE FUNCTION student_my_results() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_user_row_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in to view your results.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',           r.id,
      'survey_id',    r.survey_id,
      'title',        s.title,
      'category',     s.category,
      'created_at',   r.created_at,
      'attempt_type', r.attempt_type,
      -- A pre-test's score stays hidden from the student.
      'score',        CASE WHEN r.attempt_type = 'pre' THEN NULL ELSE r.score END,
      'total_scored', CASE WHEN r.attempt_type = 'pre' THEN NULL ELSE r.total_scored END,
      'percentage',   CASE WHEN r.attempt_type = 'pre' THEN NULL ELSE r.percentage END
    ) ORDER BY r.created_at DESC)
    FROM survey_responses r
    JOIN surveys s ON s.id = r.survey_id
    WHERE r.user_id = v_user
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION get_assessment_review(p_survey_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_user_row_id();
  v_pre  survey_responses%ROWTYPE;
  v_post survey_responses%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in to view your review.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_post FROM survey_responses
   WHERE survey_id = p_survey_id AND user_id = v_user AND attempt_type = 'post';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The review opens after you submit the post-test.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pre FROM survey_responses
   WHERE survey_id = p_survey_id AND user_id = v_user AND attempt_type = 'pre';

  RETURN (
    SELECT jsonb_build_object(
      'survey_id', s.id,
      'title',     s.title,
      'questions', s.questions_data,
      'pre',  CASE WHEN v_pre.id IS NULL THEN NULL ELSE jsonb_build_object(
                'answers', v_pre.answers, 'score', v_pre.score,
                'total', v_pre.total_scored, 'percentage', v_pre.percentage,
                'submitted_at', v_pre.created_at) END,
      'post', jsonb_build_object(
                'answers', v_post.answers, 'score', v_post.score,
                'total', v_post.total_scored, 'percentage', v_post.percentage,
                'submitted_at', v_post.created_at)
    )
    FROM surveys s WHERE s.id = p_survey_id
  );
END $$;

-- Direct table access: admins only.
DROP POLICY IF EXISTS surveys_select_published_or_admin ON surveys;
DROP POLICY IF EXISTS surveys_select_admin ON surveys;
CREATE POLICY surveys_select_admin ON surveys
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS survey_responses_insert_own ON survey_responses;
DROP POLICY IF EXISTS survey_responses_select_own_or_admin ON survey_responses;
DROP POLICY IF EXISTS survey_responses_select_admin ON survey_responses;
CREATE POLICY survey_responses_select_admin ON survey_responses
  FOR SELECT USING (is_admin());

REVOKE ALL ON FUNCTION current_user_row_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION student_list_surveys() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION submit_assessment(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION student_my_results() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_assessment_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_user_row_id() TO authenticated;
GRANT EXECUTE ON FUNCTION student_list_surveys() TO authenticated;
GRANT EXECUTE ON FUNCTION submit_assessment(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION student_my_results() TO authenticated;
GRANT EXECUTE ON FUNCTION get_assessment_review(uuid) TO authenticated;

-- ------------------------------------------------------------
-- PHASE 25 — Link IEC materials to programs
--
-- program_materials is the IEC material <-> program link (one material
-- can support several programs). materials.program_id is untouched:
-- it still marks a program's own handouts.
--
-- A knowledge assessment now must name its program. Its FK becomes
-- ON DELETE RESTRICT: a program with an assessment can't be deleted
-- until the assessment is (the old SET NULL would now violate the
-- check, and CASCADE would silently delete pre/post data).
--
-- "One assessment per program" now counts only non-draft ones, so a
-- draft copy (Duplicate in the Survey Builder) can exist; only one per
-- program can be activated.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS program_materials (
  program_id  integer NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  material_id bigint  NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, material_id)
);

CREATE INDEX IF NOT EXISTS program_materials_material_id_idx
  ON program_materials (material_id);

ALTER TABLE program_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_materials_select_public ON program_materials;
CREATE POLICY program_materials_select_public ON program_materials
  FOR SELECT USING (true);
DROP POLICY IF EXISTS program_materials_insert_admin ON program_materials;
CREATE POLICY program_materials_insert_admin ON program_materials
  FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS program_materials_delete_admin ON program_materials;
CREATE POLICY program_materials_delete_admin ON program_materials
  FOR DELETE USING (is_admin());

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_knowledge_requires_program;
ALTER TABLE surveys ADD CONSTRAINT surveys_knowledge_requires_program
  CHECK (type <> 'knowledge' OR program_id IS NOT NULL);

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_program_id_fkey;
ALTER TABLE surveys ADD CONSTRAINT surveys_program_id_fkey
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS surveys_one_knowledge_per_program;
CREATE UNIQUE INDEX surveys_one_knowledge_per_program
  ON surveys (program_id)
  WHERE type = 'knowledge' AND status <> 'draft' AND archived_at IS NULL;

-- ------------------------------------------------------------
-- PHASE 26 — Material view tracking
--
-- One row per student per material. first_viewed_at is set once and
-- never changed; last_viewed_at and view_count update on every view.
-- Written only through record_material_view(), which identifies the
-- student from their session. activity_logs keeps its own
-- once-per-session 'view' rows as before.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_views (
  user_id         bigint  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id     bigint  NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at  timestamptz NOT NULL DEFAULT now(),
  view_count      integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, material_id)
);

CREATE INDEX IF NOT EXISTS material_views_material_id_idx
  ON material_views (material_id);

ALTER TABLE material_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_views_select_own_or_admin ON material_views;
CREATE POLICY material_views_select_own_or_admin ON material_views
  FOR SELECT USING (is_admin() OR user_id = current_user_row_id());

CREATE OR REPLACE FUNCTION record_material_view(p_material_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint;
BEGIN
  -- Students only: an admin previewing a material isn't a student view.
  SELECT id INTO v_user FROM users
   WHERE lower(email) = lower(auth.jwt() ->> 'email') AND role = 'student'
   LIMIT 1;
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM materials WHERE id = p_material_id) THEN
    RETURN;
  END IF;

  INSERT INTO material_views (user_id, material_id)
  VALUES (v_user, p_material_id)
  ON CONFLICT (user_id, material_id) DO UPDATE
    SET last_viewed_at = now(),
        view_count     = material_views.view_count + 1;
END $$;

REVOKE ALL ON FUNCTION record_material_view(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_material_view(bigint) TO authenticated;
