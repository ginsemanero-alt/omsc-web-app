/**
 * One-off recovery: regenerates passwords for OMSU research accounts
 * that already exist (matched by email from omsu-students.csv), updating
 * both the Supabase Auth password and the users.password bcrypt hash so
 * they stay in sync — same hashing path as /api/register (bcryptjs,
 * cost 10).
 *
 * Needed once because an earlier bug in seed-omsu-students.cjs
 * overwrote scripts/seed-data/omsu-credentials.csv with an empty file on
 * a no-op re-run, losing the plaintext passwords for accounts already
 * created. That bug is fixed (the script now merges instead of
 * overwriting) — this script exists only to recover from it this one
 * time.
 *
 * Usage:
 *   node scripts/reset-omsu-passwords.cjs
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CSV_PATH = path.join(__dirname, 'seed-data', 'omsu-students.csv');
const CREDENTIALS_PATH = path.join(__dirname, 'seed-data', 'omsu-credentials.csv');

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
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

function toProperCase(word) {
  return word.toLowerCase().replace(/(^|[\s.'-])([a-zà-ÿ])/gi, (m, sep, ch) => sep + ch.toUpperCase());
}

function formatName(rawName) {
  const [last, first] = rawName.split(',').map((s) => s.trim());
  if (!first) return toProperCase(last);
  return `${first} ${toProperCase(last)}`;
}

function generatePassword(usedPasswords) {
  let password;
  do {
    const digits = Math.floor(1000 + Math.random() * 9000);
    password = `Omsu-${digits}`;
  } while (usedPasswords.has(password));
  usedPasswords.add(password);
  return password;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  const emails = rows.map((r) => r.Email.trim().toLowerCase());

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email')
    .in('email', emails);
  if (usersError) throw usersError;
  console.log(`Found ${users.length} matching accounts to reset.`);

  const { data: authList, error: authListError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authListError) throw authListError;
  const authByEmail = new Map((authList?.users || []).map((u) => [u.email?.toLowerCase(), u.id]));

  const usedPasswords = new Set();
  const credentialRows = [['Name', 'Email', 'Password']];
  let succeeded = 0;
  const failures = [];

  for (const user of users) {
    const email = user.email.toLowerCase();
    const csvRow = rows.find((r) => r.Email.trim().toLowerCase() === email);
    const name = csvRow ? formatName(csvRow.Name) : user.email;
    const authId = authByEmail.get(email);

    if (!authId) {
      failures.push({ email, error: 'No matching Auth identity found' });
      console.error(`FAIL  ${email}: no Auth identity`);
      continue;
    }

    const password = generatePassword(usedPasswords);

    try {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(authId, { password });
      if (authUpdateError) throw authUpdateError;

      const hashedPassword = await bcrypt.hash(password, 10);
      const { error: dbUpdateError } = await supabase.from('users').update({ password: hashedPassword }).eq('id', user.id);
      if (dbUpdateError) throw dbUpdateError;

      credentialRows.push([name, email, password]);
      succeeded++;
      console.log(`OK    ${name} <${email}>`);
    } catch (err) {
      failures.push({ email, error: err.message });
      console.error(`FAIL  ${email}: ${err.message}`);
    }
  }

  const csvOut = credentialRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(CREDENTIALS_PATH, csvOut + '\n');

  console.log('\n--- SUMMARY ---');
  console.log(`Reset: ${succeeded}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length > 0) console.log('Failures:', JSON.stringify(failures, null, 2));
  console.log(`Credentials written to: ${CREDENTIALS_PATH}`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
