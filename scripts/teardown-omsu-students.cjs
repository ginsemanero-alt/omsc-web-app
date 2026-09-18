/**
 * Removes all 81 OMSU research participant accounts seeded by
 * seed-omsu-students.cjs, plus everything attached to them (Auth
 * identity, users row, profiles row) — in case a re-seed is needed.
 *
 * Matches on the same email list from scripts/seed-data/omsu-students.csv
 * (not a hardcoded student_id range), so it stays correct even if the
 * roster changes.
 *
 * Usage:
 *   node scripts/teardown-omsu-students.cjs
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CSV_PATH = path.join(__dirname, 'seed-data', 'omsu-students.csv');

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

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Missing ${CSV_PATH}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  const emails = rows.map((r) => r.Email.trim().toLowerCase());
  console.log(`Tearing down up to ${emails.length} accounts...`);

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email')
    .in('email', emails);
  if (usersError) throw usersError;

  const { data: authList, error: authListError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authListError) throw authListError;
  const authByEmail = new Map((authList?.users || []).map((u) => [u.email?.toLowerCase(), u.id]));

  let removed = 0;
  for (const user of users || []) {
    const email = user.email.toLowerCase();
    const authId = authByEmail.get(email);

    if (authId) {
      await supabase.from('profiles').delete().eq('id', authId);
      await supabase.auth.admin.deleteUser(authId).catch((err) => {
        console.warn(`  auth delete failed for ${email}: ${err.message}`);
      });
    }

    const { error: deleteError } = await supabase.from('users').delete().eq('id', user.id);
    if (deleteError) {
      console.warn(`  users delete failed for ${email}: ${deleteError.message}`);
      continue;
    }

    removed++;
    console.log(`REMOVED ${email}`);
  }

  console.log(`\nRemoved ${removed} of ${emails.length} (rest were never seeded).`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
