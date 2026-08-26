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
