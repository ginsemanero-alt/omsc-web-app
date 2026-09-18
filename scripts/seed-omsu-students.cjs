/**
 * Seeds the 81 real OMSU research participants from
 * scripts/seed-data/omsu-students.csv.
 *
 * Mirrors /api/register's own signup path exactly (same bcryptjs hash,
 * same Auth-then-users-then-profiles insert order) via the service-role
 * client directly, instead of the public HTTP endpoint — that endpoint is
 * rate-limited to 5/hour, far too slow for 81 accounts, and this is
 * already trusted server-side code.
 *
 * Idempotent: matches existing accounts by email and skips them. The
 * credentials CSV is merged, not overwritten — a re-run that creates zero
 * new accounts must never wipe out passwords already written for
 * previously-created ones.
 *
 * REQUIRES: PHASE 19 migration (adds users.is_test_account) already run
 * in the Supabase SQL Editor — see supabase/migrations.sql.
 *
 * Usage:
 *   node scripts/seed-omsu-students.cjs
 *
 * Writes plaintext credentials to scripts/seed-data/omsu-credentials.csv
 * (gitignored — never commit this file).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CSV_PATH = path.join(__dirname, 'seed-data', 'omsu-students.csv');
const CREDENTIALS_PATH = path.join(__dirname, 'seed-data', 'omsu-credentials.csv');

// --- Minimal RFC4180-ish CSV line parser — handles the one quoted field
// (Name, which contains a comma) this file actually has. ---
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    header.forEach((key, i) => { row[key] = cells[i] ?? ''; });
    return row;
  });
}

// Reads whatever credentials rows already exist on disk, keyed by email,
// so a re-run only ever adds to this — it can never lose a password that
// was already written for a previously-created account.
function loadExistingCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) return new Map();
  const rows = parseCsv(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const map = new Map();
  rows.forEach((r) => {
    if (r.Email) map.set(r.Email.trim().toLowerCase(), [r.Name, r.Email, r.Password]);
  });
  return map;
}

function writeCredentials(map) {
  const rows = [['Name', 'Email', 'Password'], ...map.values()];
  const csvOut = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(CREDENTIALS_PATH, csvOut + '\n');
}

// "LASTNAME, Firstname M." -> "Firstname M. Lastname" — matches the
// Firstname-first display convention already used everywhere else in
// the app (e.g. real accounts show as "Angela Malutao", not
// "Malutao, Angela").
function toProperCase(word) {
  return word
    .toLowerCase()
    .replace(/(^|[\s.'-])([a-zà-ÿ])/gi, (m, sep, ch) => sep + ch.toUpperCase());
}

function formatName(rawName) {
  const [last, first] = rawName.split(',').map((s) => s.trim());
  if (!first) return toProperCase(last);
  return `${first} ${toProperCase(last)}`;
}

const YEAR_LEVEL_MAP = {
  '1st Year': '1',
  '2nd Year': '2',
  '3rd Year': '3',
  '4th Year': '4',
};

function mapYearLevel(raw) {
  return YEAR_LEVEL_MAP[raw?.trim()] || null;
}

function mapGender(raw) {
  const v = raw?.trim().toUpperCase();
  if (v === 'M') return 'Male';
  if (v === 'F') return 'Female';
  return null;
}

// The roster has no campus column — this rule was given explicitly:
// BSIT / Midwifery / any Education-major course is San Jose Campus,
// everything else is Labangan Campus.
function assignCampus(course) {
  return /Information Technology|Midwifery|Education/i.test(course)
    ? 'San Jose Campus'
    : 'Labangan Campus';
}

function generatePassword(usedPasswords) {
  let password;
  do {
    const digits = Math.floor(1000 + Math.random() * 9000); // 4 digits, digits only — no letter lookalike risk
    password = `Omsu-${digits}`;
  } while (usedPasswords.has(password));
  usedPasswords.add(password);
  return password;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Missing ${CSV_PATH}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  console.log(`Loaded ${rows.length} rows from omsu-students.csv`);

  const { error: isTestCheckError } = await supabase
    .from('users')
    .select('is_test_account')
    .limit(1);
  if (isTestCheckError) {
    console.error('users.is_test_account does not exist yet — run the PHASE 19 migration first.');
    console.error(isTestCheckError.message);
    process.exit(1);
  }

  const emails = rows.map((r) => r.Email.trim().toLowerCase());
  const { data: existingUsers, error: existingError } = await supabase
    .from('users')
    .select('email')
    .in('email', emails);
  if (existingError) throw existingError;
  const existingEmails = new Set((existingUsers || []).map((u) => u.email.toLowerCase()));

  const credentials = loadExistingCredentials();
  const usedPasswords = new Set(Array.from(credentials.values()).map((r) => r[2]));
  let created = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = row.Email.trim().toLowerCase();
    const name = formatName(row.Name);
    const studentId = `RESEARCH-${String(i + 1).padStart(3, '0')}`;

    if (existingEmails.has(email)) {
      skipped++;
      console.log(`SKIP  (already exists) ${name} <${email}>`);
      continue;
    }

    const campus = assignCampus(row.Course);
    const yearLevel = mapYearLevel(row['Year Level']);
    const gender = mapGender(row.Sex);
    const age = row.Age ? Number(row.Age) : null;
    const password = generatePassword(usedPasswords);

    let authUserId = null;
    try {
      const { data: authCreate, error: authCreateError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: 'student' },
      });
      if (authCreateError) throw authCreateError;
      authUserId = authCreate.user.id;

      const hashedPassword = await bcrypt.hash(password, 10);

      const { data: userRow, error: userError } = await supabase
        .from('users')
        .insert([{
          student_id: studentId,
          name,
          email,
          password: hashedPassword,
          role: 'student',
          campus,
          status: 'active',
          is_test_account: false,
        }])
        .select();
      if (userError) throw userError;

      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authUserId,
          full_name: name,
          student_id: studentId,
          campus,
          program: row.Course,
          year_level: yearLevel,
          age,
          gender,
          is_ip: false,
          is_pwd: false,
          user_role: 'student',
        }]);
      if (profileError) {
        await supabase.from('users').delete().eq('id', userRow[0].id);
        throw profileError;
      }

      credentials.set(email, [name, email, password]);
      writeCredentials(credentials); // persist after every success, not just at the end
      created++;
      console.log(`OK    ${name} <${email}> — ${studentId}, ${campus}`);
    } catch (err) {
      if (authUserId) {
        await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
      }
      failures.push({ name, email, error: err.message });
      console.error(`FAIL  ${name} <${email}>: ${err.message}`);
    }
  }

  console.log('\n--- SUMMARY ---');
  console.log(`Created: ${created}`);
  console.log(`Skipped (already existed): ${skipped}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.log('Failures:', JSON.stringify(failures, null, 2));
  }
  console.log(`Credentials file: ${CREDENTIALS_PATH} (${credentials.size} total rows)`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
