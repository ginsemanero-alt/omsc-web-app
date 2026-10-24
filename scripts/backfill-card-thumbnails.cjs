/**
 * PHASE 35 follow-up: give every infographic a sharp 480px card thumbnail in
 * the PRIVATE bucket (material-files/thumbs/), so a signed-in student's IEC
 * Library draws its cards from ~70 KB images instead of loading every 1-2 MB
 * original. Visitors who are not signed in keep the blurred public preview.
 *
 * It only ever CREATES: nothing is deleted or overwritten, and the original
 * files are only read. For each infographic that has a file_path and no
 * thumb_path it:
 *
 *   1. downloads the original from the private bucket and, when a backup
 *      folder with a manifest is given, checks it is byte-identical to the
 *      backup (sha256), so the thumbnail is made from the verified original;
 *   2. makes a 480px JPEG (no blur) with sharp;
 *   3. uploads it to material-files/thumbs/ (never overwriting) and downloads
 *      it again to check the stored copy matches;
 *   4. sets materials.thumb_path.
 *
 * If any check fails the script stops. Safe to run again: a row that already
 * has a thumb_path is skipped.
 *
 * Needs the PHASE 35 part D SQL (the thumb_path column) first.
 *
 * Usage:
 *   node scripts/backfill-card-thumbnails.cjs --dry-run
 *   node scripts/backfill-card-thumbnails.cjs
 *   node scripts/backfill-card-thumbnails.cjs --backup-dir=<folder with manifest.json>
 * Options: --width=480, --quality=85 (JPEG quality 1-100).
 * Keep width/quality in step with CARD_THUMB_MAX_WIDTH / CARD_THUMB_QUALITY
 * in src/lib/materialAccess.ts.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const DRY = !!args['dry-run'];
const WIDTH = Number(args.width || 480);
const QUALITY = Number(args.quality || 85);
const PRIVATE_BUCKET = 'material-files';

// the verified backup of the originals, if there is one
let manifest = [];
const backupDir = args['backup-dir']
  ? path.resolve(args['backup-dir'])
  : (() => {
      const dirs = fs.readdirSync(__dirname).filter((d) => d.startsWith('_material-backup-')).sort();
      return dirs.length ? path.join(__dirname, dirs[dirs.length - 1]) : null;
    })();
if (backupDir && fs.existsSync(path.join(backupDir, 'manifest.json'))) {
  manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const safe = (s) => s.replace(/[^a-zA-Z0-9._-]/g, '_');
const counts = { infographics: 0, skipped: 0, originalsVerified: 0, thumbnails: 0, uploaded: 0, rowsUpdated: 0, totalBytes: 0 };

async function download(p) {
  const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).download(p);
  if (error) throw new Error(`download ${p}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function main() {
  const { data: rows, error } = await supabase
    .from('materials')
    .select('id, title, type, file_path, thumb_path')
    .eq('type', 'Image')
    .order('id');
  if (error) throw error;

  log(`${rows.length} infographics. ${DRY ? 'DRY RUN: nothing will be changed.' : 'LIVE RUN.'} width ${WIDTH}px, quality ${QUALITY}, no blur.`);
  log(backupDir ? `Backup used to verify originals: ${backupDir} (${manifest.length} files)` : 'No backup folder found: originals are not compared to a backup.');

  for (const r of rows) {
    counts.infographics++;
    if (!r.file_path) { counts.skipped++; log(`material ${r.id}: no file_path, skipped`); continue; }
    if (r.thumb_path) { counts.skipped++; log(`material ${r.id}: already has thumb_path, skipped`); continue; }

    const original = await download(r.file_path);
    const backed = manifest.find((m) => m.id === r.id);
    if (backed) {
      if (sha(original) !== backed.sha256 || original.length !== backed.size) {
        throw new Error(`material ${r.id}: the private original does NOT match the backup. STOPPING, nothing changed for this or later rows.`);
      }
      counts.originalsVerified++;
    }

    const thumb = await sharp(original).rotate().resize({ width: WIDTH, withoutEnlargement: true }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    const meta = await sharp(thumb).metadata();
    counts.thumbnails++;
    counts.totalBytes += thumb.length;
    // file_path already starts with the material id (iec/30_...): don't repeat it
    const base = safe(path.basename(r.file_path).replace(/\.[^.]+$/, '')).replace(new RegExp(`^${r.id}_`), '');
    const target = `thumbs/${r.id}_${base}.jpg`;
    log(`material ${r.id}: ${backed ? 'original verified against the backup, ' : ''}thumbnail ${meta.width}x${meta.height}, ${Math.round(thumb.length / 1024)} KB -> ${PRIVATE_BUCKET}/${target}`);
    if (DRY) continue;

    const { error: upError } = await supabase.storage.from(PRIVATE_BUCKET).upload(target, thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (upError && !/already exists|Duplicate/i.test(upError.message)) throw new Error(`upload ${target}: ${upError.message}. STOPPING.`);
    counts.uploaded += upError ? 0 : 1;

    const back = await download(target);
    if (sha(back) !== sha(thumb)) throw new Error(`stored thumbnail ${target} does not match what was made. STOPPING (row not updated).`);

    const { error: dbError } = await supabase.from('materials').update({ thumb_path: target }).eq('id', r.id);
    if (dbError) throw new Error(`row ${r.id}: ${dbError.message}. STOPPING.`);
    counts.rowsUpdated++;
    log(`material ${r.id}: stored copy verified, thumb_path set`);
  }

  log('DONE. ' + JSON.stringify({ ...counts, totalKB: Math.round(counts.totalBytes / 1024), avgKB: counts.thumbnails ? Math.round(counts.totalBytes / counts.thumbnails / 1024) : 0 }));
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
