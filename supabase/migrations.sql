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
-- ROLLBACK of PHASE 24–26 (server-side scoring, program_materials,
-- material_views). The app code for those phases was reverted; this
-- puts the database back to how PHASE 22–23 left it, so the restored
-- code works again. Safe to re-run.
--
-- Drops program_materials and material_views, including any links and
-- view records made since PHASE 24–26 were applied.
-- ------------------------------------------------------------

-- PHASE 26
DROP FUNCTION IF EXISTS record_material_view(bigint);
DROP TABLE IF EXISTS material_views;

-- PHASE 25
DROP TABLE IF EXISTS program_materials;

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_knowledge_requires_program;

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_program_id_fkey;
ALTER TABLE surveys ADD CONSTRAINT surveys_program_id_fkey
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS surveys_one_knowledge_per_program;
CREATE UNIQUE INDEX surveys_one_knowledge_per_program
  ON surveys (program_id)
  WHERE type = 'knowledge' AND program_id IS NOT NULL AND archived_at IS NULL;

-- PHASE 24: the original (PHASE 5) policies come back.
DROP POLICY IF EXISTS surveys_select_admin ON surveys;
DROP POLICY IF EXISTS surveys_select_published_or_admin ON surveys;
CREATE POLICY surveys_select_published_or_admin ON surveys
  FOR SELECT USING (status <> 'draft' OR is_admin());

DROP POLICY IF EXISTS survey_responses_select_admin ON survey_responses;
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

DROP FUNCTION IF EXISTS get_assessment_review(uuid);
DROP FUNCTION IF EXISTS student_my_results();
DROP FUNCTION IF EXISTS submit_assessment(uuid, jsonb);
DROP FUNCTION IF EXISTS student_list_surveys();
DROP FUNCTION IF EXISTS strip_answer_key(jsonb);
DROP FUNCTION IF EXISTS current_user_row_id();

-- =========================================================
-- PHASE 27: parallel forms for knowledge assessments
-- =========================================================
-- A knowledge assessment can have a second, parallel form: Form A
-- (questions_data) is the pre-test, Form B (questions_data_post) is the
-- post-test. Each Form B item carries pairs_with = the id of the Form A
-- item it parallels (same point measured, its own text, options, and
-- correct_option). Scoring, attempt_type, and Learning Gain are
-- unchanged: each attempt is scored against the form it was taken on.
-- NULL or an empty array means the post-test reuses Form A, so every
-- existing single-form assessment keeps working as before.

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS questions_data_post jsonb;

-- True when Form B is empty, or when both forms have the same number of
-- items, every Form B item pairs with an existing Form A item, and every
-- Form A item has exactly one pair. Same rule as formPairingProblem() in
-- SurveyBuilder.tsx.
CREATE OR REPLACE FUNCTION survey_forms_are_paired(form_a jsonb, form_b jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    form_b IS NULL
    OR jsonb_typeof(form_b) <> 'array'
    OR jsonb_array_length(form_b) = 0
    OR (
      jsonb_typeof(form_a) = 'array'
      AND jsonb_array_length(form_a) = jsonb_array_length(form_b)
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(form_b) AS b(item)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(form_a) AS a(item)
          WHERE a.item ->> 'id' = b.item ->> 'pairs_with'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(form_a) AS a(item)
        WHERE (
          SELECT count(*) FROM jsonb_array_elements(form_b) AS b(item)
          WHERE b.item ->> 'pairs_with' = a.item ->> 'id'
        ) <> 1
      )
    )
$$;

-- A published (active) knowledge assessment must have paired forms.
-- Drafts and closed assessments can be mid-edit.
ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_post_form_paired;
ALTER TABLE surveys ADD CONSTRAINT surveys_post_form_paired
  CHECK (
    status IS DISTINCT FROM 'active'
    OR type IS DISTINCT FROM 'knowledge'
    OR survey_forms_are_paired(questions_data, questions_data_post)
  );

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 27 (run only to undo it). Dropping the column
-- deletes every Form B that has been written.
-- ---------------------------------------------------------
-- ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_post_form_paired;
-- DROP FUNCTION IF EXISTS survey_forms_are_paired(jsonb, jsonb);
-- ALTER TABLE surveys DROP COLUMN IF EXISTS questions_data_post;

-- =========================================================
-- PHASE 28: three knowledge assessments with parallel forms
-- =========================================================
-- Requires PHASE 27 (questions_data_post). Adds, as DRAFTS:
--   "Safe Spaces in Digital Places: Knowledge Check",
--   "Labor Education for Graduating Students: Knowledge Check", and
--   "Guardians of Dignity: Knowledge Check".
-- Form A (questions_data) is the pre-test and Form B
-- (questions_data_post) the post-test, 10 items each; Form B item N has
-- pairs_with = the id of Form A item N. Questions use the Assessment
-- Builder's shape (options are strings, correct_option is the option
-- text). Every item gets related_program_id = its program;
-- related_material_id is left empty. surveys.program_id is set too.
--
-- Safe to re-run: an assessment whose title already exists is skipped.
-- All or nothing: if a program title matches zero or several programs,
-- or a program already has a (non-archived) knowledge assessment, the
-- whole block stops with an error and nothing is inserted.
DO $phase28$
DECLARE
  spec record;
  v_count integer;
  v_program_id bigint;
  v_program_title text;
  v_service text;
  v_title text;
  v_existing text;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('Safe Spaces in Digital Places', 'Safe Spaces in Digital Places: Knowledge Check',
       $a1$[{"id":"safe-spaces-a1","text":"Which of the following is not one of the four forms of bullying named in the law?","type":"mcq","options":["Physical","Verbal and slanderous","Cyberbullying","Financial"],"required":true,"correct_option":"Financial","related_material_id":null},{"id":"safe-spaces-a2","text":"According to the law, what is cyberbullying?","type":"mcq","options":["Teasing someone on social media","Any bullying done through technology or other electronic means","Hacking someone's account","Spreading fake news"],"required":true,"correct_option":"Any bullying done through technology or other electronic means","related_material_id":null},{"id":"safe-spaces-a3","text":"Excluding, intimidating, or humiliating someone is an example of which form of bullying?","type":"mcq","options":["Physical","Psychological or emotional","Verbal","Cyberbullying"],"required":true,"correct_option":"Psychological or emotional","related_material_id":null},{"id":"safe-spaces-a4","text":"Making negative comments about a person's looks, clothes, or body is an example of:","type":"mcq","options":["Physical bullying","Verbal and slanderous bullying","Conflict","Doxxing"],"required":true,"correct_option":"Verbal and slanderous bullying","related_material_id":null},{"id":"safe-spaces-a5","text":"Must an act be both severe and repeated to count as bullying?","type":"mcq","options":["Yes, it must be both","No, it may be severe or repeated","Only repeated acts count","Only severe acts count"],"required":true,"correct_option":"No, it may be severe or repeated","related_material_id":null},{"id":"safe-spaces-a6","text":"A disagreement between people who can respond to each other on relatively equal terms is called:","type":"mcq","options":["Bullying","Conflict","Harassment","Cyberbullying"],"required":true,"correct_option":"Conflict","related_material_id":null},{"id":"safe-spaces-a7","text":"Which of the following may be a sign that someone is being bullied?","type":"mcq","options":["Joining more clubs","Withdrawing from friends and online spaces","Getting higher grades","Posting online more often"],"required":true,"correct_option":"Withdrawing from friends and online spaces","related_material_id":null},{"id":"safe-spaces-a8","text":"A classmate posts another student's home address and phone number to shame them. What is this?","type":"mcq","options":["Just a joke","Freedom of expression","Doxxing, which may violate the Data Privacy Act","Allowed, because social media is public"],"required":true,"correct_option":"Doxxing, which may violate the Data Privacy Act","related_material_id":null},{"id":"safe-spaces-a9","text":"Where can a campus-related privacy violation be reported?","type":"mcq","options":["Only at the barangay","The National Privacy Commission or the University Data Protection Officer","On social media","Only to a teacher"],"required":true,"correct_option":"The National Privacy Commission or the University Data Protection Officer","related_material_id":null},{"id":"safe-spaces-a10","text":"In a group chat, classmates pile on a student with insults and reaction emojis. What is the best thing to do?","type":"mcq","options":["React too, so you are not targeted next","Leave the chat and forget about it","Don't join in, speak up, and report it to the guidance office","Screenshot it and post it in another chat"],"required":true,"correct_option":"Don't join in, speak up, and report it to the guidance office","related_material_id":null}]$a1$::jsonb,
       $b1$[{"id":"safe-spaces-b1","text":"The law identifies four forms of bullying. Which of these is not one of them?","type":"mcq","options":["Psychological or emotional","Cyberbullying","Economic","Physical"],"required":true,"correct_option":"Economic","related_material_id":null,"pairs_with":"safe-spaces-a1"},{"id":"safe-spaces-b2","text":"Under the law, bullying is considered cyberbullying when it is:","type":"mcq","options":["Done by a stranger","About something a person posted online","Carried out through technology or any electronic means","Reported to the police"],"required":true,"correct_option":"Carried out through technology or any electronic means","related_material_id":null,"pairs_with":"safe-spaces-a2"},{"id":"safe-spaces-b3","text":"A student is deliberately left out of group activities and intimidated into staying away. This is an example of:","type":"mcq","options":["Psychological or emotional bullying","Physical bullying","Cyberbullying","Conflict"],"required":true,"correct_option":"Psychological or emotional bullying","related_material_id":null,"pairs_with":"safe-spaces-a3"},{"id":"safe-spaces-b4","text":"Calling a classmate insulting names because of their body is an example of:","type":"mcq","options":["Physical bullying","Psychological bullying","Verbal and slanderous bullying","Doxxing"],"required":true,"correct_option":"Verbal and slanderous bullying","related_material_id":null,"pairs_with":"safe-spaces-a4"},{"id":"safe-spaces-b5","text":"A harmful act happens only once, but it is severe. Can it still count as bullying under RA 10627?","type":"mcq","options":["No, it must happen more than once","Yes, because the law covers acts that are severe or repeated","Only if it happened online","Only if it was reported"],"required":true,"correct_option":"Yes, because the law covers acts that are severe or repeated","related_material_id":null,"pairs_with":"safe-spaces-a5"},{"id":"safe-spaces-b6","text":"Two classmates argue about how to divide their group work, and both can speak up equally. This is best described as:","type":"mcq","options":["Cyberbullying","Bullying","Conflict","Harassment"],"required":true,"correct_option":"Conflict","related_material_id":null,"pairs_with":"safe-spaces-a6"},{"id":"safe-spaces-b7","text":"Which change in a student may signal that they are being targeted?","type":"mcq","options":["A sudden drop in attendance or grades","Making more friends","Being more active in class","Starting a new hobby"],"required":true,"correct_option":"A sudden drop in attendance or grades","related_material_id":null,"pairs_with":"safe-spaces-a7"},{"id":"safe-spaces-b8","text":"Sharing a person's private photos or records online without consent to embarrass them may be:","type":"mcq","options":["Allowed if it is posted on a public page","A violation of the Data Privacy Act","Protected as free speech","Only a matter of school rules"],"required":true,"correct_option":"A violation of the Data Privacy Act","related_material_id":null,"pairs_with":"safe-spaces-a8"},{"id":"safe-spaces-b9","text":"Within the university, who handles concerns about a student's personal data being exposed?","type":"mcq","options":["The Office of the Registrar","The University Data Protection Officer","The campus library","The accounting office"],"required":true,"correct_option":"The University Data Protection Officer","related_material_id":null,"pairs_with":"safe-spaces-a9"},{"id":"safe-spaces-b10","text":"Someone shares embarrassing screenshots of a classmate in a group chat, and others start laughing. What should a responsible bystander do?","type":"mcq","options":["Add a laughing reaction","Refuse to join in, say it is not okay, and report it to the guidance office","Forward the screenshots to friends","Ignore it, since it is not about you"],"required":true,"correct_option":"Refuse to join in, say it is not okay, and report it to the guidance office","related_material_id":null,"pairs_with":"safe-spaces-a10"}]$b1$::jsonb),
      ('Labor Education for Graduating Students', 'Labor Education for Graduating Students: Knowledge Check',
       $a2$[{"id":"labor-education-a1","text":"How many hours make up a normal workday?","type":"mcq","options":["6","8","10","12"],"required":true,"correct_option":"8","related_material_id":null},{"id":"labor-education-a2","text":"How long may probationary employment last?","type":"mcq","options":["3 months","6 months","1 year","2 years"],"required":true,"correct_option":"6 months","related_material_id":null},{"id":"labor-education-a3","text":"When must the 13th month pay be given?","type":"mcq","options":["January","June","Not later than December 24","Any time the employer chooses"],"required":true,"correct_option":"Not later than December 24","related_material_id":null},{"id":"labor-education-a4","text":"How many days of service incentive leave does an employee get after one year of service?","type":"mcq","options":["3","5","7","10"],"required":true,"correct_option":"5","related_material_id":null},{"id":"labor-education-a5","text":"What is the minimum additional pay for overtime on an ordinary working day?","type":"mcq","options":["10%","25%","50%","100%"],"required":true,"correct_option":"25%","related_material_id":null},{"id":"labor-education-a6","text":"Night shift differential applies to work done between:","type":"mcq","options":["6 PM and 12 AM","10 PM and 6 AM","12 AM and 8 AM","Any hour at night"],"required":true,"correct_option":"10 PM and 6 AM","related_material_id":null},{"id":"labor-education-a7","text":"What is illegal recruitment?","type":"mcq","options":["Applying for jobs online","Recruiting workers for jobs abroad without a license","Declining a job offer","Changing jobs"],"required":true,"correct_option":"Recruiting workers for jobs abroad without a license","related_material_id":null},{"id":"labor-education-a8","text":"Which of these is a warning sign of illegal recruitment?","type":"mcq","options":["The agency has an office","Asking for fees before there is a job offer","There is a written contract","The agency is licensed by the DMW"],"required":true,"correct_option":"Asking for fees before there is a job offer","related_material_id":null},{"id":"labor-education-a9","text":"Where should you check whether a recruitment agency is licensed?","type":"mcq","options":["At the barangay","With the DMW","On the agency's Facebook page","With a friend"],"required":true,"correct_option":"With the DMW","related_material_id":null},{"id":"labor-education-a10","text":"Who should attend the Pre-Employment Orientation Seminar (PEOS)?","type":"mcq","options":["All employees","First-time applicants planning to work abroad","Retirees","Students only"],"required":true,"correct_option":"First-time applicants planning to work abroad","related_material_id":null}]$a2$::jsonb,
       $b2$[{"id":"labor-education-b1","text":"Under the Labor Code, normal hours of work should not exceed how many hours a day?","type":"mcq","options":["10","12","8","6"],"required":true,"correct_option":"8","related_material_id":null,"pairs_with":"labor-education-a1"},{"id":"labor-education-b2","text":"An employee is hired on probation. The probationary period generally should not go beyond:","type":"mcq","options":["1 year","3 months","6 months","2 years"],"required":true,"correct_option":"6 months","related_material_id":null,"pairs_with":"labor-education-a2"},{"id":"labor-education-b3","text":"The 13th month pay must be paid on or before:","type":"mcq","options":["December 24","December 31","January 15","June 12"],"required":true,"correct_option":"December 24","related_material_id":null,"pairs_with":"labor-education-a3"},{"id":"labor-education-b4","text":"After one year of service, an employee is entitled to a paid service incentive leave of:","type":"mcq","options":["5 days","7 days","10 days","15 days"],"required":true,"correct_option":"5 days","related_material_id":null,"pairs_with":"labor-education-a4"},{"id":"labor-education-b5","text":"An employee works beyond 8 hours on an ordinary working day. The extra hours must be paid at least:","type":"mcq","options":["The regular hourly rate","The regular hourly rate plus 25%","The regular hourly rate plus 50%","Double the regular hourly rate"],"required":true,"correct_option":"The regular hourly rate plus 25%","related_material_id":null,"pairs_with":"labor-education-a5"},{"id":"labor-education-b6","text":"Night shift differential applies to work performed between:","type":"mcq","options":["6 PM and 12 AM","10 PM and 6 AM","12 AM and 8 AM","8 PM and 4 AM"],"required":true,"correct_option":"10 PM and 6 AM","related_material_id":null,"pairs_with":"labor-education-a6"},{"id":"labor-education-b7","text":"A person offers jobs abroad and collects applicants but has no license from the DMW. This is:","type":"mcq","options":["Direct hiring","Illegal recruitment","A job fair","Legal, as long as no fees are charged"],"required":true,"correct_option":"Illegal recruitment","related_material_id":null,"pairs_with":"labor-education-a7"},{"id":"labor-education-b8","text":"Which offer should make you suspect illegal recruitment?","type":"mcq","options":["The agency shows its DMW license","You are given a written contract","You are told to leave on a tourist visa to work abroad","The agency has a physical office"],"required":true,"correct_option":"You are told to leave on a tourist visa to work abroad","related_material_id":null,"pairs_with":"labor-education-a8"},{"id":"labor-education-b9","text":"Before applying through a recruitment agency, you should first:","type":"mcq","options":["Pay a reservation fee","Confirm its license with the DMW","Ask for opinions online","Check how many followers its page has"],"required":true,"correct_option":"Confirm its license with the DMW","related_material_id":null,"pairs_with":"labor-education-a9"},{"id":"labor-education-b10","text":"The Pre-Employment Orientation Seminar (PEOS) is mainly for:","type":"mcq","options":["Employers","People applying to work abroad for the first time","Returning overseas workers only","Government employees"],"required":true,"correct_option":"People applying to work abroad for the first time","related_material_id":null,"pairs_with":"labor-education-a10"}]$b2$::jsonb),
      ('Guardians of Dignity', 'Guardians of Dignity: Knowledge Check',
       $a3$[{"id":"guardians-of-dignity-a1","text":"Which law prohibits hazing in college organizations?","type":"mcq","options":["RA 11313","RA 11053","RA 10627","RA 10175"],"required":true,"correct_option":"RA 11053","related_material_id":null},{"id":"guardians-of-dignity-a2","text":"Which of the following counts as hazing?","type":"mcq","options":["Learning the organization's history during orientation","Joining the organization's community outreach","Causing physical or psychological suffering as a condition for membership","Paying a membership fee"],"required":true,"correct_option":"Causing physical or psychological suffering as a condition for membership","related_material_id":null},{"id":"guardians-of-dignity-a3","text":"A fraternity is not recognized by the school. Is it covered by the Anti-Hazing Act?","type":"mcq","options":["No, only school-recognized groups are covered","Yes, all organizations are covered","Only if the initiation is held on campus","Only if a parent files a complaint"],"required":true,"correct_option":"Yes, all organizations are covered","related_material_id":null},{"id":"guardians-of-dignity-a4","text":"How many days before an initiation rite must a written application be submitted to the school?","type":"mcq","options":["3 days","5 days","7 days","30 days"],"required":true,"correct_option":"7 days","related_material_id":null},{"id":"guardians-of-dignity-a5","text":"How long may an initiation rite last at most?","type":"mcq","options":["1 day","3 days","7 days","No limit"],"required":true,"correct_option":"3 days","related_material_id":null},{"id":"guardians-of-dignity-a6","text":"How many school representatives must be present during an initiation rite?","type":"mcq","options":["One","Two","Three","None"],"required":true,"correct_option":"Two","related_material_id":null},{"id":"guardians-of-dignity-a7","text":"A neophyte agrees to be paddled. What is the legal status of this act?","type":"mcq","options":["Legal, because the person agreed","Legal if there is a signed waiver","Still hazing, because consent is not a defense","Legal if no injury results"],"required":true,"correct_option":"Still hazing, because consent is not a defense","related_material_id":null},{"id":"guardians-of-dignity-a8","text":"You watch a hazing and do nothing. What is your legal position?","type":"mcq","options":["No liability, since you did not hurt anyone","You may be treated as a participant unless you tried to stop it or promptly reported it","You are only a witness","Only the organization's officers are liable"],"required":true,"correct_option":"You may be treated as a participant unless you tried to stop it or promptly reported it","related_material_id":null},{"id":"guardians-of-dignity-a9","text":"You are invited to an initiation that involves paddling. What should you do?","type":"mcq","options":["Join so you are accepted","Attend but only watch","Decline and report it to the Office of Student Affairs or the Guidance Office","Keep it secret to protect the organization"],"required":true,"correct_option":"Decline and report it to the Office of Student Affairs or the Guidance Office","related_material_id":null},{"id":"guardians-of-dignity-a10","text":"What is the penalty when hazing results in death?","type":"mcq","options":["Community service","Suspension from school","Reclusion perpetua and a fine of ₱3 million","A fine of ₱10,000"],"required":true,"correct_option":"Reclusion perpetua and a fine of ₱3 million","related_material_id":null}]$a3$::jsonb,
       $b3$[{"id":"guardians-of-dignity-b1","text":"Republic Act No. 11053 is also known as the:","type":"mcq","options":["Safe Spaces Act","Anti-Hazing Act of 2018","Anti-Bullying Act of 2013","Cybercrime Prevention Act"],"required":true,"correct_option":"Anti-Hazing Act of 2018","related_material_id":null,"pairs_with":"guardians-of-dignity-a1"},{"id":"guardians-of-dignity-b2","text":"Under the Anti-Hazing Act, hazing refers to:","type":"mcq","options":["Any orientation activity for new members","Any act that causes physical or psychological suffering to a recruit or member as part of an initiation or membership requirement","The collection of membership dues","Required community service"],"required":true,"correct_option":"Any act that causes physical or psychological suffering to a recruit or member as part of an initiation or membership requirement","related_material_id":null,"pairs_with":"guardians-of-dignity-a2"},{"id":"guardians-of-dignity-b3","text":"Does the law also cover community-based organizations that have no connection to a school?","type":"mcq","options":["No, it covers school organizations only","Yes","Only fraternities and sororities","Only organizations registered with the SEC"],"required":true,"correct_option":"Yes","related_material_id":null,"pairs_with":"guardians-of-dignity-a3"},{"id":"guardians-of-dignity-b4","text":"An organization plans to hold an initiation rite. At the latest, when must it file its written application with the school?","type":"mcq","options":["The day before","7 days before","3 days before","No application is needed"],"required":true,"correct_option":"7 days before","related_material_id":null,"pairs_with":"guardians-of-dignity-a4"},{"id":"guardians-of-dignity-b5","text":"What is the maximum duration of an allowed initiation rite?","type":"mcq","options":["One week","5 days","3 days","1 day"],"required":true,"correct_option":"3 days","related_material_id":null,"pairs_with":"guardians-of-dignity-a5"},{"id":"guardians-of-dignity-b6","text":"Who must be present to observe an approved initiation rite?","type":"mcq","options":["The parents of the neophytes","A police officer","At least two representatives of the school","The barangay captain"],"required":true,"correct_option":"At least two representatives of the school","related_material_id":null,"pairs_with":"guardians-of-dignity-a6"},{"id":"guardians-of-dignity-b7","text":"A member defends a hazing by saying, \"He volunteered for it.\" Under the law:","type":"mcq","options":["This is a valid defense","This is not a defense; the consent of the person hazed does not excuse the act","It is valid only if the consent was in writing","It only reduces the penalty"],"required":true,"correct_option":"This is not a defense; the consent of the person hazed does not excuse the act","related_material_id":null,"pairs_with":"guardians-of-dignity-a7"},{"id":"guardians-of-dignity-b8","text":"Being present during a hazing without trying to stop it or reporting it can make a person:","type":"mcq","options":["Only a witness","Liable as a participant","Free from any liability","Liable only if they are an officer"],"required":true,"correct_option":"Liable as a participant","related_material_id":null,"pairs_with":"guardians-of-dignity-a8"},{"id":"guardians-of-dignity-b9","text":"A friend tells you their organization will \"test\" new members with physical punishment tonight. What is the best action?","type":"mcq","options":["Tell your friend to be careful","Report it immediately to school authorities such as the Office of Student Affairs","Attend to make sure no one gets hurt","Stay silent to avoid trouble"],"required":true,"correct_option":"Report it immediately to school authorities such as the Office of Student Affairs","related_material_id":null,"pairs_with":"guardians-of-dignity-a9"},{"id":"guardians-of-dignity-b10","text":"If hazing results in death, rape, sodomy, or mutilation, those who planned or took part in it face:","type":"mcq","options":["Suspension from school","A fine of ₱10,000","Reclusion perpetua and a fine of ₱3 million","Community service"],"required":true,"correct_option":"Reclusion perpetua and a fine of ₱3 million","related_material_id":null,"pairs_with":"guardians-of-dignity-a10"}]$b3$::jsonb)
    ) AS s(match, title, form_a, form_b)
  LOOP
    SELECT count(*) INTO v_count
      FROM programs
     WHERE archived_at IS NULL AND title ILIKE '%' || spec.match || '%';
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'PHASE 28: "%" matches % programs (needs exactly 1). Nothing was inserted.', spec.match, v_count;
    END IF;

    SELECT id, title, guidance_service INTO v_program_id, v_program_title, v_service
      FROM programs
     WHERE archived_at IS NULL AND title ILIKE '%' || spec.match || '%';

    v_title := spec.title;

    IF EXISTS (SELECT 1 FROM surveys WHERE title = v_title) THEN
      RAISE NOTICE 'PHASE 28: "%" already exists, skipped.', v_title;
      CONTINUE;
    END IF;

    SELECT string_agg(format('#%s "%s" (%s)', id, title, status), ', ') INTO v_existing
      FROM surveys
     WHERE type = 'knowledge' AND program_id = v_program_id AND archived_at IS NULL;
    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'PHASE 28: program #% already has a knowledge assessment: %. Nothing was inserted.', v_program_id, v_existing;
    END IF;

    INSERT INTO surveys (title, description, category, type, status, program_id, questions_data, questions_data_post)
    VALUES (
      v_title,
      NULL,
      COALESCE(NULLIF(v_service, ''), 'Other'),
      'knowledge',
      'draft',
      v_program_id,
      (SELECT jsonb_agg(q || jsonb_build_object('related_program_id', v_program_id) ORDER BY n)
         FROM jsonb_array_elements(spec.form_a) WITH ORDINALITY AS t(q, n)),
      (SELECT jsonb_agg(q || jsonb_build_object('related_program_id', v_program_id) ORDER BY n)
         FROM jsonb_array_elements(spec.form_b) WITH ORDINALITY AS t(q, n))
    );
    RAISE NOTICE 'PHASE 28: added "%" (program #%).', v_title, v_program_id;
  END LOOP;
END
$phase28$;

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 28 (run only to undo it). Removes the three
-- assessments only while they are still drafts with no responses.
-- ---------------------------------------------------------
-- DELETE FROM surveys s
--  WHERE s.type = 'knowledge'
--    AND s.status = 'draft'
--    AND s.title IN ('Safe Spaces in Digital Places: Knowledge Check',
--                    'Labor Education for Graduating Students: Knowledge Check',
--                    'Guardians of Dignity: Knowledge Check')
--    AND NOT EXISTS (SELECT 1 FROM survey_responses r WHERE r.survey_id = s.id);

-- =========================================================
-- PHASE 29: link IEC materials to programs, record views
-- =========================================================
-- program_materials links library IEC materials (materials.program_id IS
-- NULL) to programs. Handouts (materials.program_id set) are untouched
-- and can't be linked here. NOTE: this adds a second programs<->materials
-- path for PostgREST, so every programs->materials embed must name its
-- FK (materials!materials_program_id_fkey). The code does.
--
-- material_views keeps one row per student per material: first_viewed_at
-- is set once and never changed; last_viewed_at and view_count update on
-- every open. It is written only through record_material_view(), which
-- finds the student from the session (auth.uid()). No backfill from
-- activity_logs, which keeps its own 'view' rows for analytics.
--
-- The post-test lock (every linked, non-archived IEC material viewed;
-- locked while a program has none) is enforced in the UI in this phase
-- (src/lib/materialProgress.ts). PHASE 30 enforces it in submit_assessment.

CREATE TABLE IF NOT EXISTS program_materials (
  program_id  integer     NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  material_id bigint      NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, material_id)
);
ALTER TABLE program_materials ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS program_materials_material_id_idx
  ON program_materials (material_id);

-- Only library IEC materials can be linked, never a program's handouts.
CREATE OR REPLACE FUNCTION program_materials_iec_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM materials WHERE id = NEW.material_id AND program_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Only IEC library materials can be linked to a program (material % is a handout).', NEW.material_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS program_materials_iec_only ON program_materials;
CREATE TRIGGER program_materials_iec_only
  BEFORE INSERT OR UPDATE ON program_materials
  FOR EACH ROW EXECUTE FUNCTION program_materials_iec_only();

ALTER TABLE program_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_materials_select_public ON program_materials;
CREATE POLICY program_materials_select_public ON program_materials
  FOR SELECT USING (true);
DROP POLICY IF EXISTS program_materials_insert_admin ON program_materials;
CREATE POLICY program_materials_insert_admin ON program_materials
  FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS program_materials_update_admin ON program_materials;
CREATE POLICY program_materials_update_admin ON program_materials
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS program_materials_delete_admin ON program_materials;
CREATE POLICY program_materials_delete_admin ON program_materials
  FOR DELETE USING (is_admin());

GRANT SELECT ON program_materials TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON program_materials TO authenticated;

-- The signed-in student's users.id, from the session (auth.uid() ->
-- auth.users.email -> users). NULL for admins, archived accounts, and
-- anonymous callers.
CREATE OR REPLACE FUNCTION current_student_id() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id
    FROM users u
    JOIN auth.users au ON lower(au.email) = lower(u.email)
   WHERE au.id = auth.uid()
     AND u.role = 'student'
     AND u.archived_at IS NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION current_student_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_student_id() TO authenticated;

CREATE TABLE IF NOT EXISTS material_views (
  user_id         bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id     bigint      NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at  timestamptz NOT NULL DEFAULT now(),
  view_count      integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, material_id)
);

CREATE INDEX IF NOT EXISTS material_views_material_id_idx
  ON material_views (material_id);

ALTER TABLE material_views ENABLE ROW LEVEL SECURITY;

-- Read: a student sees only their own rows; admins see all. No write
-- policies: rows are written only by record_material_view().
DROP POLICY IF EXISTS material_views_select_own_or_admin ON material_views;
CREATE POLICY material_views_select_own_or_admin ON material_views
  FOR SELECT USING (is_admin() OR user_id = current_student_id());

REVOKE ALL ON material_views FROM anon;
REVOKE INSERT, UPDATE, DELETE ON material_views FROM authenticated;
GRANT SELECT ON material_views TO authenticated;

CREATE OR REPLACE FUNCTION record_material_view(p_material_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
BEGIN
  -- Students only (an admin previewing a material isn't a student view),
  -- and only real, non-archived materials.
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM materials WHERE id = p_material_id AND archived_at IS NULL) THEN
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

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 29 (run only to undo it). Deletes every link and
-- every recorded view.
-- ---------------------------------------------------------
-- DROP FUNCTION IF EXISTS record_material_view(bigint);
-- DROP TABLE IF EXISTS material_views;
-- DROP TABLE IF EXISTS program_materials;
-- DROP FUNCTION IF EXISTS program_materials_iec_only();
-- DROP FUNCTION IF EXISTS current_student_id();
-- NOTIFY pgrst, 'reload schema';

-- =========================================================
-- PHASE 30 (1a): hide answer keys, score on the server
-- =========================================================
-- Students never receive correct_option or pairs_with for either form.
--
-- surveys: anon and authenticated lose SELECT on questions_data and
-- questions_data_post (column privileges; every other column stays
-- readable, so lists, program pages and the public Programs page keep
-- working). Admins read both forms through admin_survey_forms() and
-- still write them with ordinary UPDATEs. A column added to surveys
-- later is NOT readable by anon/authenticated until it is granted.
--
-- Students load the form they are about to take through
-- get_assessment_questions() (answer keys stripped) and submit through
-- submit_assessment(), which picks the form, scores it, enforces the
-- PHASE 29 post-test lock and inserts the response (attempt_type still
-- comes from the set_attempt_type trigger). Direct INSERT into
-- survey_responses is closed, so a score can't come from the client.
-- Opinion surveys go through the same two functions.
--
-- survey_responses: students no longer SELECT the table directly; they
-- read their own rows through student_my_responses(), which hides a
-- pre-test score until that student's post-test exists. Admins read the
-- table as before. Existing responses are untouched and stay in
-- Learning Gain.
--
-- get_assessment_review() returns answers and correct answers only after
-- the student has submitted the post-test (post answers against Form B
-- when the assessment has one).

-- ---- shared helpers ----

-- The questions with the answer key removed. (Dropped first: an older
-- PHASE 24 version had a different parameter name.)
DROP FUNCTION IF EXISTS strip_answer_key(jsonb);
CREATE OR REPLACE FUNCTION strip_answer_key(p_questions jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(q - 'correct_option' - 'pairs_with' ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_questions) = 'array' THEN p_questions ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS t(q, ord)
$$;

-- The form a student answers for an attempt: Form B for a knowledge
-- post-test when the assessment has one, otherwise Form A.
CREATE OR REPLACE FUNCTION assessment_form_for(p_survey surveys, p_attempt text) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_survey.type = 'knowledge' AND p_attempt = 'post'
     AND jsonb_typeof(p_survey.questions_data_post) = 'array'
     AND jsonb_array_length(p_survey.questions_data_post) > 0
    THEN 'B' ELSE 'A' END
$$;

-- Why a student's post-test is locked, or NULL when it's open. Same rule
-- as src/lib/materialProgress.ts: every linked IEC material (not
-- archived, not a handout) viewed; locked while the program has none.
-- A knowledge check without a program has nothing to view: not locked.
CREATE OR REPLACE FUNCTION post_test_lock_reason(p_user bigint, p_program_id integer) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total integer;
  v_viewed integer;
BEGIN
  IF p_program_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM material_views mv
            WHERE mv.user_id = p_user AND mv.material_id = m.id))
    INTO v_total, v_viewed
    FROM program_materials pm
    JOIN materials m ON m.id = pm.material_id
   WHERE pm.program_id = p_program_id
     AND m.archived_at IS NULL
     AND m.program_id IS NULL;

  IF v_total = 0 THEN
    RETURN 'Materials for this program are coming soon.';
  END IF;
  IF v_viewed < v_total THEN
    RETURN format('View %s more material%s to unlock', v_total - v_viewed,
                  CASE WHEN v_total - v_viewed = 1 THEN '' ELSE 's' END);
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION post_test_lock_reason(bigint, integer) FROM PUBLIC, anon, authenticated;

-- The student's next attempt at a survey: 'pre' / 'post' for a knowledge
-- assessment, 'single' for an opinion survey, NULL when nothing is left.
CREATE OR REPLACE FUNCTION next_attempt_for(p_user bigint, p_survey surveys) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_survey.type IS DISTINCT FROM 'knowledge' THEN
      CASE WHEN EXISTS (SELECT 1 FROM survey_responses r
                         WHERE r.user_id = p_user AND r.survey_id = p_survey.id)
           THEN NULL ELSE 'single' END
    WHEN NOT EXISTS (SELECT 1 FROM survey_responses r
                      WHERE r.user_id = p_user AND r.survey_id = p_survey.id AND r.attempt_type = 'pre')
      THEN 'pre'
    WHEN NOT EXISTS (SELECT 1 FROM survey_responses r
                      WHERE r.user_id = p_user AND r.survey_id = p_survey.id AND r.attempt_type = 'post')
      THEN 'post'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION next_attempt_for(bigint, surveys) FROM PUBLIC, anon, authenticated;

-- ---- student functions ----

-- Question counts per form for the open surveys (the Assessment page
-- cards show "10 questions" before anything is loaded).
CREATE OR REPLACE FUNCTION active_survey_question_counts()
RETURNS TABLE (survey_id uuid, form_a_count integer, form_b_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id,
         CASE WHEN jsonb_typeof(s.questions_data) = 'array' THEN jsonb_array_length(s.questions_data) ELSE 0 END,
         CASE WHEN jsonb_typeof(s.questions_data_post) = 'array' THEN jsonb_array_length(s.questions_data_post) ELSE 0 END
    FROM surveys s
   WHERE s.status = 'active' AND s.archived_at IS NULL
$$;

REVOKE ALL ON FUNCTION active_survey_question_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION active_survey_question_counts() TO authenticated;

-- The questions of the form the signed-in student takes next, without
-- correct_option or pairs_with. Form A for a pre-test or an opinion
-- survey; Form B for a post-test when the assessment has one.
CREATE OR REPLACE FUNCTION get_assessment_questions(p_survey_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_attempt text;
  v_form text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account to take assessments.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_survey FROM surveys
   WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
  END IF;

  v_attempt := next_attempt_for(v_user, v_survey);
  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
  END IF;

  v_form := assessment_form_for(v_survey, v_attempt);
  RETURN jsonb_build_object(
    'survey_id', v_survey.id,
    'attempt_type', CASE WHEN v_attempt = 'single' THEN NULL ELSE v_attempt END,
    'form', v_form,
    'post_test_lock', CASE WHEN v_attempt = 'post'
                           THEN post_test_lock_reason(v_user, v_survey.program_id) END,
    'questions', strip_answer_key(CASE WHEN v_form = 'B' THEN v_survey.questions_data_post
                                       ELSE v_survey.questions_data END)
  );
END $$;

REVOKE ALL ON FUNCTION get_assessment_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_assessment_questions(uuid) TO authenticated;

-- Submits the signed-in student's answers. The server picks the form,
-- scores it (multiple-choice items with a correct answer; the answer
-- must equal the correct option exactly, as the old client scoring did),
-- rejects a locked post-test, and inserts the response. A pre-test's
-- score is stored but not returned.
CREATE OR REPLACE FUNCTION submit_assessment(p_survey_id uuid, p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_attempt text;
  v_form text;
  v_questions jsonb;
  v_lock text;
  v_score integer;
  v_total integer;
  v_percentage numeric;
  v_row survey_responses;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account to submit.' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers must be an object keyed by question id.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_survey FROM surveys
   WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
  END IF;

  v_attempt := next_attempt_for(v_user, v_survey);
  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
  END IF;

  IF v_attempt = 'post' THEN
    v_lock := post_test_lock_reason(v_user, v_survey.program_id);
    IF v_lock IS NOT NULL THEN
      RAISE EXCEPTION 'Post-test locked: %', v_lock USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_survey.type = 'knowledge' THEN
    v_form := assessment_form_for(v_survey, v_attempt);
    v_questions := CASE WHEN v_form = 'B' THEN v_survey.questions_data_post ELSE v_survey.questions_data END;

    SELECT count(*),
           count(*) FILTER (WHERE p_answers ->> (q ->> 'id') = q ->> 'correct_option')
      INTO v_total, v_score
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END
           ) AS t(q)
     WHERE q ->> 'type' = 'mcq'
       AND coalesce(q ->> 'correct_option', '') <> '';

    v_percentage := CASE WHEN v_total > 0 THEN round(v_score * 100.0 / v_total) END;
  END IF;

  INSERT INTO survey_responses (user_id, survey_id, answers, score, total_scored, percentage)
  VALUES (v_user, v_survey.id, p_answers, v_score, v_total, v_percentage)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'attempt_type', v_row.attempt_type,
    'form', v_form,
    'score', CASE WHEN v_row.attempt_type = 'pre' THEN NULL ELSE v_row.score END,
    'total_scored', CASE WHEN v_row.attempt_type = 'pre' THEN NULL ELSE v_row.total_scored END,
    'percentage', CASE WHEN v_row.attempt_type = 'pre' THEN NULL ELSE v_row.percentage END
  );
END $$;

REVOKE ALL ON FUNCTION submit_assessment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_assessment(uuid, jsonb) TO authenticated;

-- Dropped first in case an earlier version returned a table.
DROP FUNCTION IF EXISTS student_my_responses();

-- The signed-in student's own responses (newest first). A pre-test's score stays NULL
-- until the same student's post-test for that assessment exists.
CREATE OR REPLACE FUNCTION student_my_responses() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'survey_id', r.survey_id,
           'attempt_type', r.attempt_type,
           'score', CASE WHEN r.attempt_type = 'pre' AND NOT hp.has_post THEN NULL ELSE r.score END,
           'total_scored', CASE WHEN r.attempt_type = 'pre' AND NOT hp.has_post THEN NULL ELSE r.total_scored END,
           'percentage', CASE WHEN r.attempt_type = 'pre' AND NOT hp.has_post THEN NULL ELSE r.percentage END,
           'created_at', r.created_at
         ) ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM survey_responses r
    CROSS JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM survey_responses p
                      WHERE p.user_id = r.user_id AND p.survey_id = r.survey_id
                        AND p.attempt_type = 'post') AS has_post
    ) hp
   WHERE r.user_id = current_student_id()
$$;

REVOKE ALL ON FUNCTION student_my_responses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION student_my_responses() TO authenticated;

-- After the student's post-test only: both forms with their answer keys
-- (pairs_with left out), the pre-test answers against Form A, and the
-- post-test answers against the form it used (Form B when there is one).
CREATE OR REPLACE FUNCTION get_assessment_review(p_survey_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_pre survey_responses;
  v_post survey_responses;
  v_post_form text;
  v_pre_json jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_survey FROM surveys WHERE id = p_survey_id AND type = 'knowledge';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_post FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'post'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The review opens after you submit the post-test.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pre FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'pre'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    v_pre_json := jsonb_build_object(
      'form', 'A',
      'questions', (SELECT coalesce(jsonb_agg(q - 'pairs_with' ORDER BY ord), '[]'::jsonb)
                      FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(v_survey.questions_data) = 'array'
                                  THEN v_survey.questions_data ELSE '[]'::jsonb END
                           ) WITH ORDINALITY t(q, ord)),
      'answers', v_pre.answers,
      'score', v_pre.score, 'total_scored', v_pre.total_scored,
      'percentage', v_pre.percentage, 'created_at', v_pre.created_at);
  END IF;

  v_post_form := assessment_form_for(v_survey, 'post');

  RETURN jsonb_build_object(
    'survey_id', v_survey.id,
    'title', v_survey.title,
    'pre', v_pre_json,
    'post', jsonb_build_object(
      'form', v_post_form,
      'questions', (SELECT coalesce(jsonb_agg(q - 'pairs_with' ORDER BY ord), '[]'::jsonb)
                      FROM jsonb_array_elements(
                             CASE WHEN v_post_form = 'B' THEN v_survey.questions_data_post
                                  WHEN jsonb_typeof(v_survey.questions_data) = 'array' THEN v_survey.questions_data
                                  ELSE '[]'::jsonb END
                           ) WITH ORDINALITY t(q, ord)),
      'answers', v_post.answers,
      'score', v_post.score, 'total_scored', v_post.total_scored,
      'percentage', v_post.percentage, 'created_at', v_post.created_at)
  );
END $$;

REVOKE ALL ON FUNCTION get_assessment_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_assessment_review(uuid) TO authenticated;

-- ---- admin function ----

-- Both forms, answer keys included, for the builder and Analytics.
CREATE OR REPLACE FUNCTION admin_survey_forms(p_survey_ids uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, questions_data jsonb, questions_data_post jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.id, s.questions_data::jsonb, s.questions_data_post::jsonb
      FROM surveys s
     WHERE p_survey_ids IS NULL OR s.id = ANY (p_survey_ids);
END $$;

REVOKE ALL ON FUNCTION admin_survey_forms(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_survey_forms(uuid[]) TO authenticated;

-- ---- privileges and policies ----

-- surveys: every column except the two forms stays readable.
REVOKE SELECT ON surveys FROM anon, authenticated;
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'surveys'
     AND column_name NOT IN ('questions_data', 'questions_data_post');
  EXECUTE format('GRANT SELECT (%s) ON surveys TO anon, authenticated', v_cols);
END $$;

-- survey_responses: no direct inserts (submit_assessment only), and
-- students read through student_my_responses(). Admin delete (PHASE 9)
-- is unchanged.
DROP POLICY IF EXISTS survey_responses_insert_own ON survey_responses;
REVOKE INSERT, UPDATE ON survey_responses FROM anon, authenticated;

DROP POLICY IF EXISTS survey_responses_select_own_or_admin ON survey_responses;
DROP POLICY IF EXISTS survey_responses_select_admin ON survey_responses;
CREATE POLICY survey_responses_select_admin ON survey_responses
  FOR SELECT USING (is_admin());

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 30 (run only to undo it). Students go back to
-- loading answer keys and inserting their own scores; responses
-- submitted meanwhile are kept.
-- ---------------------------------------------------------
-- GRANT SELECT ON surveys TO anon, authenticated;
-- GRANT INSERT, UPDATE ON survey_responses TO anon, authenticated;
-- DROP POLICY IF EXISTS survey_responses_select_admin ON survey_responses;
-- DROP POLICY IF EXISTS survey_responses_select_own_or_admin ON survey_responses;
-- CREATE POLICY survey_responses_select_own_or_admin ON survey_responses
--   FOR SELECT USING (
--     is_admin() OR
--     user_id IN (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email'))
--   );
-- DROP POLICY IF EXISTS survey_responses_insert_own ON survey_responses;
-- CREATE POLICY survey_responses_insert_own ON survey_responses
--   FOR INSERT WITH CHECK (
--     user_id IN (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email'))
--   );
-- DROP FUNCTION IF EXISTS admin_survey_forms(uuid[]);
-- DROP FUNCTION IF EXISTS get_assessment_review(uuid);
-- DROP FUNCTION IF EXISTS student_my_responses();
-- DROP FUNCTION IF EXISTS submit_assessment(uuid, jsonb);
-- DROP FUNCTION IF EXISTS get_assessment_questions(uuid);
-- DROP FUNCTION IF EXISTS active_survey_question_counts();
-- DROP FUNCTION IF EXISTS next_attempt_for(bigint, surveys);
-- DROP FUNCTION IF EXISTS post_test_lock_reason(bigint, integer);
-- DROP FUNCTION IF EXISTS assessment_form_for(surveys, text);
-- DROP FUNCTION IF EXISTS strip_answer_key(jsonb);
-- NOTIFY pgrst, 'reload schema';

-- =========================================================
-- PHASE 31: Learning Gain counts only true pre-tests
-- =========================================================
-- A student counts in a program's gain only if their pre-test was
-- submitted before they first opened any IEC material linked to that
-- program (material_views.first_viewed_at, program_materials). Students
-- who opened one at or before the pre-test are left out of paired_n,
-- incomplete_n, ceiling_n and every mean, and counted separately in
-- viewed_before_pre_n (per row, like the other counts). Students with no
-- recorded view before the pre-test count as before, including everyone
-- from before PHASE 29 (views weren't recorded then).
--
-- Same signature as PHASE 23, so CREATE OR REPLACE keeps the grants.

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
      -- PHASE 31: opened one of the program's linked IEC materials at or
      -- before the pre-test, so the pre-test isn't a true baseline.
      EXISTS (
        SELECT 1
          FROM material_views mv
          JOIN program_materials pm ON pm.material_id = mv.material_id
         WHERE pm.program_id = ps.program_id
           AND mv.user_id = ps.user_id
           AND mv.first_viewed_at <= ps.pre_at
      ) AS viewed_before_pre,
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
      COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre)                AS paired_n,
      COUNT(*) FILTER (WHERE post IS NULL     AND NOT viewed_before_pre)                AS incomplete_n,
      COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre AND pre >= 100) AS ceiling_n,
      COUNT(*) FILTER (WHERE viewed_before_pre)                                         AS viewed_before_pre_n,
      AVG(pre)                FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_pre,
      AVG(post)               FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_post,
      AVG(post - pre)         FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_gain,
      STDDEV_SAMP(post - pre) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS sd_diff
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
        'viewed_before_pre_n', g.viewed_before_pre_n,
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

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 31 (run only to undo it): restores the PHASE 23
-- version, which counts every student with a pre-test.
-- ---------------------------------------------------------
-- CREATE OR REPLACE FUNCTION learning_gain_summary(
--   p_program_id    integer DEFAULT NULL,
--   p_course        text    DEFAULT NULL,
--   p_year_level    text    DEFAULT NULL,
--   p_gender        text    DEFAULT NULL,
--   p_age_bracket   text    DEFAULT NULL,
--   p_academic_year integer DEFAULT NULL,
--   p_age_brackets  jsonb   DEFAULT '[
--     {"label": "17–18",        "min": 17, "max": 18},
--     {"label": "19–20",        "min": 19, "max": 20},
--     {"label": "21–22",        "min": 21, "max": 22},
--     {"label": "23 and above", "min": 23, "max": null}
--   ]'::jsonb
-- ) RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
-- DECLARE
--   result jsonb;
-- BEGIN
--   IF NOT is_admin() THEN
--     RAISE EXCEPTION 'Only admins can view learning gain analytics'
--       USING ERRCODE = '42501';
--   END IF;
--
--   WITH per_student AS (
--     -- One row per student per assessment: their pre and post scores.
--     SELECT
--       r.user_id,
--       r.survey_id,
--       s.program_id,
--       MAX(COALESCE(r.score::numeric * 100 / NULLIF(r.total_scored, 0), r.percentage))
--         FILTER (WHERE r.attempt_type = 'pre')  AS pre,
--       MAX(COALESCE(r.score::numeric * 100 / NULLIF(r.total_scored, 0), r.percentage))
--         FILTER (WHERE r.attempt_type = 'post') AS post,
--       MIN(r.created_at) FILTER (WHERE r.attempt_type = 'pre') AS pre_at
--     FROM survey_responses r
--     JOIN surveys s ON s.id = r.survey_id
--     WHERE s.type = 'knowledge'
--       AND s.program_id IS NOT NULL
--       AND r.attempt_type IN ('pre', 'post')
--     GROUP BY r.user_id, r.survey_id, s.program_id
--   ),
--   students AS (
--     SELECT
--       ps.*,
--       COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified')    AS course,
--       COALESCE(NULLIF(TRIM(prof.year_level), ''), 'Not specified') AS year_level,
--       COALESCE(NULLIF(TRIM(prof.gender), ''), 'Not specified')     AS gender,
--       CASE WHEN prof.is_pwd THEN 'PWD' ELSE 'Non-PWD' END          AS pwd,
--       CASE WHEN prof.is_ip  THEN 'IP'  ELSE 'Non-IP'  END          AS ip,
--       CASE
--         WHEN prof.age IS NULL THEN 'Not specified'
--         ELSE COALESCE(
--           (SELECT b ->> 'label'
--              FROM jsonb_array_elements(p_age_brackets) b
--             WHERE prof.age >= (b ->> 'min')::int
--               AND (b ->> 'max' IS NULL OR prof.age <= (b ->> 'max')::int)
--             LIMIT 1),
--           'Outside brackets')
--       END AS age_bracket
--     FROM per_student ps
--     JOIN users u ON u.id = ps.user_id AND NOT u.is_test_account
--     LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
--     LEFT JOIN LATERAL (
--       SELECT p.*
--         FROM profiles p
--        WHERE p.id = au.id
--           OR (u.student_id IS NOT NULL AND p.student_id = u.student_id)
--        ORDER BY (p.id = au.id) DESC NULLS LAST
--        LIMIT 1
--     ) prof ON true
--     WHERE ps.pre IS NOT NULL
--   ),
--   filtered AS (
--     SELECT *
--       FROM students
--      WHERE (p_program_id    IS NULL OR program_id  = p_program_id)
--        AND (p_course        IS NULL OR course      = p_course)
--        AND (p_year_level    IS NULL OR year_level  = p_year_level)
--        AND (p_gender        IS NULL OR gender      = p_gender)
--        AND (p_age_bracket   IS NULL OR age_bracket = p_age_bracket)
--        AND (p_academic_year IS NULL OR EXTRACT(YEAR FROM pre_at)::int = p_academic_year)
--   ),
--   grouped AS (
--     SELECT
--       CASE
--         WHEN GROUPING(program_id)  = 0 THEN 'program'
--         WHEN GROUPING(course)      = 0 THEN 'course'
--         WHEN GROUPING(gender)      = 0 THEN 'gender'
--         WHEN GROUPING(age_bracket) = 0 THEN 'age_bracket'
--         WHEN GROUPING(year_level)  = 0 THEN 'year_level'
--         WHEN GROUPING(pwd)         = 0 THEN 'pwd'
--         WHEN GROUPING(ip)          = 0 THEN 'ip'
--         ELSE 'overall'
--       END AS dimension,
--       COALESCE(program_id::text, course, gender, age_bracket, year_level, pwd, ip, 'All') AS key,
--       COUNT(*) FILTER (WHERE post IS NOT NULL)                AS paired_n,
--       COUNT(*) FILTER (WHERE post IS NULL)                    AS incomplete_n,
--       COUNT(*) FILTER (WHERE post IS NOT NULL AND pre >= 100) AS ceiling_n,
--       AVG(pre)                FILTER (WHERE post IS NOT NULL) AS mean_pre,
--       AVG(post)               FILTER (WHERE post IS NOT NULL) AS mean_post,
--       AVG(post - pre)         FILTER (WHERE post IS NOT NULL) AS mean_gain,
--       STDDEV_SAMP(post - pre) FILTER (WHERE post IS NOT NULL) AS sd_diff
--     FROM filtered
--     GROUP BY GROUPING SETS (
--       (program_id), (course), (gender), (age_bracket), (year_level), (pwd), (ip), ()
--     )
--   )
--   SELECT jsonb_build_object(
--     'rows', COALESCE((
--       SELECT jsonb_agg(jsonb_build_object(
--         'dimension',    g.dimension,
--         'key',          g.key,
--         'paired_n',     g.paired_n,
--         'incomplete_n', g.incomplete_n,
--         'ceiling_n',    g.ceiling_n,
--         'mean_pre',     ROUND(g.mean_pre, 2),
--         'mean_post',    ROUND(g.mean_post, 2),
--         'mean_gain',    ROUND(g.mean_gain, 2),
--         'sd_diff',      ROUND(g.sd_diff, 4),
--         'norm_gain',    CASE
--                           WHEN g.mean_pre IS NULL OR g.mean_pre >= 100 THEN NULL
--                           ELSE ROUND((g.mean_post - g.mean_pre) / (100 - g.mean_pre), 4)
--                         END
--       ))
--       FROM grouped g
--     ), '[]'::jsonb),
--     -- Filter choices, from all (unfiltered) data so picking one filter
--     -- never hides the options of another.
--     'options', jsonb_build_object(
--       'programs', COALESCE((
--         SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) ORDER BY p.title)
--           FROM programs p
--          WHERE EXISTS (
--            SELECT 1 FROM surveys s
--             WHERE s.program_id = p.id AND s.type = 'knowledge' AND s.archived_at IS NULL
--          )
--       ), '[]'::jsonb),
--       'courses',     COALESCE((SELECT jsonb_agg(DISTINCT course)     FROM students), '[]'::jsonb),
--       'year_levels', COALESCE((SELECT jsonb_agg(DISTINCT year_level) FROM students), '[]'::jsonb),
--       'genders',     COALESCE((SELECT jsonb_agg(DISTINCT gender)     FROM students), '[]'::jsonb),
--       'years',       COALESCE((SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM pre_at)::int) FROM students), '[]'::jsonb)
--     )
--   ) INTO result;
--
--   RETURN result;
-- END $$;
--
-- REVOKE ALL ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb) TO authenticated;


-- =========================================================
-- PHASE 32: Material reach by course (admin-only RPC)
-- =========================================================
-- For each course (profiles.program) and year level: how many students
-- have an account, and how many opened at least one linked IEC material
-- (material_views joined to program_materials). With p_iec_program_id
-- NULL any linked material counts; with a program id only that
-- program's links count. Archived programs and archived materials are
-- ignored. Test accounts are excluded unless p_include_test is true.
-- Counts only: no names, emails or ids are returned.
--
-- Filters follow the Analytics dashboard: campus, course, gender and
-- year level compare case-insensitively (year level is normalised the
-- way the client's getYearLevel does); age is a min/max range; academic
-- year is the year of profiles.created_at. Students without a profile
-- are counted as "Not specified" and drop out when a profile filter is set.
--
-- Views before PHASE 29 were never recorded, so older students can look
-- less reached than they were.

CREATE OR REPLACE FUNCTION material_reach_summary(
  p_campus         text    DEFAULT NULL,
  p_course         text    DEFAULT NULL,
  p_year_level     text    DEFAULT NULL,
  p_gender         text    DEFAULT NULL,
  p_age_min        integer DEFAULT NULL,
  p_age_max        integer DEFAULT NULL,
  p_academic_year  integer DEFAULT NULL,
  p_iec_program_id integer DEFAULT NULL,
  p_include_test   boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can view material reach analytics'
      USING ERRCODE = '42501';
  END IF;

  WITH linked AS (
    SELECT DISTINCT pm.material_id
      FROM program_materials pm
      JOIN programs  pr ON pr.id = pm.program_id  AND pr.archived_at IS NULL
      JOIN materials m  ON m.id  = pm.material_id AND m.archived_at  IS NULL
     WHERE p_iec_program_id IS NULL OR pm.program_id = p_iec_program_id
  ),
  students AS (
    SELECT
      u.id AS user_id,
      COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified') AS course,
      CASE TRIM(COALESCE(prof.year_level, ''))
        WHEN ''  THEN 'Not Specified'
        WHEN '1' THEN '1st Year'
        WHEN '2' THEN '2nd Year'
        WHEN '3' THEN '3rd Year'
        WHEN '4' THEN '4th Year'
        WHEN '5' THEN '5th Year'
        ELSE TRIM(prof.year_level)
      END AS year_level,
      prof.campus, prof.gender, prof.age, prof.created_at AS profile_created_at,
      EXISTS (
        SELECT 1 FROM material_views mv
         WHERE mv.user_id = u.id
           AND mv.material_id IN (SELECT material_id FROM linked)
      ) AS reached
    FROM users u
    LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
    LEFT JOIN LATERAL (
      SELECT p.program, p.year_level, p.campus, p.gender, p.age, p.created_at
        FROM profiles p
       WHERE p.id = au.id
          OR (u.student_id IS NOT NULL AND p.student_id = u.student_id)
       ORDER BY (p.id = au.id) DESC NULLS LAST
       LIMIT 1
    ) prof ON true
    WHERE u.role = 'student'
      AND u.archived_at IS NULL
      AND (p_include_test OR NOT u.is_test_account)
  ),
  filtered AS (
    SELECT *
      FROM students
     WHERE (p_campus   IS NULL OR lower(TRIM(COALESCE(campus, ''))) = lower(TRIM(p_campus)))
       AND (p_course   IS NULL OR lower(course) = lower(TRIM(p_course)))
       AND (p_year_level IS NULL OR lower(year_level) = lower(TRIM(p_year_level)))
       AND (p_gender   IS NULL OR lower(TRIM(COALESCE(gender, ''))) = lower(TRIM(p_gender)))
       AND ((p_age_min IS NULL AND p_age_max IS NULL)
            OR (age IS NOT NULL
                AND (p_age_min IS NULL OR age >= p_age_min)
                AND (p_age_max IS NULL OR age <= p_age_max)))
       AND (p_academic_year IS NULL
            OR EXTRACT(YEAR FROM profile_created_at)::int = p_academic_year)
  ),
  by_course AS (
    SELECT course AS key, COUNT(*) AS students, COUNT(*) FILTER (WHERE reached) AS reached
      FROM filtered GROUP BY course
  ),
  by_year AS (
    SELECT year_level AS key, COUNT(*) AS students, COUNT(*) FILTER (WHERE reached) AS reached
      FROM filtered GROUP BY year_level
  )
  SELECT jsonb_build_object(
    'by_course', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'key', key, 'students', students, 'reached', reached,
               'pct', ROUND(100.0 * reached / NULLIF(students, 0), 1))
             ORDER BY reached::numeric / NULLIF(students, 0) ASC NULLS LAST, students DESC, key)
        FROM by_course
    ), '[]'::jsonb),
    'by_year_level', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'key', key, 'students', students, 'reached', reached,
               'pct', ROUND(100.0 * reached / NULLIF(students, 0), 1))
             ORDER BY CASE key WHEN '1st Year' THEN 1 WHEN '2nd Year' THEN 2 WHEN '3rd Year' THEN 3
                               WHEN '4th Year' THEN 4 WHEN '5th Year' THEN 5
                               WHEN 'Not Specified' THEN 99 ELSE 50 END, key)
        FROM by_year
    ), '[]'::jsonb),
    'overall', (
      SELECT jsonb_build_object(
               'students', COUNT(*), 'reached', COUNT(*) FILTER (WHERE reached),
               'pct', ROUND(100.0 * COUNT(*) FILTER (WHERE reached) / NULLIF(COUNT(*), 0), 1))
        FROM filtered
    ),
    'linked_materials', (SELECT COUNT(*) FROM linked),
    'options', jsonb_build_object(
      'iec_programs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) ORDER BY p.title)
          FROM programs p WHERE p.archived_at IS NULL
      ), '[]'::jsonb)
    )
  ) INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 32 (run only to undo it).
-- ---------------------------------------------------------
-- DROP FUNCTION IF EXISTS material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean);
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 33: Data privacy consent (RA 10173)
-- =========================================================
-- users.consent_version / consent_given_at hold the student's CURRENT
-- consent (the app gates on consent_version = the current notice version).
-- Existing accounts keep NULL, so each student sees the consent screen
-- once at their next sign-in. Admins and staff are not gated.
--
-- consent_log is the append-only history: one row each time a student
-- agrees. Rows are written only by record_my_consent() (existing
-- students) and /api/register (service role, new students). Students can
-- read only their own rows, admins can read all, and nobody can update
-- or delete through the API (no privileges, no policies, plus a trigger
-- that rejects UPDATE). Rows go only when the user is deleted (CASCADE),
-- which is how a data-erasure request is honored.

ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_given_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version  text;

CREATE TABLE IF NOT EXISTS consent_log (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_version text        NOT NULL,
  given_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_log_user_id_idx ON consent_log (user_id);

ALTER TABLE consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_log_select_own_or_admin ON consent_log;
CREATE POLICY consent_log_select_own_or_admin ON consent_log
  FOR SELECT USING (is_admin() OR user_id = current_student_id());

REVOKE ALL ON consent_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON consent_log TO authenticated;

CREATE OR REPLACE FUNCTION consent_log_no_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'consent_log is append-only';
END $$;

DROP TRIGGER IF EXISTS consent_log_no_update ON consent_log;
CREATE TRIGGER consent_log_no_update
  BEFORE UPDATE ON consent_log
  FOR EACH ROW EXECUTE FUNCTION consent_log_no_update();

-- A signed-in student records their own consent to the given notice
-- version. Calling it again for the version already on file does nothing.
CREATE OR REPLACE FUNCTION record_my_consent(p_version text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Only students can record consent' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR p_version !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid consent version' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = v_user AND consent_version = p_version) THEN
    RETURN;
  END IF;

  UPDATE users
     SET consent_given_at = now(),
         consent_version  = p_version
   WHERE id = v_user;

  INSERT INTO consent_log (user_id, consent_version) VALUES (v_user, p_version);
END $$;

REVOKE ALL ON FUNCTION record_my_consent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_my_consent(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 33 (run only to undo it). Deletes every recorded
-- consent, current and historical.
-- ---------------------------------------------------------
-- DROP FUNCTION IF EXISTS record_my_consent(text);
-- DROP TABLE IF EXISTS consent_log;
-- DROP FUNCTION IF EXISTS consent_log_no_update();
-- ALTER TABLE users DROP COLUMN IF EXISTS consent_version;
-- ALTER TABLE users DROP COLUMN IF EXISTS consent_given_at;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 34: pre-test score, post-test review without the key, badges
-- =========================================================
-- 1. A pre-test's SCORE (score, total, percentage) is now returned by
--    submit_assessment and shown by student_my_responses straight away.
--    Per-item detail for the pre-test (Form A) is never returned.
-- 2. get_assessment_review() is rebuilt from an allowlist. After the
--    student's post-test it returns the pre-test score only (no Form A
--    item text, ids, answers or marks), the post-test (Form B) score, a
--    per-item list (id, text, type, the student's own answer, is_correct,
--    related links) and the pre-vs-post comparison. It never returns
--    correct_option, pairs_with or the options.
-- 3. my_badges() derives participation/completion badges from existing
--    data. Nothing rewards score gain. PASS_THRESHOLD_PCT lives in
--    src/lib/assessment.ts and in pass_threshold_pct() below: change both.
--
-- Run with the client deploy: an older cached client reads the review in
-- its previous shape.

-- Percentage a post-test needs to count as passed (and be shown green).
CREATE OR REPLACE FUNCTION pass_threshold_pct() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 75 $$;

-- ---- submit_assessment: the pre-test score is returned too ----
CREATE OR REPLACE FUNCTION submit_assessment(p_survey_id uuid, p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_attempt text;
  v_form text;
  v_questions jsonb;
  v_lock text;
  v_score integer;
  v_total integer;
  v_percentage numeric;
  v_row survey_responses;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account to submit.' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers must be an object keyed by question id.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_survey FROM surveys
   WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
  END IF;

  v_attempt := next_attempt_for(v_user, v_survey);
  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
  END IF;

  IF v_attempt = 'post' THEN
    v_lock := post_test_lock_reason(v_user, v_survey.program_id);
    IF v_lock IS NOT NULL THEN
      RAISE EXCEPTION 'Post-test locked: %', v_lock USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_survey.type = 'knowledge' THEN
    v_form := assessment_form_for(v_survey, v_attempt);
    v_questions := CASE WHEN v_form = 'B' THEN v_survey.questions_data_post ELSE v_survey.questions_data END;

    SELECT count(*),
           count(*) FILTER (WHERE p_answers ->> (q ->> 'id') = q ->> 'correct_option')
      INTO v_total, v_score
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END
           ) AS t(q)
     WHERE q ->> 'type' = 'mcq'
       AND coalesce(q ->> 'correct_option', '') <> '';

    v_percentage := CASE WHEN v_total > 0 THEN round(v_score * 100.0 / v_total) END;
  END IF;

  INSERT INTO survey_responses (user_id, survey_id, answers, score, total_scored, percentage)
  VALUES (v_user, v_survey.id, p_answers, v_score, v_total, v_percentage)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'attempt_type', v_row.attempt_type,
    'form', v_form,
    'score', v_row.score,
    'total_scored', v_row.total_scored,
    'percentage', v_row.percentage
  );
END $$;

REVOKE ALL ON FUNCTION submit_assessment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_assessment(uuid, jsonb) TO authenticated;

-- ---- student_my_responses: the pre-test score is no longer hidden ----
DROP FUNCTION IF EXISTS student_my_responses();

CREATE OR REPLACE FUNCTION student_my_responses() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'survey_id', r.survey_id,
           'attempt_type', r.attempt_type,
           'score', r.score,
           'total_scored', r.total_scored,
           'percentage', r.percentage,
           'created_at', r.created_at
         ) ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM survey_responses r
   WHERE r.user_id = current_student_id()
$$;

REVOKE ALL ON FUNCTION student_my_responses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION student_my_responses() TO authenticated;

-- ---- get_assessment_review: allowlist, post-test items only ----
CREATE OR REPLACE FUNCTION get_assessment_review(p_survey_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_pre survey_responses;
  v_post survey_responses;
  v_post_form text;
  v_questions jsonb;
  v_items jsonb;
  v_pre_pct numeric;
  v_post_pct numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_survey FROM surveys WHERE id = p_survey_id AND type = 'knowledge';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_post FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'post'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The review opens after you submit the post-test.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pre FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'pre'
   ORDER BY created_at DESC LIMIT 1;

  v_post_form := assessment_form_for(v_survey, 'post');
  v_questions := CASE WHEN v_post_form = 'B' THEN v_survey.questions_data_post
                      WHEN jsonb_typeof(v_survey.questions_data) = 'array' THEN v_survey.questions_data
                      ELSE '[]'::jsonb END;

  -- Every field is named here: nothing from the stored question (the key,
  -- the options, pairs_with) can reach the student by being left in.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id',                 q -> 'id',
           'text',               q -> 'text',
           'type',               q -> 'type',
           'student_answer',     v_post.answers -> (q ->> 'id'),
           'is_correct',         CASE WHEN q ->> 'type' = 'mcq' AND coalesce(q ->> 'correct_option', '') <> ''
                                      THEN coalesce((v_post.answers ->> (q ->> 'id')) = q ->> 'correct_option', false)
                                 END,
           'related_program_id', q -> 'related_program_id',
           'related_material_id', q -> 'related_material_id'
         ) ORDER BY ord), '[]'::jsonb)
    INTO v_items
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(q, ord);

  v_post_pct := coalesce(v_post.percentage,
                         CASE WHEN v_post.total_scored > 0 THEN round(v_post.score * 100.0 / v_post.total_scored) END);
  v_pre_pct := CASE WHEN v_pre.id IS NOT NULL THEN coalesce(v_pre.percentage,
                         CASE WHEN v_pre.total_scored > 0 THEN round(v_pre.score * 100.0 / v_pre.total_scored) END) END;

  RETURN jsonb_build_object(
    'survey_id', v_survey.id,
    'title', v_survey.title,
    -- The pre-test (Form A) is score only, always.
    'pre', CASE WHEN v_pre.id IS NULL THEN NULL ELSE jsonb_build_object(
             'score', v_pre.score, 'total_scored', v_pre.total_scored,
             'percentage', v_pre_pct, 'created_at', v_pre.created_at) END,
    'post', jsonb_build_object(
      'form', v_post_form,
      'score', v_post.score, 'total_scored', v_post.total_scored,
      'percentage', v_post_pct, 'created_at', v_post.created_at,
      'items', v_items),
    'comparison', CASE WHEN v_pre.id IS NULL OR v_pre_pct IS NULL OR v_post_pct IS NULL THEN NULL
                       ELSE jsonb_build_object('pre_pct', v_pre_pct, 'post_pct', v_post_pct,
                                               'points', v_post_pct - v_pre_pct) END
  );
END $$;

REVOKE ALL ON FUNCTION get_assessment_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_assessment_review(uuid) TO authenticated;

-- ---- my_badges: display-only, derived, participation/completion only ----

-- The post-test dates of the programs a student has completed, oldest
-- first. Completed = pre and post submitted, and every material linked at
-- the time of the post-test (at least one; not archived, not a handout)
-- was viewed. Counted from survey history, so archiving a survey or
-- program keeps the badge. Internal helper: not callable by students.
CREATE OR REPLACE FUNCTION completed_program_dates(p_user bigint) RETURNS SETOF timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT post.created_at
    FROM surveys s
    JOIN LATERAL (SELECT created_at FROM survey_responses
                   WHERE user_id = p_user AND survey_id = s.id AND attempt_type = 'pre' LIMIT 1) pre ON true
    JOIN LATERAL (SELECT created_at FROM survey_responses
                   WHERE user_id = p_user AND survey_id = s.id AND attempt_type = 'post' LIMIT 1) post ON true
   WHERE s.type = 'knowledge' AND s.program_id IS NOT NULL
     AND EXISTS (
           SELECT 1 FROM program_materials pm
             JOIN materials m ON m.id = pm.material_id AND m.archived_at IS NULL AND m.program_id IS NULL
            WHERE pm.program_id = s.program_id AND pm.created_at <= post.created_at)
     AND NOT EXISTS (
           SELECT 1 FROM program_materials pm
             JOIN materials m ON m.id = pm.material_id AND m.archived_at IS NULL AND m.program_id IS NULL
            WHERE pm.program_id = s.program_id AND pm.created_at <= post.created_at
              AND NOT EXISTS (SELECT 1 FROM material_views mv
                               WHERE mv.user_id = p_user AND mv.material_id = m.id))
   ORDER BY post.created_at
$$;

REVOKE ALL ON FUNCTION completed_program_dates(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION my_badges() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_threshold integer := pass_threshold_pct();
  v_first_step timestamptz;
  v_explored integer;
  v_explorer_at timestamptz;
  v_dates timestamptz[];
  v_completed integer;
  v_passed timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account.' USING ERRCODE = '42501';
  END IF;

  -- First Step: took a pre-test.
  SELECT min(r.created_at) INTO v_first_step
    FROM survey_responses r JOIN surveys s ON s.id = r.survey_id
   WHERE r.user_id = v_user AND r.attempt_type = 'pre' AND s.type = 'knowledge';

  -- Explorer: every linked (non-archived, non-handout) material of some
  -- program viewed. Earned when that program's last material was opened.
  SELECT count(*), min(done_at) INTO v_explored, v_explorer_at
    FROM (
      SELECT pm.program_id, max(mv.first_viewed_at) AS done_at
        FROM program_materials pm
        JOIN programs  pr ON pr.id = pm.program_id AND pr.archived_at IS NULL
        JOIN materials m  ON m.id = pm.material_id AND m.archived_at IS NULL AND m.program_id IS NULL
        LEFT JOIN material_views mv ON mv.material_id = m.id AND mv.user_id = v_user
       GROUP BY pm.program_id
      HAVING count(*) > 0 AND count(mv.material_id) = count(*)
    ) explored;

  -- Program Complete / Committed Learner (the third completion's date).
  SELECT coalesce(array_agg(d ORDER BY d), '{}') INTO v_dates FROM completed_program_dates(v_user) AS d;
  v_completed := coalesce(array_length(v_dates, 1), 0);

  -- Knowledge Check Passed: a post-test at or above the threshold.
  SELECT min(r.created_at) INTO v_passed
    FROM survey_responses r JOIN surveys s ON s.id = r.survey_id
   WHERE r.user_id = v_user AND r.attempt_type = 'post' AND s.type = 'knowledge'
     AND r.percentage >= v_threshold;

  RETURN jsonb_build_object(
    'pass_threshold_pct', v_threshold,
    'badges', jsonb_build_array(
      jsonb_build_object('id', 'first_step', 'earned', v_first_step IS NOT NULL, 'earned_at', v_first_step,
                         'progress', jsonb_build_object('current', (v_first_step IS NOT NULL)::int, 'target', 1)),
      jsonb_build_object('id', 'explorer', 'earned', v_explored > 0, 'earned_at', v_explorer_at,
                         'progress', jsonb_build_object('current', least(v_explored, 1), 'target', 1)),
      jsonb_build_object('id', 'program_complete', 'earned', v_completed > 0, 'earned_at', v_dates[1],
                         'progress', jsonb_build_object('current', least(v_completed, 1), 'target', 1)),
      jsonb_build_object('id', 'knowledge_check_passed', 'earned', v_passed IS NOT NULL, 'earned_at', v_passed,
                         'progress', jsonb_build_object('current', (v_passed IS NOT NULL)::int, 'target', 1)),
      jsonb_build_object('id', 'committed_learner', 'earned', v_completed >= 3, 'earned_at', v_dates[3],
                         'progress', jsonb_build_object('current', least(v_completed, 3), 'target', 3))
    )
  );
END $$;

REVOKE ALL ON FUNCTION my_badges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_badges() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 34 (run only to undo it): drops the badge functions and
-- restores the PHASE 30 versions (pre-test score hidden until the post-test;
-- review with the answer key).
-- ---------------------------------------------------------
-- DROP FUNCTION IF EXISTS my_badges();
-- DROP FUNCTION IF EXISTS completed_program_dates(bigint);
-- DROP FUNCTION IF EXISTS pass_threshold_pct();
-- DROP FUNCTION IF EXISTS student_my_responses();
-- CREATE OR REPLACE FUNCTION submit_assessment(p_survey_id uuid, p_answers jsonb) RETURNS jsonb
-- LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_user bigint := current_student_id();
--   v_survey surveys;
--   v_attempt text;
--   v_form text;
--   v_questions jsonb;
--   v_lock text;
--   v_score integer;
--   v_total integer;
--   v_percentage numeric;
--   v_row survey_responses;
-- BEGIN
--   IF v_user IS NULL THEN
--     RAISE EXCEPTION 'Sign in with a student account to submit.' USING ERRCODE = '42501';
--   END IF;
--   IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
--     RAISE EXCEPTION 'Answers must be an object keyed by question id.' USING ERRCODE = '22023';
--   END IF;
--
--   SELECT * INTO v_survey FROM surveys
--    WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
--   END IF;
--
--   v_attempt := next_attempt_for(v_user, v_survey);
--   IF v_attempt IS NULL THEN
--     RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
--   END IF;
--
--   IF v_attempt = 'post' THEN
--     v_lock := post_test_lock_reason(v_user, v_survey.program_id);
--     IF v_lock IS NOT NULL THEN
--       RAISE EXCEPTION 'Post-test locked: %', v_lock USING ERRCODE = '42501';
--     END IF;
--   END IF;
--
--   IF v_survey.type = 'knowledge' THEN
--     v_form := assessment_form_for(v_survey, v_attempt);
--     v_questions := CASE WHEN v_form = 'B' THEN v_survey.questions_data_post ELSE v_survey.questions_data END;
--
--     SELECT count(*),
--            count(*) FILTER (WHERE p_answers ->> (q ->> 'id') = q ->> 'correct_option')
--       INTO v_total, v_score
--       FROM jsonb_array_elements(
--              CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END
--            ) AS t(q)
--      WHERE q ->> 'type' = 'mcq'
--        AND coalesce(q ->> 'correct_option', '') <> '';
--
--     v_percentage := CASE WHEN v_total > 0 THEN round(v_score * 100.0 / v_total) END;
--   END IF;
--
--   INSERT INTO survey_responses (user_id, survey_id, answers, score, total_scored, percentage)
--   VALUES (v_user, v_survey.id, p_answers, v_score, v_total, v_percentage)
--   RETURNING * INTO v_row;
--
--   RETURN jsonb_build_object(
--     'id', v_row.id,
--     'attempt_type', v_row.attempt_type,
--     'form', v_form,
--     'score', CASE WHEN v_row.attempt_type = 'pre' THEN NULL ELSE v_row.score END,
--     'total_scored', CASE WHEN v_row.attempt_type = 'pre' THEN NULL ELSE v_row.total_scored END,
--     'percentage', CASE WHEN v_row.attempt_type = 'pre' THEN NULL ELSE v_row.percentage END
--   );
-- END $$;
--
-- REVOKE ALL ON FUNCTION submit_assessment(uuid, jsonb) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION submit_assessment(uuid, jsonb) TO authenticated;
--
-- DROP FUNCTION IF EXISTS student_my_responses();
-- CREATE OR REPLACE FUNCTION student_my_responses() RETURNS jsonb
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT coalesce(jsonb_agg(jsonb_build_object(
--            'id', r.id,
--            'survey_id', r.survey_id,
--            'attempt_type', r.attempt_type,
--            'score', CASE WHEN r.attempt_type = 'pre' AND NOT hp.has_post THEN NULL ELSE r.score END,
--            'total_scored', CASE WHEN r.attempt_type = 'pre' AND NOT hp.has_post THEN NULL ELSE r.total_scored END,
--            'percentage', CASE WHEN r.attempt_type = 'pre' AND NOT hp.has_post THEN NULL ELSE r.percentage END,
--            'created_at', r.created_at
--          ) ORDER BY r.created_at DESC), '[]'::jsonb)
--     FROM survey_responses r
--     CROSS JOIN LATERAL (
--       SELECT EXISTS (SELECT 1 FROM survey_responses p
--                       WHERE p.user_id = r.user_id AND p.survey_id = r.survey_id
--                         AND p.attempt_type = 'post') AS has_post
--     ) hp
--    WHERE r.user_id = current_student_id()
-- $$;
--
-- REVOKE ALL ON FUNCTION student_my_responses() FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION student_my_responses() TO authenticated;
--
-- CREATE OR REPLACE FUNCTION get_assessment_review(p_survey_id uuid) RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_user bigint := current_student_id();
--   v_survey surveys;
--   v_pre survey_responses;
--   v_post survey_responses;
--   v_post_form text;
--   v_pre_json jsonb;
-- BEGIN
--   IF v_user IS NULL THEN
--     RAISE EXCEPTION 'Sign in with a student account.' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT * INTO v_survey FROM surveys WHERE id = p_survey_id AND type = 'knowledge';
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Assessment not found.' USING ERRCODE = 'P0002';
--   END IF;
--
--   SELECT * INTO v_post FROM survey_responses
--    WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'post'
--    ORDER BY created_at DESC LIMIT 1;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'The review opens after you submit the post-test.' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT * INTO v_pre FROM survey_responses
--    WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'pre'
--    ORDER BY created_at DESC LIMIT 1;
--   IF FOUND THEN
--     v_pre_json := jsonb_build_object(
--       'form', 'A',
--       'questions', (SELECT coalesce(jsonb_agg(q - 'pairs_with' ORDER BY ord), '[]'::jsonb)
--                       FROM jsonb_array_elements(
--                              CASE WHEN jsonb_typeof(v_survey.questions_data) = 'array'
--                                   THEN v_survey.questions_data ELSE '[]'::jsonb END
--                            ) WITH ORDINALITY t(q, ord)),
--       'answers', v_pre.answers,
--       'score', v_pre.score, 'total_scored', v_pre.total_scored,
--       'percentage', v_pre.percentage, 'created_at', v_pre.created_at);
--   END IF;
--
--   v_post_form := assessment_form_for(v_survey, 'post');
--
--   RETURN jsonb_build_object(
--     'survey_id', v_survey.id,
--     'title', v_survey.title,
--     'pre', v_pre_json,
--     'post', jsonb_build_object(
--       'form', v_post_form,
--       'questions', (SELECT coalesce(jsonb_agg(q - 'pairs_with' ORDER BY ord), '[]'::jsonb)
--                       FROM jsonb_array_elements(
--                              CASE WHEN v_post_form = 'B' THEN v_survey.questions_data_post
--                                   WHEN jsonb_typeof(v_survey.questions_data) = 'array' THEN v_survey.questions_data
--                                   ELSE '[]'::jsonb END
--                            ) WITH ORDINALITY t(q, ord)),
--       'answers', v_post.answers,
--       'score', v_post.score, 'total_scored', v_post.total_scored,
--       'percentage', v_post.percentage, 'created_at', v_post.created_at)
--   );
-- END $$;
--
-- REVOKE ALL ON FUNCTION get_assessment_review(uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION get_assessment_review(uuid) TO authenticated;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 34 addendum: no activation without Form B; no Form A items shown
-- =========================================================
-- 1. A knowledge assessment can't be active without a Form B (the
--    post-test form). Without one the post-test would reuse Form A and show
--    the pre-test items again. Drafts and closed assessments can still be
--    mid-edit. Same message as the builder: "Add the post-test form (Form B)
--    before activating."
-- 2. get_assessment_review() returns NO items when the post-test used
--    Form A (an assessment that has no Form B, e.g. one activated before
--    this rule): score only, like the pre-test, with items_withheld = true.
--    Form B assessments are unchanged.

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_post_form_required;
ALTER TABLE surveys ADD CONSTRAINT surveys_post_form_required
  CHECK (
    status IS DISTINCT FROM 'active'
    OR type IS DISTINCT FROM 'knowledge'
    -- CASE, not AND: a NULL expression would PASS a CHECK, and a missing
    -- Form B is NULL here.
    OR CASE WHEN jsonb_typeof(questions_data_post) = 'array'
            THEN jsonb_array_length(questions_data_post) > 0
            ELSE false END
  );

CREATE OR REPLACE FUNCTION get_assessment_review(p_survey_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_pre survey_responses;
  v_post survey_responses;
  v_post_form text;
  v_questions jsonb;
  v_items jsonb := '[]'::jsonb;
  v_pre_pct numeric;
  v_post_pct numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_survey FROM surveys WHERE id = p_survey_id AND type = 'knowledge';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_post FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'post'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The review opens after you submit the post-test.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pre FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'pre'
   ORDER BY created_at DESC LIMIT 1;

  v_post_form := assessment_form_for(v_survey, 'post');

  -- Items only for a real post-test form (Form B). When the post-test
  -- used Form A these would be the pre-test items: score only instead.
  IF v_post_form = 'B' THEN
    v_questions := v_survey.questions_data_post;

    -- Every field is named here: nothing from the stored question (the
    -- key, the options, pairs_with) can reach the student by being left in.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',                 q -> 'id',
             'text',               q -> 'text',
             'type',               q -> 'type',
             'student_answer',     v_post.answers -> (q ->> 'id'),
             'is_correct',         CASE WHEN q ->> 'type' = 'mcq' AND coalesce(q ->> 'correct_option', '') <> ''
                                        THEN coalesce((v_post.answers ->> (q ->> 'id')) = q ->> 'correct_option', false)
                                   END,
             'related_program_id', q -> 'related_program_id',
             'related_material_id', q -> 'related_material_id'
           ) ORDER BY ord), '[]'::jsonb)
      INTO v_items
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(q, ord);
  END IF;

  v_post_pct := coalesce(v_post.percentage,
                         CASE WHEN v_post.total_scored > 0 THEN round(v_post.score * 100.0 / v_post.total_scored) END);
  v_pre_pct := CASE WHEN v_pre.id IS NOT NULL THEN coalesce(v_pre.percentage,
                         CASE WHEN v_pre.total_scored > 0 THEN round(v_pre.score * 100.0 / v_pre.total_scored) END) END;

  RETURN jsonb_build_object(
    'survey_id', v_survey.id,
    'title', v_survey.title,
    -- The pre-test (Form A) is score only, always.
    'pre', CASE WHEN v_pre.id IS NULL THEN NULL ELSE jsonb_build_object(
             'score', v_pre.score, 'total_scored', v_pre.total_scored,
             'percentage', v_pre_pct, 'created_at', v_pre.created_at) END,
    'post', jsonb_build_object(
      'form', v_post_form,
      'score', v_post.score, 'total_scored', v_post.total_scored,
      'percentage', v_post_pct, 'created_at', v_post.created_at,
      'items', v_items,
      'items_withheld', v_post_form <> 'B'),
    'comparison', CASE WHEN v_pre.id IS NULL OR v_pre_pct IS NULL OR v_post_pct IS NULL THEN NULL
                       ELSE jsonb_build_object('pre_pct', v_pre_pct, 'post_pct', v_post_pct,
                                               'points', v_post_pct - v_pre_pct) END
  );
END $$;

REVOKE ALL ON FUNCTION get_assessment_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_assessment_review(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of the PHASE 34 addendum (run only to undo it): drops the
-- Form B rule and restores the earlier PHASE 34 review function (re-run the
-- CREATE OR REPLACE FUNCTION get_assessment_review block above, the one
-- that starts "get_assessment_review: allowlist, post-test items only").
-- ---------------------------------------------------------
-- ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_post_form_required;


-- =========================================================
-- PHASE 35 (part A): private path column for full material files
-- =========================================================
-- Additive and harmless. Run it BEFORE the client that reads file_path is
-- deployed. materials.file_path is the object path of a material's full
-- file in the private bucket (material-files); a row that has one has
-- file_url NULL. External links and YouTube URLs keep using file_url.

ALTER TABLE materials ADD COLUMN IF NOT EXISTS file_path text;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of part A (run only to undo it): drops the column. Run the
-- part B rollback first, and move the files back with
-- scripts/migrate-material-files.cjs --rollback.
-- ---------------------------------------------------------
-- ALTER TABLE materials DROP COLUMN IF EXISTS file_path;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 35 (part B): visitors get previews only; full files are private
-- =========================================================
-- Run it together with scripts/migrate-material-files.cjs (which moves the
-- files first). Until now a visitor with just the public key could read
-- every materials.file_url straight from the API, the files were in public
-- buckets, and the bucket listings were public.
--
-- After this:
--   * materials (anon): only non-archived, non-handout rows, and only the
--     preview columns. file_url, video_url, file_path, downloads, size and
--     program_component are NOT readable by anon. Signed-in users (students,
--     admins) are unchanged.
--   * programs (anon): only non-archived programs. program_entries and
--     program_materials (anon): only those of a non-archived program.
--   * material-files is a PRIVATE bucket: no public links, no public
--     listing, and only signed-in users can read (create signed links for)
--     its files. material-covers stays public (covers and the small
--     infographic previews only).
-- A column added to materials later is NOT readable by anon until it is
-- granted below.
-- KNOWN LIMITATION (accepted 2026-10-24): the CDN keeps public files for a year
-- (cache-control max-age=31536000) and does not purge them when a file is
-- deleted or its bucket is made private. A CDN-cached copy of one public IEC
-- video (material 44) may therefore stay reachable at its OLD public URL until
-- it is evicted. The private file itself is protected and the system only
-- serves signed links.

-- ---- materials ----
DROP POLICY IF EXISTS materials_select_public ON materials;
DROP POLICY IF EXISTS materials_select_anon ON materials;
DROP POLICY IF EXISTS materials_select_authenticated ON materials;

CREATE POLICY materials_select_anon ON materials
  FOR SELECT TO anon
  USING (archived_at IS NULL AND program_id IS NULL);

CREATE POLICY materials_select_authenticated ON materials
  FOR SELECT TO authenticated
  USING (true);

REVOKE SELECT ON materials FROM anon;
GRANT SELECT (id, title, type, material_type, description, category, image_url,
              campus, created_at, program_id, archived_at, tags)
  ON materials TO anon;

-- ---- programs and what hangs off them ----
DROP POLICY IF EXISTS programs_select_public ON programs;
DROP POLICY IF EXISTS programs_select_anon ON programs;
DROP POLICY IF EXISTS programs_select_authenticated ON programs;

CREATE POLICY programs_select_anon ON programs
  FOR SELECT TO anon
  USING (archived_at IS NULL);

CREATE POLICY programs_select_authenticated ON programs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS program_entries_select_public ON program_entries;
DROP POLICY IF EXISTS program_entries_select_anon ON program_entries;
DROP POLICY IF EXISTS program_entries_select_authenticated ON program_entries;

CREATE POLICY program_entries_select_anon ON program_entries
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM programs p WHERE p.id = program_id AND p.archived_at IS NULL));

CREATE POLICY program_entries_select_authenticated ON program_entries
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS program_materials_select_public ON program_materials;
DROP POLICY IF EXISTS program_materials_select_anon ON program_materials;
DROP POLICY IF EXISTS program_materials_select_authenticated ON program_materials;

CREATE POLICY program_materials_select_anon ON program_materials
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM programs p WHERE p.id = program_id AND p.archived_at IS NULL));

CREATE POLICY program_materials_select_authenticated ON program_materials
  FOR SELECT TO authenticated
  USING (true);

-- ---- storage: the full files are private ----
UPDATE storage.buckets SET public = false WHERE id = 'material-files';

DROP POLICY IF EXISTS material_files_select_public ON storage.objects;
DROP POLICY IF EXISTS material_files_select_authenticated ON storage.objects;
CREATE POLICY material_files_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'material-files');

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of part B (run only to undo it). Also put the files back with
-- node scripts/migrate-material-files.cjs --rollback --backup-dir=<folder>
-- ---------------------------------------------------------
-- UPDATE storage.buckets SET public = true WHERE id = 'material-files';
-- DROP POLICY IF EXISTS material_files_select_authenticated ON storage.objects;
-- CREATE POLICY material_files_select_public ON storage.objects
--   FOR SELECT USING (bucket_id = 'material-files');
--
-- DROP POLICY IF EXISTS program_materials_select_anon ON program_materials;
-- DROP POLICY IF EXISTS program_materials_select_authenticated ON program_materials;
-- CREATE POLICY program_materials_select_public ON program_materials FOR SELECT USING (true);
-- DROP POLICY IF EXISTS program_entries_select_anon ON program_entries;
-- DROP POLICY IF EXISTS program_entries_select_authenticated ON program_entries;
-- CREATE POLICY program_entries_select_public ON program_entries FOR SELECT USING (true);
-- DROP POLICY IF EXISTS programs_select_anon ON programs;
-- DROP POLICY IF EXISTS programs_select_authenticated ON programs;
-- CREATE POLICY programs_select_public ON programs FOR SELECT USING (true);
--
-- DROP POLICY IF EXISTS materials_select_anon ON materials;
-- DROP POLICY IF EXISTS materials_select_authenticated ON materials;
-- GRANT SELECT ON materials TO anon;
-- CREATE POLICY materials_select_public ON materials FOR SELECT USING (true);
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 35 (part C): remove two leftover "read everything" policies on programs
-- =========================================================
-- Found by reading pg_policies after part B: programs also carried
-- "Enable read for all on programs" and "Enable read for programs" (both
-- SELECT USING (true) for every role), created outside these migrations.
-- Permissive policies are OR'ed, so they overrode programs_select_anon and a
-- visitor could still read an ARCHIVED program. programs_select_anon (not
-- archived) and programs_select_authenticated (everything) remain.

DROP POLICY IF EXISTS "Enable read for all on programs" ON programs;
DROP POLICY IF EXISTS "Enable read for programs" ON programs;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of part C (run only to undo it): puts the two policies back.
-- ---------------------------------------------------------
-- CREATE POLICY "Enable read for all on programs" ON programs FOR SELECT USING (true);
-- CREATE POLICY "Enable read for programs" ON programs FOR SELECT USING (true);
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 35 (part D): card thumbnail path for infographics
-- =========================================================
-- materials.thumb_path is the object path of an infographic's sharp ~480px
-- card thumbnail in the PRIVATE bucket (material-files/thumbs/...). Signed-in
-- students' library cards use it instead of the 1-2 MB original; visitors who
-- are not signed in keep the blurred public preview (image_url). Not
-- readable by anon (it is not in the anon column grant of part B).
-- Additive and harmless: run it BEFORE the client that writes thumb_path is
-- deployed, and before scripts/backfill-card-thumbnails.cjs.

ALTER TABLE materials ADD COLUMN IF NOT EXISTS thumb_path text;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- ROLLBACK of part D (run only to undo it): drops the column. The
-- thumbnail files stay in storage (material-files/thumbs/); delete them
-- there if you want them gone.
-- ---------------------------------------------------------
-- ALTER TABLE materials DROP COLUMN IF EXISTS thumb_path;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 36: one-time cleanup of programs.time_range
-- =========================================================
-- Opening a program in the admin form and saving it used to append another
-- AM/PM to each time ("8:00 AM" -> "8:00 AM AM" -> ...), and turned a PM time
-- into "2:00 PM AM". The form is fixed (ProgramManager.tsx, parseTo24h); this
-- repairs the rows it already damaged by keeping the FIRST AM/PM after each
-- time, which is the original and correct one. Rows that are already clean
-- are not touched, so it is safe to run twice.

-- 1) BEFORE
SELECT id, time_range FROM programs ORDER BY id;

-- 2) repair
UPDATE programs
   SET time_range = regexp_replace(
         time_range,
         '(\d{1,2}:\d{2}\s*(?:AM|PM))(?:\s+(?:AM|PM))+',
         '\1',
         'gi')
 WHERE time_range ~* '(AM|PM)\s+(AM|PM)';

-- 3) AFTER (every row should now read like "8:00 AM - 12:00 PM")
SELECT id, time_range FROM programs ORDER BY id;

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 36 (run only to undo it): the original, damaged values
-- as they were on 2026-10-24. There is no reason to want them back; they are
-- recorded only so the cleanup can be reversed exactly.
-- ---------------------------------------------------------
-- UPDATE programs SET time_range = '2:00 PM AM AM - 4:30 PM AM AM' WHERE id = 76;
-- UPDATE programs SET time_range = '5:30 PM AM AM - 7:30 PM AM AM' WHERE id = 77;
-- UPDATE programs SET time_range = '8:00 AM AM AM AM - 12:00 PM PM PM PM' WHERE id = 78;
-- UPDATE programs SET time_range = '8:00 AM AM AM - 5:00 PM AM AM' WHERE id = 79;
-- UPDATE programs SET time_range = '7:30 AM AM AM AM AM AM AM AM AM AM - 5:30 PM AM AM AM AM AM AM AM AM AM' WHERE id = 80;


-- =========================================================
-- PHASE 37: uploaded videos are hosted on Cloudinary
-- =========================================================
-- Images, PDFs and audio stay in the private Supabase bucket. An uploaded
-- video lives in Cloudinary as an AUTHENTICATED asset (only reachable through
-- a link the server signs for a signed-in user, see /api/video-url).
-- The Cloudinary public_id is stored here; a signed link is NEVER stored.
-- A video material has file_url = NULL and file_path = NULL. Videos that are
-- still in the Supabase bucket (file_path) or on YouTube (file_url) have
-- video_public_id = NULL and keep working exactly as before.
--
-- Anonymous visitors cannot read these columns: PHASE 35 gives anon an
-- explicit column list on materials, and a column added later is not on it.
-- Safe to run twice.

ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_public_id text;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_resource_type text;
-- size of the file students download (the ORIGINAL upload; see part 2 below)
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_bytes bigint;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_duration numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_video_one_source') THEN
    ALTER TABLE materials ADD CONSTRAINT materials_video_one_source
      CHECK (video_public_id IS NULL OR (file_url IS NULL AND file_path IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_video_public_id_prefix') THEN
    ALTER TABLE materials ADD CONSTRAINT materials_video_public_id_prefix
      CHECK (video_public_id IS NULL OR video_public_id ~ '^omsu-iec/[A-Za-z0-9_-]{8,64}$');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- CHECK (all four should read false for anon, i.e. no column privilege):
SELECT c AS column_name,
       has_column_privilege('anon', 'public.materials', c, 'SELECT') AS anon_can_read
  FROM unnest(ARRAY['video_public_id','video_resource_type','video_bytes','video_duration']) AS c;

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 37 (run only to undo it).
-- First delete the hosted videos (Archive > Delete permanently, or the
-- Cloudinary console, folder omsu-iec/) or they are left behind as orphans.
-- ---------------------------------------------------------
-- ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_video_public_id_prefix;
-- ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_video_one_source;
-- ALTER TABLE materials DROP COLUMN IF EXISTS video_duration;
-- ALTER TABLE materials DROP COLUMN IF EXISTS video_bytes;
-- ALTER TABLE materials DROP COLUMN IF EXISTS video_resource_type;
-- ALTER TABLE materials DROP COLUMN IF EXISTS video_public_id;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 37, part 2: students play the ORIGINAL uploaded video
-- =========================================================
-- Admins compress videos before uploading, so there is no playback transcode
-- any more: /api/video-url signs the original file (same public_id, no
-- transformation). The only derived copy is one poster frame, made once.
-- A signed link must use the original's container as its extension (a
-- different one makes Cloudinary convert the file), so it is stored here,
-- together with the video codec read from Cloudinary's upload response.
--   video_format  e.g. mp4, mov, webm     (NULL = not a hosted video)
--   video_codec   e.g. h264, hevc, vp8    (NULL = unknown; only used to warn
--                                          the admin that a video may not play
--                                          everywhere: anything but MP4/H.264)
-- video_bytes / video_duration now describe the original file.
-- Videos uploaded before this part existed would have no video_format and
-- /api/video-url answers 404 for them: none exist on the live project.
-- Run this BEFORE deploying the code that writes these columns. Safe to run twice.

ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_format text;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS video_codec text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_video_format_valid') THEN
    ALTER TABLE materials ADD CONSTRAINT materials_video_format_valid
      CHECK (video_format IS NULL OR video_format ~ '^[a-z0-9]{2,5}$');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- CHECK: anon_can_read must be false for all six PHASE 37 columns (anon has
-- an explicit column list on materials since PHASE 35; new columns are not on it).
SELECT c AS column_name,
       has_column_privilege('anon', 'public.materials', c, 'SELECT') AS anon_can_read
  FROM unnest(ARRAY['video_public_id','video_resource_type','video_bytes','video_duration','video_format','video_codec']) AS c;

-- ---------------------------------------------------------
-- Credit table (Cloudinary Free plan: 25 credits a month; 1 credit = 1 GB of
-- bandwidth OR 1 GB of storage OR 1,000 transformations). Real originals:
-- no processing cost (one poster frame per upload, about 0.001 credit), and
-- bandwidth per full view = the file size. 100 full views = size in MB / 10.
--
--   file size | per full view | 100 full views | full views in 25 credits
--   ----------+---------------+----------------+-------------------------
--      5 MB   |  0.005 credit |   0.5 credit   |  ~5,000
--     10 MB   |  0.010        |   1.0          |  ~2,500
--     15 MB   |  0.015        |   1.5          |  ~1,660   <- the target
--     30 MB   |  0.030        |   3.0          |  ~830
--     50 MB   |  0.050        |   5.0          |  ~500
--    100 MB   |  0.100        |  10.0          |  ~250     <- the limit
--
-- Stored videos also use storage credits (a 15 MB video is 0.015 credit for
-- as long as it exists); the meter in the upload form shows the real total.
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- ROLLBACK of part 2 only (the code then needs the 480p version back).
-- ---------------------------------------------------------
-- ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_video_format_valid;
-- ALTER TABLE materials DROP COLUMN IF EXISTS video_codec;
-- ALTER TABLE materials DROP COLUMN IF EXISTS video_format;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 38: log edits to the About page in the Activity Log
-- =========================================================
-- activity_logs.entity_type only allowed program / material / survey / user.
-- 'about' lets the About-page editor record who changed which section and
-- when (section names only; the old and new text are NOT stored).
-- Admins can already insert any row (activity_logs_insert: is_admin()), so
-- only the CHECK needs to change. Safe to run twice. Run it BEFORE deploying
-- the code that writes these rows (an unknown entity_type would be rejected,
-- which the app swallows, so nothing breaks, the edit just is not logged).

ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_entity_type_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_entity_type_check
  CHECK (entity_type IN ('program', 'material', 'survey', 'user', 'about'));

NOTIFY pgrst, 'reload schema';

-- CHECK (should list all five types):
SELECT pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conname = 'activity_logs_entity_type_check';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 38 (run only to undo it). Rows with entity_type 'about'
-- must go first, or the old CHECK cannot be put back.
-- ---------------------------------------------------------
-- DELETE FROM activity_logs WHERE entity_type = 'about';
-- ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_entity_type_check;
-- ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_entity_type_check
--   CHECK (entity_type IN ('program', 'material', 'survey', 'user'));
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 39: per-student shuffle of awareness-check questions and choices
-- =========================================================
-- To discourage copying during the pilot, each student gets the questions of
-- an awareness check (knowledge assessment) in their own order, and each
-- multiple-choice question's choices in their own order. Done in the database
-- so the browser never sees the stored order or the answer key.
--
--  * Deterministic and stateless: the order comes from a hash of
--    student id + survey id + form (A or B) + question id (+ option text for
--    the choices). The same student always gets the same order (refresh,
--    resume, review); different students get different orders; nothing extra
--    is stored. Form A and Form B shuffle differently.
--  * Scoring is untouched: answers are stored as { question id: chosen option
--    TEXT } and submit_assessment compares that text with correct_option, so
--    position never mattered. submit_assessment is NOT changed.
--  * pairs_with, the answer key, learning gain and item analytics all use
--    question ids and are unaffected. The admin builder and previews read the
--    stored (canonical) order, which is not changed.
--  * Opinion surveys are not shuffled.
--  * get_assessment_review lists the post-test items in the student's own
--    (shuffled) order, so item numbers match what they saw.
-- Safe to run twice.

CREATE OR REPLACE FUNCTION shuffle_assessment_questions(p_questions jsonb, p_seed text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(
           CASE WHEN q ->> 'type' = 'mcq' AND jsonb_typeof(q -> 'options') = 'array'
                THEN jsonb_set(q, '{options}', (
                       SELECT coalesce(jsonb_agg(o ORDER BY md5(p_seed || ':' || (q ->> 'id') || ':' || (o #>> '{}')), oord), '[]'::jsonb)
                         FROM jsonb_array_elements(q -> 'options') WITH ORDINALITY AS x(o, oord)))
                ELSE q END
           ORDER BY md5(p_seed || ':' || (q ->> 'id')), ord), '[]'::jsonb)
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_questions) = 'array' THEN p_questions ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS t(q, ord)
$$;

REVOKE ALL ON FUNCTION shuffle_assessment_questions(jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_assessment_questions(p_survey_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_attempt text;
  v_form text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account to take assessments.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_survey FROM surveys
   WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
  END IF;

  v_attempt := next_attempt_for(v_user, v_survey);
  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
  END IF;

  v_form := assessment_form_for(v_survey, v_attempt);
  RETURN jsonb_build_object(
    'survey_id', v_survey.id,
    'attempt_type', CASE WHEN v_attempt = 'single' THEN NULL ELSE v_attempt END,
    'form', v_form,
    'post_test_lock', CASE WHEN v_attempt = 'post'
                           THEN post_test_lock_reason(v_user, v_survey.program_id) END,
    -- Awareness checks: questions and choices are shuffled per student, on the
    -- server (PHASE 39). Opinion surveys keep their stored order.
    'questions', CASE
                   WHEN v_survey.type = 'knowledge' THEN shuffle_assessment_questions(
                     strip_answer_key(CASE WHEN v_form = 'B' THEN v_survey.questions_data_post
                                           ELSE v_survey.questions_data END),
                     v_user::text || ':' || v_survey.id::text || ':' || v_form)
                   ELSE strip_answer_key(CASE WHEN v_form = 'B' THEN v_survey.questions_data_post
                                              ELSE v_survey.questions_data END)
                 END
  );
END $$;

REVOKE ALL ON FUNCTION get_assessment_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_assessment_questions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION get_assessment_review(p_survey_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_pre survey_responses;
  v_post survey_responses;
  v_post_form text;
  v_questions jsonb;
  v_items jsonb := '[]'::jsonb;
  v_pre_pct numeric;
  v_post_pct numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_survey FROM surveys WHERE id = p_survey_id AND type = 'knowledge';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_post FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'post'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The review opens after you submit the post-test.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pre FROM survey_responses
   WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'pre'
   ORDER BY created_at DESC LIMIT 1;

  v_post_form := assessment_form_for(v_survey, 'post');

  -- Items only for a real post-test form (Form B). When the post-test
  -- used Form A these would be the pre-test items: score only instead.
  IF v_post_form = 'B' THEN
    v_questions := v_survey.questions_data_post;

    -- Every field is named here: nothing from the stored question (the
    -- key, the options, pairs_with) can reach the student by being left in.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',                 q -> 'id',
             'text',               q -> 'text',
             'type',               q -> 'type',
             'student_answer',     v_post.answers -> (q ->> 'id'),
             'is_correct',         CASE WHEN q ->> 'type' = 'mcq' AND coalesce(q ->> 'correct_option', '') <> ''
                                        THEN coalesce((v_post.answers ->> (q ->> 'id')) = q ->> 'correct_option', false)
                                   END,
             'related_program_id', q -> 'related_program_id',
             'related_material_id', q -> 'related_material_id'
           ) ORDER BY md5(v_user::text || ':' || v_survey.id::text || ':' || v_post_form || ':' || (q ->> 'id')), ord), '[]'::jsonb)
      INTO v_items
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(q, ord);
  END IF;

  v_post_pct := coalesce(v_post.percentage,
                         CASE WHEN v_post.total_scored > 0 THEN round(v_post.score * 100.0 / v_post.total_scored) END);
  v_pre_pct := CASE WHEN v_pre.id IS NOT NULL THEN coalesce(v_pre.percentage,
                         CASE WHEN v_pre.total_scored > 0 THEN round(v_pre.score * 100.0 / v_pre.total_scored) END) END;

  RETURN jsonb_build_object(
    'survey_id', v_survey.id,
    'title', v_survey.title,
    -- The pre-test (Form A) is score only, always.
    'pre', CASE WHEN v_pre.id IS NULL THEN NULL ELSE jsonb_build_object(
             'score', v_pre.score, 'total_scored', v_pre.total_scored,
             'percentage', v_pre_pct, 'created_at', v_pre.created_at) END,
    'post', jsonb_build_object(
      'form', v_post_form,
      'score', v_post.score, 'total_scored', v_post.total_scored,
      'percentage', v_post_pct, 'created_at', v_post.created_at,
      'items', v_items,
      'items_withheld', v_post_form <> 'B'),
    'comparison', CASE WHEN v_pre.id IS NULL OR v_pre_pct IS NULL OR v_post_pct IS NULL THEN NULL
                       ELSE jsonb_build_object('pre_pct', v_pre_pct, 'post_pct', v_post_pct,
                                               'points', v_post_pct - v_pre_pct) END
  );
END $$;

REVOKE ALL ON FUNCTION get_assessment_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_assessment_review(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- CHECK: both should be true (the helper exists and the review is rebuilt).
SELECT (SELECT count(*) FROM pg_proc WHERE proname = 'shuffle_assessment_questions') = 1 AS helper_exists,
       (SELECT prosrc LIKE '%shuffle_assessment_questions%' FROM pg_proc WHERE proname = 'get_assessment_questions') AS questions_shuffled,
       (SELECT prosrc LIKE '%md5(v_user%' FROM pg_proc WHERE proname = 'get_assessment_review') AS review_in_student_order;

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 39 (run only to undo it): puts back the two functions
-- exactly as they were, then drops the helper. submit_assessment was never
-- changed, so nothing else needs undoing.
-- ---------------------------------------------------------
-- CREATE OR REPLACE FUNCTION get_assessment_questions(p_survey_id uuid) RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_user bigint := current_student_id();
--   v_survey surveys;
--   v_attempt text;
--   v_form text;
-- BEGIN
--   IF v_user IS NULL THEN
--     RAISE EXCEPTION 'Sign in with a student account to take assessments.' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT * INTO v_survey FROM surveys
--    WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
--   END IF;
--
--   v_attempt := next_attempt_for(v_user, v_survey);
--   IF v_attempt IS NULL THEN
--     RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
--   END IF;
--
--   v_form := assessment_form_for(v_survey, v_attempt);
--   RETURN jsonb_build_object(
--     'survey_id', v_survey.id,
--     'attempt_type', CASE WHEN v_attempt = 'single' THEN NULL ELSE v_attempt END,
--     'form', v_form,
--     'post_test_lock', CASE WHEN v_attempt = 'post'
--                            THEN post_test_lock_reason(v_user, v_survey.program_id) END,
--     'questions', strip_answer_key(CASE WHEN v_form = 'B' THEN v_survey.questions_data_post
--                                        ELSE v_survey.questions_data END)
--   );
-- END $$;
--
-- REVOKE ALL ON FUNCTION get_assessment_questions(uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION get_assessment_questions(uuid) TO authenticated;
--
-- CREATE OR REPLACE FUNCTION get_assessment_review(p_survey_id uuid) RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_user bigint := current_student_id();
--   v_survey surveys;
--   v_pre survey_responses;
--   v_post survey_responses;
--   v_post_form text;
--   v_questions jsonb;
--   v_items jsonb := '[]'::jsonb;
--   v_pre_pct numeric;
--   v_post_pct numeric;
-- BEGIN
--   IF v_user IS NULL THEN
--     RAISE EXCEPTION 'Sign in with a student account.' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT * INTO v_survey FROM surveys WHERE id = p_survey_id AND type = 'knowledge';
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Assessment not found.' USING ERRCODE = 'P0002';
--   END IF;
--
--   SELECT * INTO v_post FROM survey_responses
--    WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'post'
--    ORDER BY created_at DESC LIMIT 1;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'The review opens after you submit the post-test.' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT * INTO v_pre FROM survey_responses
--    WHERE user_id = v_user AND survey_id = p_survey_id AND attempt_type = 'pre'
--    ORDER BY created_at DESC LIMIT 1;
--
--   v_post_form := assessment_form_for(v_survey, 'post');
--
--   -- Items only for a real post-test form (Form B). When the post-test
--   -- used Form A these would be the pre-test items: score only instead.
--   IF v_post_form = 'B' THEN
--     v_questions := v_survey.questions_data_post;
--
--     -- Every field is named here: nothing from the stored question (the
--     -- key, the options, pairs_with) can reach the student by being left in.
--     SELECT coalesce(jsonb_agg(jsonb_build_object(
--              'id',                 q -> 'id',
--              'text',               q -> 'text',
--              'type',               q -> 'type',
--              'student_answer',     v_post.answers -> (q ->> 'id'),
--              'is_correct',         CASE WHEN q ->> 'type' = 'mcq' AND coalesce(q ->> 'correct_option', '') <> ''
--                                         THEN coalesce((v_post.answers ->> (q ->> 'id')) = q ->> 'correct_option', false)
--                                    END,
--              'related_program_id', q -> 'related_program_id',
--              'related_material_id', q -> 'related_material_id'
--            ) ORDER BY ord), '[]'::jsonb)
--       INTO v_items
--       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END)
--            WITH ORDINALITY AS t(q, ord);
--   END IF;
--
--   v_post_pct := coalesce(v_post.percentage,
--                          CASE WHEN v_post.total_scored > 0 THEN round(v_post.score * 100.0 / v_post.total_scored) END);
--   v_pre_pct := CASE WHEN v_pre.id IS NOT NULL THEN coalesce(v_pre.percentage,
--                          CASE WHEN v_pre.total_scored > 0 THEN round(v_pre.score * 100.0 / v_pre.total_scored) END) END;
--
--   RETURN jsonb_build_object(
--     'survey_id', v_survey.id,
--     'title', v_survey.title,
--     -- The pre-test (Form A) is score only, always.
--     'pre', CASE WHEN v_pre.id IS NULL THEN NULL ELSE jsonb_build_object(
--              'score', v_pre.score, 'total_scored', v_pre.total_scored,
--              'percentage', v_pre_pct, 'created_at', v_pre.created_at) END,
--     'post', jsonb_build_object(
--       'form', v_post_form,
--       'score', v_post.score, 'total_scored', v_post.total_scored,
--       'percentage', v_post_pct, 'created_at', v_post.created_at,
--       'items', v_items,
--       'items_withheld', v_post_form <> 'B'),
--     'comparison', CASE WHEN v_pre.id IS NULL OR v_pre_pct IS NULL OR v_post_pct IS NULL THEN NULL
--                        ELSE jsonb_build_object('pre_pct', v_pre_pct, 'post_pct', v_post_pct,
--                                                'points', v_post_pct - v_pre_pct) END
--   );
-- END $$;
--
-- REVOKE ALL ON FUNCTION get_assessment_review(uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION get_assessment_review(uuid) TO authenticated;
--
-- DROP FUNCTION IF EXISTS shuffle_assessment_questions(jsonb, text);
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 40: About page: vision, mission, visit us, objectives, pictures
-- =========================================================
-- New OPTIONAL fields for the singleton about_content row (all nullable, no
-- defaults needed: the page shows the standard wording, or hides the part,
-- when a field is empty). RLS is unchanged: public read, admin-only update.
--   vision, mission                 shown on the page when written
--   office_location, office_hours   "Visit us"
--   system_credits                  "About this system" credits (developers, adviser)
--   contact_facebook_url            https only; makes the Facebook name a link
--   objectives (jsonb array, max 6) NULL = the standard three objectives
--   hero_image_path, org_chart_path object names in the about-assets bucket
-- Run this BEFORE deploying the code. Safe to run twice.

ALTER TABLE about_content ADD COLUMN IF NOT EXISTS vision               text;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS mission              text;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS office_location      text;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS office_hours         text;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS system_credits       text;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS contact_facebook_url text;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS objectives           jsonb;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS hero_image_path      text;
ALTER TABLE about_content ADD COLUMN IF NOT EXISTS org_chart_path       text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'about_content_objectives_list') THEN
    ALTER TABLE about_content ADD CONSTRAINT about_content_objectives_list
      CHECK (objectives IS NULL OR (jsonb_typeof(objectives) = 'array' AND jsonb_array_length(objectives) <= 6));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'about_content_facebook_url_https') THEN
    ALTER TABLE about_content ADD CONSTRAINT about_content_facebook_url_https
      CHECK (contact_facebook_url IS NULL OR contact_facebook_url ~ '^https://');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'about_content_image_paths') THEN
    ALTER TABLE about_content ADD CONSTRAINT about_content_image_paths
      CHECK ((hero_image_path IS NULL OR hero_image_path ~ '^about/[A-Za-z0-9._-]+$')
         AND (org_chart_path  IS NULL OR org_chart_path  ~ '^about/[A-Za-z0-9._-]+$'));
  END IF;
END $$;

-- The pictures live in a bucket anyone can READ (they are shown on the public
-- About page); only admins can add, replace or delete. 5 MB, PNG / JPG / WebP.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('about-assets', 'about-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
   SET public = true,
       file_size_limit = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS about_assets_select_public ON storage.objects;
CREATE POLICY about_assets_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'about-assets');
DROP POLICY IF EXISTS about_assets_insert_admin ON storage.objects;
CREATE POLICY about_assets_insert_admin ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'about-assets' AND is_admin());
DROP POLICY IF EXISTS about_assets_update_admin ON storage.objects;
CREATE POLICY about_assets_update_admin ON storage.objects
  FOR UPDATE USING (bucket_id = 'about-assets' AND is_admin())
  WITH CHECK (bucket_id = 'about-assets' AND is_admin());
DROP POLICY IF EXISTS about_assets_delete_admin ON storage.objects;
CREATE POLICY about_assets_delete_admin ON storage.objects
  FOR DELETE USING (bucket_id = 'about-assets' AND is_admin());

NOTIFY pgrst, 'reload schema';

-- CHECK: 9 new columns, the bucket (public, 5242880 bytes, 3 image types), 4 policies.
SELECT (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'about_content'
           AND column_name IN ('vision','mission','office_location','office_hours','system_credits',
                               'contact_facebook_url','objectives','hero_image_path','org_chart_path')) AS new_columns,
       (SELECT public FROM storage.buckets WHERE id = 'about-assets') AS bucket_public,
       (SELECT file_size_limit FROM storage.buckets WHERE id = 'about-assets') AS size_limit,
       (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'about-assets') AS mime_types,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'about_assets_%') AS policies;

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 40 (run only to undo it). The images in the bucket are
-- not deleted by SQL alone, so empty the bucket first.
-- ---------------------------------------------------------
-- DROP POLICY IF EXISTS about_assets_select_public ON storage.objects;
-- DROP POLICY IF EXISTS about_assets_insert_admin ON storage.objects;
-- DROP POLICY IF EXISTS about_assets_update_admin ON storage.objects;
-- DROP POLICY IF EXISTS about_assets_delete_admin ON storage.objects;
-- (Empty the about-assets bucket from the Storage page first, then:)
-- DELETE FROM storage.buckets WHERE id = 'about-assets';
-- ALTER TABLE about_content DROP CONSTRAINT IF EXISTS about_content_image_paths;
-- ALTER TABLE about_content DROP CONSTRAINT IF EXISTS about_content_facebook_url_https;
-- ALTER TABLE about_content DROP CONSTRAINT IF EXISTS about_content_objectives_list;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS org_chart_path;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS hero_image_path;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS objectives;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS contact_facebook_url;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS system_credits;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS office_hours;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS office_location;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS mission;
-- ALTER TABLE about_content DROP COLUMN IF EXISTS vision;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 41: Analytics filters: Program, PWD status, IP status; small-group rule
-- =========================================================
-- The dashboard's shared filter bar gains three filters, and the two SQL
-- functions behind the Learning gain tab and the Material reach section take
-- the whole shared bar (so one set of filters drives the whole page):
--   learning_gain_summary:  + campus, age range, PWD, IP   (program, course,
--                             year level, gender and academic year already existed)
--   material_reach_summary: + program (participants), PWD, IP
-- PWD / IP are only ever used to FILTER an aggregate: nothing returned
-- identifies a student, and the registration form is not touched.
-- "Participants of a program" = students who answered (pre-test or post-test)
-- that program's awareness check.
-- SMALL-GROUP RULE, enforced here: a learning-gain group of 1 to 4 paired
-- students has its scores (means, gain, SD, normalized gain) returned as NULL
-- with "suppressed": true; the counts stay. The threshold is v_min_group.
-- Run it in one go (it is a single transaction). Safe to run twice.

BEGIN;

-- The old signatures go; the new ones (same names, extra optional parameters) replace them.
DROP FUNCTION IF EXISTS learning_gain_summary(integer, text, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean);

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
  ]'::jsonb,
  -- PHASE 41: the dashboard's shared filters
  p_campus        text    DEFAULT NULL,
  p_age_min       integer DEFAULT NULL,
  p_age_max       integer DEFAULT NULL,
  p_pwd           boolean DEFAULT NULL,   -- true = PWD only, false = not PWD
  p_ip            boolean DEFAULT NULL    -- true = IP only,  false = not IP
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
  -- A group with fewer paired students than this never has its scores returned.
  v_min_group CONSTANT integer := 5;
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
      prof.campus                                                  AS campus,
      prof.age                                                     AS age,
      COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified')    AS course,
      COALESCE(NULLIF(TRIM(prof.year_level), ''), 'Not specified') AS year_level,
      COALESCE(NULLIF(TRIM(prof.gender), ''), 'Not specified')     AS gender,
      CASE WHEN prof.is_pwd THEN 'PWD' ELSE 'Non-PWD' END          AS pwd,
      CASE WHEN prof.is_ip  THEN 'IP'  ELSE 'Non-IP'  END          AS ip,
      -- PHASE 31: opened one of the program's linked IEC materials at or
      -- before the pre-test, so the pre-test isn't a true baseline.
      EXISTS (
        SELECT 1
          FROM material_views mv
          JOIN program_materials pm ON pm.material_id = mv.material_id
         WHERE pm.program_id = ps.program_id
           AND mv.user_id = ps.user_id
           AND mv.first_viewed_at <= ps.pre_at
      ) AS viewed_before_pre,
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
       AND (p_campus IS NULL OR lower(TRIM(COALESCE(campus, ''))) = lower(TRIM(p_campus)))
       AND ((p_age_min IS NULL AND p_age_max IS NULL)
            OR (age IS NOT NULL
                AND (p_age_min IS NULL OR age >= p_age_min)
                AND (p_age_max IS NULL OR age <= p_age_max)))
       AND (p_pwd IS NULL OR (pwd = 'PWD') = p_pwd)
       AND (p_ip  IS NULL OR (ip  = 'IP')  = p_ip)
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
      COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre)                AS paired_n,
      COUNT(*) FILTER (WHERE post IS NULL     AND NOT viewed_before_pre)                AS incomplete_n,
      COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre AND pre >= 100) AS ceiling_n,
      COUNT(*) FILTER (WHERE viewed_before_pre)                                         AS viewed_before_pre_n,
      AVG(pre)                FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_pre,
      AVG(post)               FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_post,
      AVG(post - pre)         FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_gain,
      STDDEV_SAMP(post - pre) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS sd_diff
    FROM filtered
    GROUP BY GROUPING SETS (
      (program_id), (course), (gender), (age_bracket), (year_level), (pwd), (ip), ()
    )
  )
  SELECT jsonb_build_object(
    'min_group', v_min_group,
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'dimension',    g.dimension,
        'key',          g.key,
        'paired_n',     g.paired_n,
        'incomplete_n', g.incomplete_n,
        'ceiling_n',    g.ceiling_n,
        'viewed_before_pre_n', g.viewed_before_pre_n,
        -- Counts above stay visible; the scores below are withheld for a
        -- group of 1 to (v_min_group - 1) paired students.
        'suppressed',   (g.paired_n > 0 AND g.paired_n < v_min_group),
        'mean_pre',     CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.mean_pre, 2) END,
        'mean_post',    CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.mean_post, 2) END,
        'mean_gain',    CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.mean_gain, 2) END,
        'sd_diff',      CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.sd_diff, 4) END,
        'norm_gain',    CASE
                          WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL
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

REVOKE ALL ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb, text, integer, integer, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb, text, integer, integer, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION material_reach_summary(
  p_campus         text    DEFAULT NULL,
  p_course         text    DEFAULT NULL,
  p_year_level     text    DEFAULT NULL,
  p_gender         text    DEFAULT NULL,
  p_age_min        integer DEFAULT NULL,
  p_age_max        integer DEFAULT NULL,
  p_academic_year  integer DEFAULT NULL,
  p_iec_program_id integer DEFAULT NULL,
  p_include_test   boolean DEFAULT false,
  -- PHASE 41: the dashboard's shared Program / PWD / IP filters
  p_program_id     integer DEFAULT NULL,   -- participants of this program's awareness check
  p_pwd            boolean DEFAULT NULL,   -- true = PWD only, false = not PWD
  p_ip             boolean DEFAULT NULL    -- true = IP only,  false = not IP
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can view material reach analytics'
      USING ERRCODE = '42501';
  END IF;

  WITH linked AS (
    SELECT DISTINCT pm.material_id
      FROM program_materials pm
      JOIN programs  pr ON pr.id = pm.program_id  AND pr.archived_at IS NULL
      JOIN materials m  ON m.id  = pm.material_id AND m.archived_at  IS NULL
     WHERE p_iec_program_id IS NULL OR pm.program_id = p_iec_program_id
  ),
  students AS (
    SELECT
      u.id AS user_id,
      COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified') AS course,
      CASE TRIM(COALESCE(prof.year_level, ''))
        WHEN ''  THEN 'Not Specified'
        WHEN '1' THEN '1st Year'
        WHEN '2' THEN '2nd Year'
        WHEN '3' THEN '3rd Year'
        WHEN '4' THEN '4th Year'
        WHEN '5' THEN '5th Year'
        ELSE TRIM(prof.year_level)
      END AS year_level,
      prof.campus, prof.gender, prof.age, prof.created_at AS profile_created_at,
      COALESCE(prof.is_pwd, false) AS is_pwd,
      COALESCE(prof.is_ip,  false) AS is_ip,
      -- a participant = answered (pre-test or post-test) the awareness check of p_program_id
      (p_program_id IS NULL OR EXISTS (
         SELECT 1
           FROM survey_responses r
           JOIN surveys sv ON sv.id = r.survey_id
          WHERE r.user_id = u.id
            AND sv.type = 'knowledge'
            AND sv.program_id = p_program_id
            AND sv.archived_at IS NULL
      )) AS in_program,
      EXISTS (
        SELECT 1 FROM material_views mv
         WHERE mv.user_id = u.id
           AND mv.material_id IN (SELECT material_id FROM linked)
      ) AS reached
    FROM users u
    LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
    LEFT JOIN LATERAL (
      SELECT p.program, p.year_level, p.campus, p.gender, p.age, p.created_at, p.is_pwd, p.is_ip
        FROM profiles p
       WHERE p.id = au.id
          OR (u.student_id IS NOT NULL AND p.student_id = u.student_id)
       ORDER BY (p.id = au.id) DESC NULLS LAST
       LIMIT 1
    ) prof ON true
    WHERE u.role = 'student'
      AND u.archived_at IS NULL
      AND (p_include_test OR NOT u.is_test_account)
  ),
  filtered AS (
    SELECT *
      FROM students
     WHERE (p_campus   IS NULL OR lower(TRIM(COALESCE(campus, ''))) = lower(TRIM(p_campus)))
       AND (p_course   IS NULL OR lower(course) = lower(TRIM(p_course)))
       AND (p_year_level IS NULL OR lower(year_level) = lower(TRIM(p_year_level)))
       AND (p_gender   IS NULL OR lower(TRIM(COALESCE(gender, ''))) = lower(TRIM(p_gender)))
       AND ((p_age_min IS NULL AND p_age_max IS NULL)
            OR (age IS NOT NULL
                AND (p_age_min IS NULL OR age >= p_age_min)
                AND (p_age_max IS NULL OR age <= p_age_max)))
       AND (p_academic_year IS NULL
            OR EXTRACT(YEAR FROM profile_created_at)::int = p_academic_year)
       AND in_program
       AND (p_pwd IS NULL OR is_pwd = p_pwd)
       AND (p_ip  IS NULL OR is_ip  = p_ip)
  ),
  by_course AS (
    SELECT course AS key, COUNT(*) AS students, COUNT(*) FILTER (WHERE reached) AS reached
      FROM filtered GROUP BY course
  ),
  by_year AS (
    SELECT year_level AS key, COUNT(*) AS students, COUNT(*) FILTER (WHERE reached) AS reached
      FROM filtered GROUP BY year_level
  )
  SELECT jsonb_build_object(
    'by_course', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'key', key, 'students', students, 'reached', reached,
               'pct', ROUND(100.0 * reached / NULLIF(students, 0), 1))
             ORDER BY reached::numeric / NULLIF(students, 0) ASC NULLS LAST, students DESC, key)
        FROM by_course
    ), '[]'::jsonb),
    'by_year_level', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'key', key, 'students', students, 'reached', reached,
               'pct', ROUND(100.0 * reached / NULLIF(students, 0), 1))
             ORDER BY CASE key WHEN '1st Year' THEN 1 WHEN '2nd Year' THEN 2 WHEN '3rd Year' THEN 3
                               WHEN '4th Year' THEN 4 WHEN '5th Year' THEN 5
                               WHEN 'Not Specified' THEN 99 ELSE 50 END, key)
        FROM by_year
    ), '[]'::jsonb),
    'overall', (
      SELECT jsonb_build_object(
               'students', COUNT(*), 'reached', COUNT(*) FILTER (WHERE reached),
               'pct', ROUND(100.0 * COUNT(*) FILTER (WHERE reached) / NULLIF(COUNT(*), 0), 1))
        FROM filtered
    ),
    'linked_materials', (SELECT COUNT(*) FROM linked),
    'options', jsonb_build_object(
      'iec_programs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) ORDER BY p.title)
          FROM programs p WHERE p.archived_at IS NULL
      ), '[]'::jsonb)
    )
  ) INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean, integer, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean, integer, boolean, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- CHECK: both new signatures exist and the old ones are gone (expect 2 rows, 12 args each).
SELECT proname, pronargs
  FROM pg_proc
 WHERE proname IN ('learning_gain_summary', 'material_reach_summary')
 ORDER BY proname;

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 41 (run only to undo it): puts the two functions back
-- exactly as they were before. The dashboard code of this phase then needs to
-- be rolled back too (it calls the new parameters).
-- ---------------------------------------------------------
-- BEGIN;
-- DROP FUNCTION IF EXISTS learning_gain_summary(integer, text, text, text, text, integer, jsonb, text, integer, integer, boolean, boolean);
-- DROP FUNCTION IF EXISTS material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean, integer, boolean, boolean);
-- CREATE OR REPLACE FUNCTION learning_gain_summary(
--   p_program_id    integer DEFAULT NULL,
--   p_course        text    DEFAULT NULL,
--   p_year_level    text    DEFAULT NULL,
--   p_gender        text    DEFAULT NULL,
--   p_age_bracket   text    DEFAULT NULL,
--   p_academic_year integer DEFAULT NULL,
--   p_age_brackets  jsonb   DEFAULT '[
--     {"label": "17–18",        "min": 17, "max": 18},
--     {"label": "19–20",        "min": 19, "max": 20},
--     {"label": "21–22",        "min": 21, "max": 22},
--     {"label": "23 and above", "min": 23, "max": null}
--   ]'::jsonb
-- ) RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
-- DECLARE
--   result jsonb;
-- BEGIN
--   IF NOT is_admin() THEN
--     RAISE EXCEPTION 'Only admins can view learning gain analytics'
--       USING ERRCODE = '42501';
--   END IF;
--
--   WITH per_student AS (
--     -- One row per student per assessment: their pre and post scores.
--     SELECT
--       r.user_id,
--       r.survey_id,
--       s.program_id,
--       MAX(COALESCE(r.score::numeric * 100 / NULLIF(r.total_scored, 0), r.percentage))
--         FILTER (WHERE r.attempt_type = 'pre')  AS pre,
--       MAX(COALESCE(r.score::numeric * 100 / NULLIF(r.total_scored, 0), r.percentage))
--         FILTER (WHERE r.attempt_type = 'post') AS post,
--       MIN(r.created_at) FILTER (WHERE r.attempt_type = 'pre') AS pre_at
--     FROM survey_responses r
--     JOIN surveys s ON s.id = r.survey_id
--     WHERE s.type = 'knowledge'
--       AND s.program_id IS NOT NULL
--       AND r.attempt_type IN ('pre', 'post')
--     GROUP BY r.user_id, r.survey_id, s.program_id
--   ),
--   students AS (
--     SELECT
--       ps.*,
--       COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified')    AS course,
--       COALESCE(NULLIF(TRIM(prof.year_level), ''), 'Not specified') AS year_level,
--       COALESCE(NULLIF(TRIM(prof.gender), ''), 'Not specified')     AS gender,
--       CASE WHEN prof.is_pwd THEN 'PWD' ELSE 'Non-PWD' END          AS pwd,
--       CASE WHEN prof.is_ip  THEN 'IP'  ELSE 'Non-IP'  END          AS ip,
--       -- PHASE 31: opened one of the program's linked IEC materials at or
--       -- before the pre-test, so the pre-test isn't a true baseline.
--       EXISTS (
--         SELECT 1
--           FROM material_views mv
--           JOIN program_materials pm ON pm.material_id = mv.material_id
--          WHERE pm.program_id = ps.program_id
--            AND mv.user_id = ps.user_id
--            AND mv.first_viewed_at <= ps.pre_at
--       ) AS viewed_before_pre,
--       CASE
--         WHEN prof.age IS NULL THEN 'Not specified'
--         ELSE COALESCE(
--           (SELECT b ->> 'label'
--              FROM jsonb_array_elements(p_age_brackets) b
--             WHERE prof.age >= (b ->> 'min')::int
--               AND (b ->> 'max' IS NULL OR prof.age <= (b ->> 'max')::int)
--             LIMIT 1),
--           'Outside brackets')
--       END AS age_bracket
--     FROM per_student ps
--     JOIN users u ON u.id = ps.user_id AND NOT u.is_test_account
--     LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
--     LEFT JOIN LATERAL (
--       SELECT p.*
--         FROM profiles p
--        WHERE p.id = au.id
--           OR (u.student_id IS NOT NULL AND p.student_id = u.student_id)
--        ORDER BY (p.id = au.id) DESC NULLS LAST
--        LIMIT 1
--     ) prof ON true
--     WHERE ps.pre IS NOT NULL
--   ),
--   filtered AS (
--     SELECT *
--       FROM students
--      WHERE (p_program_id    IS NULL OR program_id  = p_program_id)
--        AND (p_course        IS NULL OR course      = p_course)
--        AND (p_year_level    IS NULL OR year_level  = p_year_level)
--        AND (p_gender        IS NULL OR gender      = p_gender)
--        AND (p_age_bracket   IS NULL OR age_bracket = p_age_bracket)
--        AND (p_academic_year IS NULL OR EXTRACT(YEAR FROM pre_at)::int = p_academic_year)
--   ),
--   grouped AS (
--     SELECT
--       CASE
--         WHEN GROUPING(program_id)  = 0 THEN 'program'
--         WHEN GROUPING(course)      = 0 THEN 'course'
--         WHEN GROUPING(gender)      = 0 THEN 'gender'
--         WHEN GROUPING(age_bracket) = 0 THEN 'age_bracket'
--         WHEN GROUPING(year_level)  = 0 THEN 'year_level'
--         WHEN GROUPING(pwd)         = 0 THEN 'pwd'
--         WHEN GROUPING(ip)          = 0 THEN 'ip'
--         ELSE 'overall'
--       END AS dimension,
--       COALESCE(program_id::text, course, gender, age_bracket, year_level, pwd, ip, 'All') AS key,
--       COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre)                AS paired_n,
--       COUNT(*) FILTER (WHERE post IS NULL     AND NOT viewed_before_pre)                AS incomplete_n,
--       COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre AND pre >= 100) AS ceiling_n,
--       COUNT(*) FILTER (WHERE viewed_before_pre)                                         AS viewed_before_pre_n,
--       AVG(pre)                FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_pre,
--       AVG(post)               FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_post,
--       AVG(post - pre)         FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_gain,
--       STDDEV_SAMP(post - pre) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS sd_diff
--     FROM filtered
--     GROUP BY GROUPING SETS (
--       (program_id), (course), (gender), (age_bracket), (year_level), (pwd), (ip), ()
--     )
--   )
--   SELECT jsonb_build_object(
--     'rows', COALESCE((
--       SELECT jsonb_agg(jsonb_build_object(
--         'dimension',    g.dimension,
--         'key',          g.key,
--         'paired_n',     g.paired_n,
--         'incomplete_n', g.incomplete_n,
--         'ceiling_n',    g.ceiling_n,
--         'viewed_before_pre_n', g.viewed_before_pre_n,
--         'mean_pre',     ROUND(g.mean_pre, 2),
--         'mean_post',    ROUND(g.mean_post, 2),
--         'mean_gain',    ROUND(g.mean_gain, 2),
--         'sd_diff',      ROUND(g.sd_diff, 4),
--         'norm_gain',    CASE
--                           WHEN g.mean_pre IS NULL OR g.mean_pre >= 100 THEN NULL
--                           ELSE ROUND((g.mean_post - g.mean_pre) / (100 - g.mean_pre), 4)
--                         END
--       ))
--       FROM grouped g
--     ), '[]'::jsonb),
--     -- Filter choices, from all (unfiltered) data so picking one filter
--     -- never hides the options of another.
--     'options', jsonb_build_object(
--       'programs', COALESCE((
--         SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) ORDER BY p.title)
--           FROM programs p
--          WHERE EXISTS (
--            SELECT 1 FROM surveys s
--             WHERE s.program_id = p.id AND s.type = 'knowledge' AND s.archived_at IS NULL
--          )
--       ), '[]'::jsonb),
--       'courses',     COALESCE((SELECT jsonb_agg(DISTINCT course)     FROM students), '[]'::jsonb),
--       'year_levels', COALESCE((SELECT jsonb_agg(DISTINCT year_level) FROM students), '[]'::jsonb),
--       'genders',     COALESCE((SELECT jsonb_agg(DISTINCT gender)     FROM students), '[]'::jsonb),
--       'years',       COALESCE((SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM pre_at)::int) FROM students), '[]'::jsonb)
--     )
--   ) INTO result;
--
--   RETURN result;
-- END $$;
--
-- REVOKE ALL ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb) TO authenticated;
--
-- CREATE OR REPLACE FUNCTION material_reach_summary(
--   p_campus         text    DEFAULT NULL,
--   p_course         text    DEFAULT NULL,
--   p_year_level     text    DEFAULT NULL,
--   p_gender         text    DEFAULT NULL,
--   p_age_min        integer DEFAULT NULL,
--   p_age_max        integer DEFAULT NULL,
--   p_academic_year  integer DEFAULT NULL,
--   p_iec_program_id integer DEFAULT NULL,
--   p_include_test   boolean DEFAULT false
-- ) RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
-- DECLARE
--   result jsonb;
-- BEGIN
--   IF NOT is_admin() THEN
--     RAISE EXCEPTION 'Only admins can view material reach analytics'
--       USING ERRCODE = '42501';
--   END IF;
--
--   WITH linked AS (
--     SELECT DISTINCT pm.material_id
--       FROM program_materials pm
--       JOIN programs  pr ON pr.id = pm.program_id  AND pr.archived_at IS NULL
--       JOIN materials m  ON m.id  = pm.material_id AND m.archived_at  IS NULL
--      WHERE p_iec_program_id IS NULL OR pm.program_id = p_iec_program_id
--   ),
--   students AS (
--     SELECT
--       u.id AS user_id,
--       COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified') AS course,
--       CASE TRIM(COALESCE(prof.year_level, ''))
--         WHEN ''  THEN 'Not Specified'
--         WHEN '1' THEN '1st Year'
--         WHEN '2' THEN '2nd Year'
--         WHEN '3' THEN '3rd Year'
--         WHEN '4' THEN '4th Year'
--         WHEN '5' THEN '5th Year'
--         ELSE TRIM(prof.year_level)
--       END AS year_level,
--       prof.campus, prof.gender, prof.age, prof.created_at AS profile_created_at,
--       EXISTS (
--         SELECT 1 FROM material_views mv
--          WHERE mv.user_id = u.id
--            AND mv.material_id IN (SELECT material_id FROM linked)
--       ) AS reached
--     FROM users u
--     LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
--     LEFT JOIN LATERAL (
--       SELECT p.program, p.year_level, p.campus, p.gender, p.age, p.created_at
--         FROM profiles p
--        WHERE p.id = au.id
--           OR (u.student_id IS NOT NULL AND p.student_id = u.student_id)
--        ORDER BY (p.id = au.id) DESC NULLS LAST
--        LIMIT 1
--     ) prof ON true
--     WHERE u.role = 'student'
--       AND u.archived_at IS NULL
--       AND (p_include_test OR NOT u.is_test_account)
--   ),
--   filtered AS (
--     SELECT *
--       FROM students
--      WHERE (p_campus   IS NULL OR lower(TRIM(COALESCE(campus, ''))) = lower(TRIM(p_campus)))
--        AND (p_course   IS NULL OR lower(course) = lower(TRIM(p_course)))
--        AND (p_year_level IS NULL OR lower(year_level) = lower(TRIM(p_year_level)))
--        AND (p_gender   IS NULL OR lower(TRIM(COALESCE(gender, ''))) = lower(TRIM(p_gender)))
--        AND ((p_age_min IS NULL AND p_age_max IS NULL)
--             OR (age IS NOT NULL
--                 AND (p_age_min IS NULL OR age >= p_age_min)
--                 AND (p_age_max IS NULL OR age <= p_age_max)))
--        AND (p_academic_year IS NULL
--             OR EXTRACT(YEAR FROM profile_created_at)::int = p_academic_year)
--   ),
--   by_course AS (
--     SELECT course AS key, COUNT(*) AS students, COUNT(*) FILTER (WHERE reached) AS reached
--       FROM filtered GROUP BY course
--   ),
--   by_year AS (
--     SELECT year_level AS key, COUNT(*) AS students, COUNT(*) FILTER (WHERE reached) AS reached
--       FROM filtered GROUP BY year_level
--   )
--   SELECT jsonb_build_object(
--     'by_course', COALESCE((
--       SELECT jsonb_agg(jsonb_build_object(
--                'key', key, 'students', students, 'reached', reached,
--                'pct', ROUND(100.0 * reached / NULLIF(students, 0), 1))
--              ORDER BY reached::numeric / NULLIF(students, 0) ASC NULLS LAST, students DESC, key)
--         FROM by_course
--     ), '[]'::jsonb),
--     'by_year_level', COALESCE((
--       SELECT jsonb_agg(jsonb_build_object(
--                'key', key, 'students', students, 'reached', reached,
--                'pct', ROUND(100.0 * reached / NULLIF(students, 0), 1))
--              ORDER BY CASE key WHEN '1st Year' THEN 1 WHEN '2nd Year' THEN 2 WHEN '3rd Year' THEN 3
--                                WHEN '4th Year' THEN 4 WHEN '5th Year' THEN 5
--                                WHEN 'Not Specified' THEN 99 ELSE 50 END, key)
--         FROM by_year
--     ), '[]'::jsonb),
--     'overall', (
--       SELECT jsonb_build_object(
--                'students', COUNT(*), 'reached', COUNT(*) FILTER (WHERE reached),
--                'pct', ROUND(100.0 * COUNT(*) FILTER (WHERE reached) / NULLIF(COUNT(*), 0), 1))
--         FROM filtered
--     ),
--     'linked_materials', (SELECT COUNT(*) FROM linked),
--     'options', jsonb_build_object(
--       'iec_programs', COALESCE((
--         SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) ORDER BY p.title)
--           FROM programs p WHERE p.archived_at IS NULL
--       ), '[]'::jsonb)
--     )
--   ) INTO result;
--
--   RETURN result;
-- END $$;
--
-- REVOKE ALL ON FUNCTION material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION material_reach_summary(text, text, text, text, integer, integer, integer, integer, boolean) TO authenticated;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;


-- =========================================================
-- PHASE 42: programs.end_date (optional last day of a multi-day program)
-- =========================================================
-- Additive and harmless. Run it BEFORE the client that reads/writes end_date
-- is deployed. NULL = a single-day program (the program ends on `date`).
-- `date_display` stays free display text only; it is never parsed for dates.
-- programs.status has no CHECK constraint (checked 2026-11-07: 'postponed',
-- 'cancelled' and any other text are accepted), so no constraint change is
-- needed for the Postponed / Cancelled override.

BEGIN;

ALTER TABLE programs ADD COLUMN IF NOT EXISTS end_date date;

COMMENT ON COLUMN programs.end_date IS
  'Optional last day of a multi-day program (Asia/Manila calendar day). NULL = single-day, ends on programs.date.';

COMMIT;

-- CHECK (expect 1 row: end_date | date | YES):
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'end_date';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 42 (run only to undo it). Dropping the column deletes
-- every end date that has been entered; the old client ignores the column.
-- ---------------------------------------------------------
-- ALTER TABLE programs DROP COLUMN IF EXISTS end_date;


-- =========================================================
-- PHASE 43: profiles.language (the student's chosen language: English / Tagalog)
-- =========================================================
-- Additive and harmless. NULL = no choice saved yet (the site shows English, or
-- the language the device remembers). Run it BEFORE the client that reads or
-- writes it is deployed. RLS needs no change: profiles_update_own_or_admin
-- already lets a signed-in student update their own row (id = auth.uid()).
-- The column is not read by any report, export or Analytics figure.

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_language_check
  CHECK (language IS NULL OR language IN ('en', 'tl'));

COMMENT ON COLUMN profiles.language IS
  'Display language chosen by the student: en (English) or tl (Tagalog). NULL = not chosen yet.';

COMMIT;

-- CHECK (expect 2 rows: the column, then the constraint):
SELECT 'column' AS what, column_name AS name, data_type || ' / nullable=' || is_nullable AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'language'
UNION ALL
SELECT 'constraint', conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_language_check';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 43 (run only to undo it). Dropping the column deletes every
-- saved language choice; the old client ignores the column.
-- ---------------------------------------------------------
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS language;


-- =========================================================
-- PHASE 44: close the role hole (a signed-in user could edit their own `users` row)
-- =========================================================
-- Before this phase the UPDATE policy on `users` only checked "is it your own row",
-- with no limit on columns, so a student could set their own role to 'admin'.
-- This phase:
--   1. is_admin() now also requires status = 'active' and archived_at IS NULL.
--   2. users_guard: a BROWSER session (database role authenticated / anon) can change
--      only status, campus, is_test_account, archived_at - and only if it is an admin.
--      A student can change no column of `users` at all. role, email, student_id, password,
--      consent_*, created_at, id can only be changed by the server (service key), by a
--      SECURITY DEFINER function (e.g. record_my_consent) or in the SQL editor.
--   3. users_keep_one_admin: the last active administrator cannot be deleted, archived,
--      deactivated or demoted, whoever asks (including the server and the SQL editor).
--   4. profiles_guard: id, student_id and user_role of a profile cannot be changed from the
--      browser (they are how a student's rows are tied together; the profile fields a
--      student may edit - name, program, year level, gender, age, PWD, IP - are unchanged).
-- No data is changed. Run it once, as one script.

BEGIN;

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM users
     WHERE email = (auth.jwt() ->> 'email')
       AND role = 'admin'
       AND status = 'active'
       AND archived_at IS NULL
  );
$$;

-- SECURITY INVOKER on purpose: current_user is the role that runs the UPDATE. A browser
-- session is 'authenticated'; the service key is 'service_role'; the SQL editor and
-- SECURITY DEFINER functions run as their owner. Only the first is limited here.
CREATE OR REPLACE FUNCTION users_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_allowed text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF is_admin() THEN
    v_allowed := ARRAY['status', 'campus', 'is_test_account', 'archived_at'];
  ELSE
    v_allowed := ARRAY[]::text[];
  END IF;

  -- every other column (including any added later) must stay exactly as it was
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'This account record can only be changed by the server.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_guard ON users;
CREATE TRIGGER users_guard
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_guard();

CREATE OR REPLACE FUNCTION users_keep_one_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'active' AND OLD.archived_at IS NULL
     AND ( TG_OP = 'DELETE'
           OR NEW.role IS DISTINCT FROM 'admin'
           OR NEW.status IS DISTINCT FROM 'active'
           OR NEW.archived_at IS NOT NULL )
     AND NOT EXISTS (
           SELECT 1
             FROM users u
            WHERE u.id <> OLD.id
              AND u.role = 'admin'
              AND u.status = 'active'
              AND u.archived_at IS NULL )
  THEN
    RAISE EXCEPTION 'You cannot remove, deactivate or archive the last active administrator.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_keep_one_admin ON users;
CREATE TRIGGER users_keep_one_admin
  BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION users_keep_one_admin();

CREATE OR REPLACE FUNCTION profiles_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR (NEW.user_role IS DISTINCT FROM OLD.user_role
         AND NOT (OLD.user_role IS NULL AND NEW.user_role = 'student'))
  THEN
    RAISE EXCEPTION 'This part of the profile can only be changed by the server.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard ON profiles;
CREATE TRIGGER profiles_guard
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_guard();

COMMIT;

-- CHECK 1 (expect 3 rows: profiles_guard on profiles, users_guard and users_keep_one_admin on users):
SELECT tgname, tgrelid::regclass AS on_table
  FROM pg_trigger
 WHERE tgname IN ('users_guard', 'users_keep_one_admin', 'profiles_guard') AND NOT tgisinternal
 ORDER BY tgname;

-- CHECK 2 (expect t): is_admin() now looks at status and archive.
SELECT prosrc ~ 'archived_at IS NULL' AND prosrc ~ 'status' AS is_admin_checks_active
  FROM pg_proc WHERE proname = 'is_admin';

-- CHECK 3 (expect 2): both administrators still count as active, so nobody is locked out.
SELECT count(*) AS active_admins
  FROM users WHERE role = 'admin' AND status = 'active' AND archived_at IS NULL;

-- OPTIONAL CHECK 4 - the last-admin rule, nothing is kept (everything is rolled back).
-- Expected: the first UPDATE works, the second stops with "You cannot remove, deactivate
-- or archive the last active administrator." Run it as one script, then it rolls back.
-- BEGIN;
-- UPDATE users SET status = 'inactive' WHERE id = 464;
-- UPDATE users SET status = 'inactive' WHERE id = 352;   -- <- must fail
-- ROLLBACK;

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 44 (run only to undo it). This reopens the hole.
-- ---------------------------------------------------------
-- DROP TRIGGER IF EXISTS profiles_guard ON profiles;
-- DROP TRIGGER IF EXISTS users_keep_one_admin ON users;
-- DROP TRIGGER IF EXISTS users_guard ON users;
-- DROP FUNCTION IF EXISTS profiles_guard();
-- DROP FUNCTION IF EXISTS users_keep_one_admin();
-- DROP FUNCTION IF EXISTS users_guard();
-- CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
-- LANGUAGE sql SECURITY DEFINER STABLE AS $$
--   SELECT EXISTS (
--     SELECT 1 FROM users WHERE email = (auth.jwt() ->> 'email') AND role = 'admin'
--   );
-- $$;


-- =========================================================
-- PHASE 48: close the "open to everyone" policy on student_activity
-- =========================================================
-- student_activity carried the policy "Enable all for testing":
-- ALL commands, role {public}, USING (true). Anyone, signed out as well,
-- could read, insert, update and delete every row. The table is legacy: it
-- has 0 rows and nothing in the app, the API or these migrations uses it.
-- Step 1 removes the policy (with RLS on and no policy the table is closed).
-- Step 2 drops the table, but only if it is still empty.
-- Run step 1 first and on its own, then step 2.

-- STEP 1
BEGIN;
DROP POLICY IF EXISTS "Enable all for testing" ON student_activity;
COMMIT;

-- STEP 2 (stops with an error, and changes nothing, if the table has any rows)
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM student_activity) THEN
    RAISE EXCEPTION 'student_activity is not empty: nothing was dropped.';
  END IF;
END $$;
DROP TABLE IF EXISTS student_activity;
COMMIT;

-- CHECK (expect 0 rows for both):
SELECT policyname FROM pg_policies WHERE tablename = 'student_activity';
SELECT relname FROM pg_class WHERE relname = 'student_activity' AND relkind = 'r';

-- ---------------------------------------------------------
-- ROLLBACK of PHASE 48. Recreates the table EMPTY and CLOSED (RLS on, no policy).
-- It deliberately does not bring back the open policy. The table held 0 rows.
-- ---------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS student_activity (
--   id                  integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
--   student_id          uuid DEFAULT auth.uid(),
--   programs_attended   integer DEFAULT 0,
--   participation_rate  integer DEFAULT 0,
--   updated_at          timestamptz DEFAULT CURRENT_TIMESTAMP
-- );
-- ALTER TABLE student_activity ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- PHASE 49: archived content is no longer readable by ordinary signed-in users
-- =========================================================
-- Until now every signed-in user could read ARCHIVED programs, materials,
-- program entries and program materials (USING (true)), and could read or
-- sign ANY file in the private bucket "material-files". The screens hide
-- archived items, but the database did not. After this phase:
--   * programs / materials / program_entries / program_materials: signed-in
--     users see only items that are not archived (admins see everything, which
--     the Archive screen and Restore need). A handout material also disappears
--     while its program is archived.
--   * material-files: a file is readable (and can get a signed link) only
--     while the material that uses it (file_path or thumb_path) is not
--     archived; admins can always read.
-- Visitors who are not signed in are unchanged. The server key is unaffected.
-- Run the whole block in one go. It only replaces SELECT policies; no data changes.

BEGIN;

DROP POLICY IF EXISTS programs_select_authenticated ON programs;
CREATE POLICY programs_select_authenticated ON programs
  FOR SELECT TO authenticated
  USING (archived_at IS NULL OR is_admin());

DROP POLICY IF EXISTS materials_select_authenticated ON materials;
CREATE POLICY materials_select_authenticated ON materials
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      archived_at IS NULL
      AND (program_id IS NULL
           OR EXISTS (SELECT 1 FROM programs p WHERE p.id = materials.program_id AND p.archived_at IS NULL))
    )
  );

DROP POLICY IF EXISTS program_entries_select_authenticated ON program_entries;
CREATE POLICY program_entries_select_authenticated ON program_entries
  FOR SELECT TO authenticated
  USING (is_admin()
         OR EXISTS (SELECT 1 FROM programs p WHERE p.id = program_entries.program_id AND p.archived_at IS NULL));

DROP POLICY IF EXISTS program_materials_select_authenticated ON program_materials;
CREATE POLICY program_materials_select_authenticated ON program_materials
  FOR SELECT TO authenticated
  USING (is_admin()
         OR EXISTS (SELECT 1 FROM programs p WHERE p.id = program_materials.program_id AND p.archived_at IS NULL));

DROP POLICY IF EXISTS material_files_select_authenticated ON storage.objects;
CREATE POLICY material_files_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'material-files'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM public.materials m
        WHERE (m.file_path = storage.objects.name OR m.thumb_path = storage.objects.name)
          AND m.archived_at IS NULL
          AND (m.program_id IS NULL
               OR EXISTS (SELECT 1 FROM public.programs p WHERE p.id = m.program_id AND p.archived_at IS NULL))
      )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- CHECK (expect these five policies, each with the new text):
-- SELECT tablename, policyname, qual FROM pg_policies
--  WHERE policyname IN ('programs_select_authenticated','materials_select_authenticated',
--        'program_entries_select_authenticated','program_materials_select_authenticated',
--        'material_files_select_authenticated');

-- ROLLBACK (commented): back to "every signed-in user reads everything"
-- BEGIN;
-- DROP POLICY IF EXISTS programs_select_authenticated ON programs;
-- CREATE POLICY programs_select_authenticated ON programs FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS materials_select_authenticated ON materials;
-- CREATE POLICY materials_select_authenticated ON materials FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS program_entries_select_authenticated ON program_entries;
-- CREATE POLICY program_entries_select_authenticated ON program_entries FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS program_materials_select_authenticated ON program_materials;
-- CREATE POLICY program_materials_select_authenticated ON program_materials FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS material_files_select_authenticated ON storage.objects;
-- CREATE POLICY material_files_select_authenticated ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'material-files');
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 50: archive retention, delete protection, anonymization, legacy cleanup
-- =========================================================
-- STEP 1 is additive and safe to run any time (nothing is deleted).
-- STEP 2 permanently removes the old unused tables. Run it after STEP 1.
-- Retention is OFF until the Guidance Office turns it on in the app.

-- ---------------------------------------------------------
-- STEP 1
-- ---------------------------------------------------------
BEGIN;

-- 1a. Settings: one row, written only by the server (service key).
CREATE TABLE IF NOT EXISTS retention_settings (
  id                      integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  archived_content_days   integer CHECK (archived_content_days IS NULL OR archived_content_days BETWEEN 30 AND 3650),
  archived_students_days  integer CHECK (archived_students_days IS NULL OR archived_students_days BETWEEN 30 AND 3650),
  dpo_name                text CHECK (dpo_name IS NULL OR length(dpo_name) <= 200),
  dpo_email               text CHECK (dpo_email IS NULL OR length(dpo_email) <= 254),
  retention_updated_at    timestamptz,      -- when the retention days were last saved ("Last updated" on the notice)
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              text
);
INSERT INTO retention_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE retention_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retention_settings_select_admin ON retention_settings;
CREATE POLICY retention_settings_select_admin ON retention_settings FOR SELECT TO authenticated USING (is_admin());
REVOKE ALL ON retention_settings FROM anon, authenticated;
GRANT SELECT ON retention_settings TO authenticated;

-- 1b. The only thing the public Privacy Notice can read.
CREATE OR REPLACE FUNCTION get_privacy_settings() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'archived_content_days',  archived_content_days,
    'archived_students_days', archived_students_days,
    'dpo_name',               dpo_name,
    'dpo_email',              dpo_email,
    'retention_updated_at',   retention_updated_at)
  FROM retention_settings WHERE id = 1;
$$;
REVOKE ALL ON FUNCTION get_privacy_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_privacy_settings() TO anon, authenticated;

-- 1c. Anonymized marker, and Activity Log type for retention.
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_entity_type_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_entity_type_check
  CHECK (entity_type IN ('program', 'material', 'survey', 'user', 'about', 'retention'));

-- 1d. Delete protection (enforced in the database, for everyone including the server key).
--     Test accounts are exempt so test data can always be cleaned up.
CREATE OR REPLACE FUNCTION protect_survey_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM survey_responses r JOIN users u ON u.id = r.user_id
   WHERE r.survey_id = OLD.id AND u.is_test_account IS NOT TRUE;
  IF n > 0 THEN
    RAISE EXCEPTION 'This survey has % responses used in analytics. It can be archived, not deleted.', n
      USING ERRCODE = '23001';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS protect_survey_delete ON surveys;
CREATE TRIGGER protect_survey_delete BEFORE DELETE ON surveys
  FOR EACH ROW EXECUTE FUNCTION protect_survey_delete();

CREATE OR REPLACE FUNCTION protect_user_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF OLD.role = 'student' AND OLD.is_test_account IS NOT TRUE THEN
    SELECT (SELECT count(*) FROM survey_responses WHERE user_id = OLD.id)
         + (SELECT count(*) FROM material_views   WHERE user_id = OLD.id) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'This student has % responses used in analytics. Anonymize instead.', n
        USING ERRCODE = '23001';
    END IF;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS protect_user_delete ON users;
CREATE TRIGGER protect_user_delete BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_user_delete();

-- An anonymized student can never be restored to the active list.
CREATE OR REPLACE FUNCTION protect_anonymized_user() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.anonymized_at IS NOT NULL
     AND (NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at OR NEW.archived_at IS NULL) THEN
    RAISE EXCEPTION 'An anonymized student cannot be restored or changed back.' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_anonymized_user ON users;
CREATE TRIGGER protect_anonymized_user BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_anonymized_user();

-- 1e. Anonymize one archived student, in one transaction. Server-only (service key).
--     Keeps survey_responses / material_views linked to the same users.id and keeps the
--     demographic columns analytics uses. The sign-in (Auth) account is NOT deleted
--     (deleting it also deletes the profile); the server renames it to the anonymous
--     address, sets a random password and bans it.
CREATE OR REPLACE FUNCTION anonymize_student(p_user_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u users%ROWTYPE;
  anon_sid text; anon_email text;
  prof_ids uuid[];
  n_prof int := 0; n_notif int := 0; n_inv int := 0; n_log int := 0;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found.'; END IF;
  IF u.role <> 'student' THEN RAISE EXCEPTION 'Only student accounts can be anonymized.'; END IF;
  IF u.anonymized_at IS NOT NULL THEN
    RETURN jsonb_build_object('already', true, 'anon_email', u.email);
  END IF;
  IF u.archived_at IS NULL THEN RAISE EXCEPTION 'Archive the student before anonymizing.'; END IF;

  anon_sid   := 'ANON-' || u.id;
  anon_email := 'anon-' || u.id || '@anonymized.invalid';

  -- the profile is found by student ID AND by the sign-in account of the same email,
  -- so a missing or mismatched student ID still gets the profile cleared
  SELECT coalesce(array_agg(DISTINCT id), '{}') INTO prof_ids
    FROM profiles
   WHERE (coalesce(u.student_id, '') <> '' AND student_id = u.student_id)
      OR id IN (SELECT a.id FROM auth.users a WHERE lower(a.email) = lower(u.email));

  UPDATE profiles
     SET full_name = 'Anonymized student', student_id = anon_sid,
         contact_no = NULL, course_year_section = NULL
   WHERE id = ANY(prof_ids);
  GET DIAGNOSTICS n_prof = ROW_COUNT;

  DELETE FROM notifications WHERE user_id = u.id;
  GET DIAGNOSTICS n_notif = ROW_COUNT;

  IF to_regclass('public.individual_inventory') IS NOT NULL THEN
    EXECUTE 'DELETE FROM individual_inventory WHERE student_id = ANY($1)' USING prof_ids;
    GET DIAGNOSTICS n_inv = ROW_COUNT;
  END IF;

  UPDATE activity_logs
     SET actor_name  = CASE WHEN lower(actor_email) = lower(u.email) THEN 'Anonymized student' ELSE actor_name END,
         actor_email = CASE WHEN lower(actor_email) = lower(u.email) THEN anon_email ELSE actor_email END,
         entity_label = CASE WHEN entity_type = 'user' AND entity_id IN (u.id::text, u.student_id, anon_sid)
                             THEN 'Anonymized student' ELSE entity_label END,
         details = CASE WHEN details IS NULL THEN NULL ELSE
                     replace(CASE WHEN length(coalesce(u.name, '')) >= 3 THEN replace(details, u.name, 'Anonymized student') ELSE details END,
                             coalesce(u.email, ''), anon_email) END
   WHERE lower(actor_email) = lower(u.email)
      OR (entity_type = 'user' AND entity_id IN (u.id::text, u.student_id, anon_sid))
      OR (coalesce(u.email, '') <> '' AND details ILIKE '%' || u.email || '%');
  GET DIAGNOSTICS n_log = ROW_COUNT;

  UPDATE users
     SET name = 'Anonymized student', email = anon_email, student_id = anon_sid,
         password = 'x' || md5(random()::text || clock_timestamp()::text || u.id::text),
         anonymized_at = now()
   WHERE id = u.id;

  RETURN jsonb_build_object('already', false, 'anon_email', anon_email, 'old_email', u.email,
    'profiles', n_prof, 'notifications', n_notif, 'inventory', n_inv, 'log_rows', n_log);
END $$;
REVOKE ALL ON FUNCTION anonymize_student(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION anonymize_student(bigint) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- STEP 2: remove the old unused tables.
-- The six "empty" tables are checked first: if any has rows, nothing is dropped.
-- security_logs (638 rows) is purged for good: the rows CANNOT be restored.
-- ---------------------------------------------------------
BEGIN;
DO $$
DECLARE t text; has_rows boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['counseling_records','appointments','student_requests','system_logs','iec_materials','usage_logs'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', t) INTO has_rows;
      IF has_rows THEN RAISE EXCEPTION 'Table % is not empty: nothing was dropped.', t; END IF;
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS counseling_records, appointments, student_requests, system_logs, iec_materials, usage_logs;
DROP TABLE IF EXISTS security_logs;
COMMIT;

-- CHECK after STEP 1 (expect 1 row each: settings row, 3 triggers, 1 function with service_role only):
-- SELECT count(*) AS settings_rows FROM retention_settings;
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('protect_survey_delete','protect_user_delete','protect_anonymized_user') AND NOT tgisinternal;
-- SELECT get_privacy_settings();
-- CHECK after STEP 2 (expect 0 rows):
-- SELECT relname FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace
--  AND relname IN ('security_logs','counseling_records','appointments','student_requests','system_logs','iec_materials','usage_logs');

-- ---------------------------------------------------------
-- ROLLBACK of STEP 2 (commented). Recreates the tables EMPTY with their columns
-- (approximate: indexes are not restored). Purged security_logs rows CANNOT be restored.
-- ---------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS security_logs (
--   id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
--   created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
--   user_email text, role text, action text, details text,
--   status text DEFAULT 'success', ip_address text);
-- ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
-- CREATE TABLE IF NOT EXISTS counseling_records (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   student_id uuid REFERENCES profiles(id), counselor_id uuid REFERENCES profiles(id),
--   issue_type text, description text, intervention_plan text,
--   status text DEFAULT 'pending', created_at timestamptz DEFAULT now());
-- CREATE TABLE IF NOT EXISTS appointments (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   student_id uuid REFERENCES profiles(id), service_type text NOT NULL,
--   counselor_id uuid REFERENCES profiles(id),
--   appointment_date date NOT NULL, appointment_time time NOT NULL, purpose text NOT NULL,
--   status text NOT NULL DEFAULT 'pending', rejection_reason text, created_at timestamptz DEFAULT now());
-- CREATE TABLE IF NOT EXISTS student_requests (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   student_id uuid REFERENCES profiles(id), request_type text NOT NULL, purpose text NOT NULL,
--   status text DEFAULT 'pending', admin_remarks text, created_at timestamptz DEFAULT now());
-- CREATE TABLE IF NOT EXISTS system_logs (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id uuid REFERENCES profiles(id), action_performed text NOT NULL,
--   table_affected text, "timestamp" timestamptz DEFAULT now());
-- CREATE TABLE IF NOT EXISTS iec_materials (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   title text NOT NULL, category text NOT NULL, description text,
--   file_url text, external_link text, created_at timestamptz DEFAULT now());
-- CREATE TABLE IF NOT EXISTS usage_logs (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id uuid, login_at timestamptz DEFAULT now(), logout_at timestamptz,
--   browser_info text, ip_address text);
-- ALTER TABLE counseling_records ENABLE ROW LEVEL SECURITY; ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE student_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE iec_materials ENABLE ROW LEVEL SECURITY; ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
--
-- ROLLBACK of STEP 1 (commented). An anonymized student cannot be un-anonymized: the
-- original names were overwritten, so run this only before anyone has been anonymized.
-- DROP TRIGGER IF EXISTS protect_survey_delete ON surveys;
-- DROP TRIGGER IF EXISTS protect_user_delete ON users;
-- DROP TRIGGER IF EXISTS protect_anonymized_user ON users;
-- DROP FUNCTION IF EXISTS protect_survey_delete(); DROP FUNCTION IF EXISTS protect_user_delete();
-- DROP FUNCTION IF EXISTS protect_anonymized_user(); DROP FUNCTION IF EXISTS anonymize_student(bigint);
-- DROP FUNCTION IF EXISTS get_privacy_settings();
-- DROP TABLE IF EXISTS retention_settings;
-- DELETE FROM activity_logs WHERE entity_type = 'retention';
-- ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_entity_type_check;
-- ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_entity_type_check
--   CHECK (entity_type IN ('program', 'material', 'survey', 'user', 'about'));
-- ALTER TABLE users DROP COLUMN IF EXISTS anonymized_at;
-- NOTIFY pgrst, 'reload schema';


-- =========================================================
-- PHASE 51: lock down the old storage policies (program-posters, library, materials)
-- =========================================================
-- program-posters: the public site shows program photos from it through public URLs and
--   only an administrator uploads or removes them (ProgramManager). After this phase
--   everyone can still READ it; INSERT / UPDATE / DELETE are administrators only (is_admin()).
-- library and materials: not used by the app (library holds only an empty-folder
--   placeholder, materials is empty, nothing references either). Every policy on them is
--   dropped and the buckets are made private, so only the server key can touch them.
-- Policies of the other buckets (material-covers, material-files, about-assets, site-assets)
-- are never touched. The old policies are copied into storage_policy_backup_phase51 first,
-- so the rollback can put them back exactly.

-- ---------------------------------------------------------
-- PREVIEW (read-only). Run this first. Rows marked REPLACE are what STEP 1 drops.
-- ---------------------------------------------------------
SELECT policyname, cmd, roles, permissive, qual, with_check,
  CASE
    WHEN (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(material-covers|material-files|about-assets|site-assets)'
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '''(program-posters|library|materials)'''
      THEN 'MIXED with another bucket - left alone, tell me'
    WHEN (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '''(program-posters|library|materials)'''
      THEN 'REPLACE'
    WHEN (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ 'bucket_id'
      THEN 'NO BUCKET CONDITION (applies to every bucket) - left alone, tell me'
    ELSE 'other bucket - left alone'
  END AS what_step_1_does
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY what_step_1_does, policyname;

-- ---------------------------------------------------------
-- STEP 1
-- ---------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.storage_policy_backup_phase51 (
  policyname  text PRIMARY KEY,
  cmd         text,
  roles       text,
  permissive  text,
  qual        text,
  with_check  text,
  saved_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.storage_policy_backup_phase51 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_policy_backup_phase51 FROM anon, authenticated;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '''(program-posters|library|materials)'''
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ '(material-covers|material-files|about-assets|site-assets)'
       AND policyname NOT IN ('program_posters_select_public', 'program_posters_insert_admin',
                              'program_posters_update_admin', 'program_posters_delete_admin')
  LOOP
    INSERT INTO public.storage_policy_backup_phase51 (policyname, cmd, roles, permissive, qual, with_check)
    VALUES (r.policyname, r.cmd, array_to_string(r.roles, ','), r.permissive, r.qual, r.with_check)
    ON CONFLICT (policyname) DO NOTHING;
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END $do$;

-- program-posters: everyone reads, administrators write.
DROP POLICY IF EXISTS program_posters_select_public ON storage.objects;
CREATE POLICY program_posters_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'program-posters');
DROP POLICY IF EXISTS program_posters_insert_admin ON storage.objects;
CREATE POLICY program_posters_insert_admin ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'program-posters' AND is_admin());
DROP POLICY IF EXISTS program_posters_update_admin ON storage.objects;
CREATE POLICY program_posters_update_admin ON storage.objects
  FOR UPDATE USING (bucket_id = 'program-posters' AND is_admin())
  WITH CHECK (bucket_id = 'program-posters' AND is_admin());
DROP POLICY IF EXISTS program_posters_delete_admin ON storage.objects;
CREATE POLICY program_posters_delete_admin ON storage.objects
  FOR DELETE USING (bucket_id = 'program-posters' AND is_admin());

-- library and materials: unused, so no policy at all and no public links.
UPDATE storage.buckets SET public = false WHERE id IN ('library', 'materials');

COMMIT;
NOTIFY pgrst, 'reload schema';

-- CHECK after STEP 1:
-- 1) expect exactly the four program_posters_* policies for program-posters, and none for library / materials
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '''(program-posters|library|materials)''';
-- 2) expect library | f  and  materials | f
SELECT id, public FROM storage.buckets WHERE id IN ('library', 'materials', 'program-posters');
-- 3) the saved copies of what was dropped
SELECT policyname, cmd, roles FROM public.storage_policy_backup_phase51 ORDER BY policyname;

-- ---------------------------------------------------------
-- ROLLBACK (commented): puts the old policies back from the saved copies
-- ---------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS program_posters_select_public ON storage.objects;
-- DROP POLICY IF EXISTS program_posters_insert_admin ON storage.objects;
-- DROP POLICY IF EXISTS program_posters_update_admin ON storage.objects;
-- DROP POLICY IF EXISTS program_posters_delete_admin ON storage.objects;
-- DO $do$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT * FROM public.storage_policy_backup_phase51 LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
--     EXECUTE format('CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s',
--       r.policyname, r.permissive, r.cmd, r.roles,
--       CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
--       CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END);
--   END LOOP;
-- END $do$;
-- UPDATE storage.buckets SET public = true WHERE id IN ('library', 'materials');
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
-- (afterwards, once you are sure nothing needs it:  DROP TABLE public.storage_policy_backup_phase51;)

-- =========================================================
-- PHASE 52: one student, one identity in the Analytics dashboard
-- ---------------------------------------------------------
-- The dashboard matched survey responses to profiles through the student ID.
-- Nine students have a different student ID in `users` than in `profiles`,
-- so each was counted twice ("Students covered" 43 instead of 34) and their
-- answers were missing from the demographic filters.
-- This admin-only function returns, for every users row, the profile it
-- belongs to, found the same way learning_gain_summary and
-- material_reach_summary already do: by the sign-in (auth) id first, the
-- student ID only as a fallback. Read-only; it changes no data.
-- learning_gain_summary and material_reach_summary need no change.
-- =========================================================

CREATE OR REPLACE FUNCTION admin_user_profile_links()
RETURNS TABLE (link_user_id bigint, link_profile_id uuid, link_student_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can view this' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id::bigint, prof.id, prof.student_id::text
    FROM users u
    LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
    LEFT JOIN LATERAL (
      SELECT p.id, p.student_id
        FROM profiles p
       WHERE p.id = au.id
          OR (u.student_id IS NOT NULL AND p.student_id = u.student_id)
       ORDER BY (p.id = au.id) DESC NULLS LAST
       LIMIT 1
    ) prof ON true;
END $$;

REVOKE ALL ON FUNCTION admin_user_profile_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_user_profile_links() TO authenticated;
NOTIFY pgrst, 'reload schema';

-- CHECKS (run after the block above; a signed-in admin session is needed for the
-- function itself, so in the SQL editor check these two instead):
-- 1) the function exists and anon cannot run it (expect: authenticated only, no anon/PUBLIC)
-- SELECT has_function_privilege('anon', 'admin_user_profile_links()', 'EXECUTE') AS anon_can_run,
--        has_function_privilege('authenticated', 'admin_user_profile_links()', 'EXECUTE') AS authenticated_can_run;
-- 2) how many real students would be matched by sign-in id but NOT by student ID (expect 9)
-- SELECT count(*) FROM users u
--   JOIN auth.users au ON lower(au.email) = lower(u.email)
--   JOIN profiles p ON p.id = au.id
--  WHERE u.role = 'student' AND NOT u.is_test_account
--    AND (u.student_id IS NULL OR p.student_id <> u.student_id);

-- ROLLBACK (commented):
-- DROP FUNCTION IF EXISTS admin_user_profile_links();
-- NOTIFY pgrst, 'reload schema';

-- =========================================================
-- PHASE 53: quarantine the non-genuine survey responses
-- ---------------------------------------------------------
-- 282 survey_responses rows have created_at exactly 2026-10-28 08:00:00+00
-- (all other rows carry microseconds). They were written outside the app:
-- the app's only write path, submit_assessment(), never sets created_at,
-- 138 of their 145 post-tests break the "open every linked material first"
-- lock, and 8 of the accounts behind them never signed in.
-- They are COPIED to survey_responses_quarantine (admin-readable only, with a
-- reason) and then DELETED from survey_responses, in one transaction that
-- aborts unless exactly 282 rows are involved. The Analytics dashboard and
-- the learning-gain functions then see only genuine responses.
-- Nothing is lost: the rollback below puts every row back.
-- =========================================================

-- STEP 1 ------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS survey_responses_quarantine (
  id             uuid        PRIMARY KEY,
  created_at     timestamptz,
  user_id        bigint,
  survey_id      uuid,
  answers        jsonb,
  score          integer,
  total_scored   integer,
  percentage     numeric,
  attempt_type   text,
  quarantined_at timestamptz NOT NULL DEFAULT now(),
  reason         text        NOT NULL
);
-- (no foreign keys on purpose: removing a user later must not touch the evidence)

ALTER TABLE survey_responses_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON survey_responses_quarantine FROM PUBLIC, anon, authenticated;
GRANT SELECT ON survey_responses_quarantine TO authenticated;
DROP POLICY IF EXISTS survey_responses_quarantine_select_admin ON survey_responses_quarantine;
CREATE POLICY survey_responses_quarantine_select_admin ON survey_responses_quarantine
  FOR SELECT TO authenticated USING (is_admin());

DO $do$
DECLARE
  v_found   integer;
  v_pre     integer;
  v_post    integer;
  v_copied  integer;
  v_deleted integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE attempt_type = 'pre'), count(*) FILTER (WHERE attempt_type = 'post')
    INTO v_found, v_pre, v_post
    FROM survey_responses
   WHERE created_at = timestamptz '2026-10-28 08:00:00+00';
  IF v_found <> 282 THEN
    RAISE EXCEPTION 'Expected 282 rows stamped 2026-10-28 08:00:00+00, found %. Nothing was changed.', v_found;
  END IF;

  INSERT INTO survey_responses_quarantine
         (id, created_at, user_id, survey_id, answers, score, total_scored, percentage, attempt_type, reason)
  SELECT  id, created_at, user_id, survey_id, answers, score, total_scored, percentage, attempt_type,
          'Not genuine: written outside the app (created_at fixed at 2026-10-28 08:00:00 UTC; bypasses the post-test lock; accounts that never signed in)'
    FROM survey_responses
   WHERE created_at = timestamptz '2026-10-28 08:00:00+00';
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  DELETE FROM survey_responses r
   USING survey_responses_quarantine q
   WHERE q.id = r.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_copied <> 282 OR v_deleted <> 282 THEN
    RAISE EXCEPTION 'Copied %, deleted % (expected 282 each). Rolled back.', v_copied, v_deleted;
  END IF;

  -- Activity Log note, counts only
  INSERT INTO activity_logs (actor_email, actor_name, action, entity_type, entity_label, details)
  VALUES ('System', 'System', 'delete', 'survey', 'Survey responses',
          format('Removed non-genuine responses written outside the app (timestamp 2026-10-28 08:00 UTC): %s moved to quarantine (%s pre-test, %s post-test)',
                 v_found, v_pre, v_post));
END
$do$;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- CHECKS (run after STEP 1) ------------------------------------------------
-- 1) expect 28 left, 0 at the fake timestamp, 282 in quarantine
-- SELECT (SELECT count(*) FROM survey_responses) AS responses_left,
--        (SELECT count(*) FROM survey_responses WHERE created_at = timestamptz '2026-10-28 08:00:00+00') AS still_fake,
--        (SELECT count(*) FROM survey_responses_quarantine) AS quarantined;
-- 2) what is left, by program and attempt (expect only program 78: 18 pre, 10 post)
-- SELECT s.program_id, r.attempt_type, count(*)
--   FROM survey_responses r JOIN surveys s ON s.id = r.survey_id GROUP BY 1, 2 ORDER BY 1, 2;
-- 3) the table is closed to the public (expect false, true)
-- SELECT has_table_privilege('anon', 'survey_responses_quarantine', 'SELECT') AS anon_can_read,
--        has_table_privilege('authenticated', 'survey_responses_quarantine', 'SELECT') AS authenticated_has_select_but_rls_limits_to_admin;

-- ROLLBACK (commented): puts every quarantined row back exactly as it was ----
-- The set_attempt_type trigger would re-decide pre/post on insert, so it is
-- switched off for the restore only.
-- BEGIN;
-- ALTER TABLE survey_responses DISABLE TRIGGER survey_responses_set_attempt_type;
-- INSERT INTO survey_responses (id, created_at, user_id, survey_id, answers, score, total_scored, percentage, attempt_type)
-- SELECT id, created_at, user_id, survey_id, answers, score, total_scored, percentage, attempt_type
--   FROM survey_responses_quarantine
--  WHERE created_at = timestamptz '2026-10-28 08:00:00+00';
-- ALTER TABLE survey_responses ENABLE TRIGGER survey_responses_set_attempt_type;
-- DELETE FROM survey_responses_quarantine WHERE created_at = timestamptz '2026-10-28 08:00:00+00';
-- COMMIT;
-- (the Activity Log note stays: it is a record that the quarantine happened and was undone)
-- (to remove the table entirely once nothing needs it:  DROP TABLE survey_responses_quarantine;)

-- =========================================================
-- PHASE 54: admin-provisioned accounts + required profile step
-- ---------------------------------------------------------
-- 1. users.provisioned_batch / provisioned_at mark accounts an administrator
--    created. They are written only by the server key: users_guard already
--    stops every browser session from changing any column except the four
--    admin ones, including columns added later.
-- 2. profiles.is_pwd / is_ip / gender / age may be empty ("not answered yet").
--    A provisioned student leaves them empty and answers at first sign-in.
--    Column defaults are NOT changed, so registration is untouched.
-- 3. my_profile_is_complete(): true only when gender, age, PWD and IP have all
--    been answered. The app shows a required "Complete your profile" screen
--    (ProfileGate) until it is true, and submit_assessment() refuses to record
--    an answer before that, so the API cannot be used to skip the screen.
--    Every current profile (34 of 34) is already complete, so nobody who is
--    signed up today is affected.
-- Nothing in existing data is changed.
-- =========================================================

-- STEP 0 (read-only, run first and keep the output: it is what the rollback restores)
-- SELECT table_name, column_name, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND ((table_name = 'profiles' AND column_name IN ('gender', 'age', 'is_pwd', 'is_ip'))
--      OR (table_name = 'users'    AND column_name IN ('provisioned_batch', 'provisioned_at')))
--  ORDER BY table_name, column_name;

-- STEP 1 ------------------------------------------------------------------
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS provisioned_batch text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provisioned_at    timestamptz;

-- harmless if they are already nullable
ALTER TABLE profiles ALTER COLUMN gender DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN age    DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN is_pwd DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN is_ip  DROP NOT NULL;

CREATE OR REPLACE FUNCTION my_profile_is_complete() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT p.gender IS NOT NULL AND btrim(p.gender) <> ''
       AND p.age IS NOT NULL
       AND p.is_pwd IS NOT NULL
       AND p.is_ip  IS NOT NULL
      FROM profiles p
     WHERE p.id = auth.uid()
  ), false)
$$;

REVOKE ALL ON FUNCTION my_profile_is_complete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_profile_is_complete() TO authenticated;

-- submit_assessment: identical to the PHASE 34 version except the one new check
CREATE OR REPLACE FUNCTION submit_assessment(p_survey_id uuid, p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user bigint := current_student_id();
  v_survey surveys;
  v_attempt text;
  v_form text;
  v_questions jsonb;
  v_lock text;
  v_score integer;
  v_total integer;
  v_percentage numeric;
  v_row survey_responses;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in with a student account to submit.' USING ERRCODE = '42501';
  END IF;
  IF NOT my_profile_is_complete() THEN
    RAISE EXCEPTION 'Complete your profile before taking an assessment.' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers must be an object keyed by question id.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_survey FROM surveys
   WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
  END IF;

  v_attempt := next_attempt_for(v_user, v_survey);
  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
  END IF;

  IF v_attempt = 'post' THEN
    v_lock := post_test_lock_reason(v_user, v_survey.program_id);
    IF v_lock IS NOT NULL THEN
      RAISE EXCEPTION 'Post-test locked: %', v_lock USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_survey.type = 'knowledge' THEN
    v_form := assessment_form_for(v_survey, v_attempt);
    v_questions := CASE WHEN v_form = 'B' THEN v_survey.questions_data_post ELSE v_survey.questions_data END;

    SELECT count(*),
           count(*) FILTER (WHERE p_answers ->> (q ->> 'id') = q ->> 'correct_option')
      INTO v_total, v_score
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END
           ) AS t(q)
     WHERE q ->> 'type' = 'mcq'
       AND coalesce(q ->> 'correct_option', '') <> '';

    v_percentage := CASE WHEN v_total > 0 THEN round(v_score * 100.0 / v_total) END;
  END IF;

  INSERT INTO survey_responses (user_id, survey_id, answers, score, total_scored, percentage)
  VALUES (v_user, v_survey.id, p_answers, v_score, v_total, v_percentage)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'attempt_type', v_row.attempt_type,
    'form', v_form,
    'score', v_row.score,
    'total_scored', v_row.total_scored,
    'percentage', v_row.percentage
  );
END $$;

REVOKE ALL ON FUNCTION submit_assessment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_assessment(uuid, jsonb) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- CHECKS (run after STEP 1) ------------------------------------------------
-- 1) expect the 4 profiles columns (age, gender, is_ip, is_pwd) all YES, plus 2 users columns
-- SELECT table_name, column_name, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND ((table_name = 'profiles' AND column_name IN ('gender', 'age', 'is_pwd', 'is_ip'))
--      OR (table_name = 'users' AND column_name IN ('provisioned_batch', 'provisioned_at')))
--  ORDER BY 1, 2;
-- 2) expect: anon false, authenticated true
-- SELECT has_function_privilege('anon', 'my_profile_is_complete()', 'EXECUTE') AS anon,
--        has_function_privilege('authenticated', 'my_profile_is_complete()', 'EXECUTE') AS authenticated;
-- 3) expect 34 complete, 0 incomplete (nobody who exists today is blocked)
-- SELECT count(*) FILTER (WHERE gender IS NOT NULL AND btrim(gender) <> '' AND age IS NOT NULL AND is_pwd IS NOT NULL AND is_ip IS NOT NULL) AS complete,
--        count(*) FILTER (WHERE NOT (gender IS NOT NULL AND btrim(gender) <> '' AND age IS NOT NULL AND is_pwd IS NOT NULL AND is_ip IS NOT NULL)) AS incomplete
--   FROM profiles;

-- ROLLBACK (commented) -------------------------------------------------------
-- BEGIN;
-- -- the PHASE 34 submit_assessment, without the profile check
-- CREATE OR REPLACE FUNCTION submit_assessment(p_survey_id uuid, p_answers jsonb) RETURNS jsonb
-- LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_user bigint := current_student_id();
--   v_survey surveys;
--   v_attempt text;
--   v_form text;
--   v_questions jsonb;
--   v_lock text;
--   v_score integer;
--   v_total integer;
--   v_percentage numeric;
--   v_row survey_responses;
-- BEGIN
--   IF v_user IS NULL THEN
--     RAISE EXCEPTION 'Sign in with a student account to submit.' USING ERRCODE = '42501';
--   END IF;
--   IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
--     RAISE EXCEPTION 'Answers must be an object keyed by question id.' USING ERRCODE = '22023';
--   END IF;
--   SELECT * INTO v_survey FROM surveys
--    WHERE id = p_survey_id AND status = 'active' AND archived_at IS NULL;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'This assessment is not open.' USING ERRCODE = 'P0002';
--   END IF;
--   v_attempt := next_attempt_for(v_user, v_survey);
--   IF v_attempt IS NULL THEN
--     RAISE EXCEPTION 'You have already submitted this assessment.' USING ERRCODE = '23505';
--   END IF;
--   IF v_attempt = 'post' THEN
--     v_lock := post_test_lock_reason(v_user, v_survey.program_id);
--     IF v_lock IS NOT NULL THEN
--       RAISE EXCEPTION 'Post-test locked: %', v_lock USING ERRCODE = '42501';
--     END IF;
--   END IF;
--   IF v_survey.type = 'knowledge' THEN
--     v_form := assessment_form_for(v_survey, v_attempt);
--     v_questions := CASE WHEN v_form = 'B' THEN v_survey.questions_data_post ELSE v_survey.questions_data END;
--     SELECT count(*),
--            count(*) FILTER (WHERE p_answers ->> (q ->> 'id') = q ->> 'correct_option')
--       INTO v_total, v_score
--       FROM jsonb_array_elements(
--              CASE WHEN jsonb_typeof(v_questions) = 'array' THEN v_questions ELSE '[]'::jsonb END
--            ) AS t(q)
--      WHERE q ->> 'type' = 'mcq'
--        AND coalesce(q ->> 'correct_option', '') <> '';
--     v_percentage := CASE WHEN v_total > 0 THEN round(v_score * 100.0 / v_total) END;
--   END IF;
--   INSERT INTO survey_responses (user_id, survey_id, answers, score, total_scored, percentage)
--   VALUES (v_user, v_survey.id, p_answers, v_score, v_total, v_percentage)
--   RETURNING * INTO v_row;
--   RETURN jsonb_build_object('id', v_row.id, 'attempt_type', v_row.attempt_type, 'form', v_form,
--     'score', v_row.score, 'total_scored', v_row.total_scored, 'percentage', v_row.percentage);
-- END $$;
-- REVOKE ALL ON FUNCTION submit_assessment(uuid, jsonb) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION submit_assessment(uuid, jsonb) TO authenticated;
-- DROP FUNCTION IF EXISTS my_profile_is_complete();
-- ALTER TABLE users DROP COLUMN IF EXISTS provisioned_batch;
-- ALTER TABLE users DROP COLUMN IF EXISTS provisioned_at;
-- -- Only if STEP 0 showed these columns were NOT NULL, and only when no row has a NULL in them:
-- -- ALTER TABLE profiles ALTER COLUMN gender SET NOT NULL;   (likewise age, is_pwd, is_ip)
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- PHASE 55 — Admin setting "Send email notifications" (default OFF)
-- Documentation of SQL run by the user. /api/notify-students emails students
-- ONLY for a new program and ONLY when email_notifications is true; surveys
-- and everything else are in-app only. In-app notifications are always created.
-- Written only by /api/admin/notification-settings (service key); admins can read.
-- =====================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings (
  id                  integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email_notifications boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_select_admin ON app_settings;
CREATE POLICY app_settings_select_admin ON app_settings FOR SELECT TO authenticated USING (is_admin());
REVOKE ALL ON app_settings FROM anon, authenticated;
GRANT SELECT ON app_settings TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
-- Rollback: DROP TABLE IF EXISTS app_settings;

-- =====================================================================
-- PHASE 56 — Day-before reminder marker (documentation of SQL run by the user)
-- The daily cron (/api/cron/retention) runs a second step: for every published,
-- non-archived program whose first day (programs.date) is TOMORROW in Asia/Manila,
-- it creates one in-app notification per active, non-archived, non-test student.
-- In-app only: no email, whatever the email notifications setting says.
-- A program is claimed once per start date; changing programs.date makes a new
-- reminder possible. Additive and harmless.
-- =====================================================================
BEGIN;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS reminder_sent_at   timestamptz;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS reminder_for_date  date;
COMMENT ON COLUMN programs.reminder_for_date IS
  'The programs.date a day-before reminder was already sent for. Changing the date makes a new reminder possible.';
COMMIT;
NOTIFY pgrst, 'reload schema';
-- Rollback: ALTER TABLE programs DROP COLUMN IF EXISTS reminder_sent_at, DROP COLUMN IF EXISTS reminder_for_date;

-- =====================================================================
-- PHASE 57 — Small groups are shown, not hidden (documentation of SQL to be run by the user)
-- Analytics, the PDF and the Excel export now show the real numbers for a group of 1 to 4
-- students, with "n = X - small group, interpret with caution" next to it.
-- This replaces learning_gain_summary (same signature) with v_min_group = 1, so no scores are
-- returned as NULL any more. The result keys are unchanged; 'suppressed' is always false.
-- The AI insight keeps its own guard in the app (fewer than 5 students are not sent out).
-- Run it in one go. Safe to run twice.
-- =====================================================================
BEGIN;
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
  ]'::jsonb,
  -- PHASE 41: the dashboard's shared filters
  p_campus        text    DEFAULT NULL,
  p_age_min       integer DEFAULT NULL,
  p_age_max       integer DEFAULT NULL,
  p_pwd           boolean DEFAULT NULL,   -- true = PWD only, false = not PWD
  p_ip            boolean DEFAULT NULL    -- true = IP only,  false = not IP
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
  -- A group with fewer paired students than this never has its scores returned.
  -- PHASE 57: nothing is withheld any more. 1 means "no group is small enough to hide"; the app
  -- shows "n = X - small group, interpret with caution" for a group under 5 instead.
  v_min_group CONSTANT integer := 1;
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
      prof.campus                                                  AS campus,
      prof.age                                                     AS age,
      COALESCE(NULLIF(TRIM(prof.program), ''), 'Not specified')    AS course,
      COALESCE(NULLIF(TRIM(prof.year_level), ''), 'Not specified') AS year_level,
      COALESCE(NULLIF(TRIM(prof.gender), ''), 'Not specified')     AS gender,
      CASE WHEN prof.is_pwd THEN 'PWD' ELSE 'Non-PWD' END          AS pwd,
      CASE WHEN prof.is_ip  THEN 'IP'  ELSE 'Non-IP'  END          AS ip,
      -- PHASE 31: opened one of the program's linked IEC materials at or
      -- before the pre-test, so the pre-test isn't a true baseline.
      EXISTS (
        SELECT 1
          FROM material_views mv
          JOIN program_materials pm ON pm.material_id = mv.material_id
         WHERE pm.program_id = ps.program_id
           AND mv.user_id = ps.user_id
           AND mv.first_viewed_at <= ps.pre_at
      ) AS viewed_before_pre,
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
       AND (p_campus IS NULL OR lower(TRIM(COALESCE(campus, ''))) = lower(TRIM(p_campus)))
       AND ((p_age_min IS NULL AND p_age_max IS NULL)
            OR (age IS NOT NULL
                AND (p_age_min IS NULL OR age >= p_age_min)
                AND (p_age_max IS NULL OR age <= p_age_max)))
       AND (p_pwd IS NULL OR (pwd = 'PWD') = p_pwd)
       AND (p_ip  IS NULL OR (ip  = 'IP')  = p_ip)
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
      COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre)                AS paired_n,
      COUNT(*) FILTER (WHERE post IS NULL     AND NOT viewed_before_pre)                AS incomplete_n,
      COUNT(*) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre AND pre >= 100) AS ceiling_n,
      COUNT(*) FILTER (WHERE viewed_before_pre)                                         AS viewed_before_pre_n,
      AVG(pre)                FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_pre,
      AVG(post)               FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_post,
      AVG(post - pre)         FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS mean_gain,
      STDDEV_SAMP(post - pre) FILTER (WHERE post IS NOT NULL AND NOT viewed_before_pre) AS sd_diff
    FROM filtered
    GROUP BY GROUPING SETS (
      (program_id), (course), (gender), (age_bracket), (year_level), (pwd), (ip), ()
    )
  )
  SELECT jsonb_build_object(
    'min_group', v_min_group,
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'dimension',    g.dimension,
        'key',          g.key,
        'paired_n',     g.paired_n,
        'incomplete_n', g.incomplete_n,
        'ceiling_n',    g.ceiling_n,
        'viewed_before_pre_n', g.viewed_before_pre_n,
        -- Counts above stay visible; the scores below are withheld for a
        -- group of 1 to (v_min_group - 1) paired students.
        'suppressed',   (g.paired_n > 0 AND g.paired_n < v_min_group),
        'mean_pre',     CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.mean_pre, 2) END,
        'mean_post',    CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.mean_post, 2) END,
        'mean_gain',    CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.mean_gain, 2) END,
        'sd_diff',      CASE WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL ELSE ROUND(g.sd_diff, 4) END,
        'norm_gain',    CASE
                          WHEN g.paired_n > 0 AND g.paired_n < v_min_group THEN NULL
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

REVOKE ALL ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb, text, integer, integer, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_gain_summary(integer, text, text, text, text, integer, jsonb, text, integer, integer, boolean, boolean) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
-- Rollback: re-run the PHASE 41 definition above (v_min_group CONSTANT integer := 5).
