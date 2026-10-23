/**
 * PHASE 35: move the full IEC material files into the PRIVATE bucket and give
 * every infographic a small public preview.
 *
 * Before: the 12 infographics are stored in the PUBLIC material-covers bucket
 * (their cover and their full file are the same upload) and materials.file_url
 * is a public link anyone could read. This script, for every material whose
 * file_url points into Supabase Storage:
 *
 *   1. downloads the original and saves it in a local backup folder (with a
 *      sha256 manifest);
 *   2. puts a copy in the private bucket (material-files) and checks, by
 *      downloading it again, that its size and sha256 match the backup;
 *   3. for an infographic, makes a small JPEG preview in material-covers
 *      under previews/ and checks that it exists;
 *   4. updates the row (file_path = private path, file_url = NULL, and for an
 *      infographic image_url = the preview);
 *   5. only then deletes the original from the public bucket.
 *
 * If ANY check fails the script stops BEFORE deleting anything. Every step is
 * logged. It is safe to run again: a row that already has a file_path is
 * skipped, and an existing private copy is verified, not duplicated.
 *
 * Run AFTER the PHASE 35 part A SQL (the file_path column) and together with
 * part B (the lock-down).
 *
 * Usage:
 *   node scripts/migrate-material-files.cjs --dry-run
 *   node scripts/migrate-material-files.cjs                 # the real run
 *   node scripts/migrate-material-files.cjs --thumbs-only --blur=2   # redo previews
 *   node scripts/migrate-material-files.cjs --rollback --backup-dir=<folder>
 *
 * Options: --width=480 (preview width), --blur=2 (preview blur, px),
 *          --backup-dir=<folder> (default scripts/_material-backup-<time>).
 * Preview chosen from the real infographics: 480px wide with a 2px blur (at
 * 480px with no blur the headings were readable; with blur 2 only the big
 * poster title is).
 * Keep --width/--blur in step with PREVIEW_MAX_WIDTH / PREVIEW_BLUR_PX in
 * src/lib/materialAccess.ts.
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
const THUMBS_ONLY = !!args['thumbs-only'];
const ROLLBACK = !!args.rollback;
const WIDTH = Number(args.width || 480);
const BLUR = Number(args.blur === undefined ? 2 : args.blur);
const PRIVATE_BUCKET = 'material-files';
const COVER_BUCKET = 'material-covers';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.resolve(args['backup-dir'] || path.join(__dirname, `_material-backup-${stamp}`));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const mime = (name) =>
  ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg' }[
    (name.split('.').pop() || '').toLowerCase()
  ] || 'application/octet-stream');
const safe = (s) => s.replace(/[^a-zA-Z0-9._-]/g, '_');

// bucket + object path out of a Supabase public URL, or null (external link)
function parsePublicUrl(url) {
  const m = (url || '').match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  return m ? { bucket: m[1], path: decodeURIComponent(m[2].split('?')[0]) } : null;
}
const publicUrl = (bucket, p) => supabase.storage.from(bucket).getPublicUrl(p).data.publicUrl;

async function download(bucket, p) {
  const { data, error } = await supabase.storage.from(bucket).download(p);
  if (error) throw new Error(`download ${bucket}/${p}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

const counts = { originals: 0, backedUp: 0, privateCopies: 0, thumbnails: 0, rowsUpdated: 0, deleted: 0, skipped: 0 };

async function makeThumb(buf) {
  let img = sharp(buf).rotate().resize({ width: WIDTH, withoutEnlargement: true });
  if (BLUR > 0) img = img.blur(BLUR);
  return img.jpeg({ quality: 60 }).toBuffer();
}

async function rollback() {
  const manifestFile = path.join(BACKUP_DIR, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`No manifest at ${manifestFile}`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  log(`ROLLBACK from ${BACKUP_DIR}: ${manifest.length} originals`);
  for (const m of manifest) {
    const buf = fs.readFileSync(path.join(BACKUP_DIR, m.backupFile));
    if (sha(buf) !== m.sha256) throw new Error(`backup of material ${m.id} is corrupt, stopping`);
    const { error } = await supabase.storage.from(m.bucket).upload(m.path, buf, { contentType: mime(m.path), upsert: true });
    if (error) throw new Error(`restore ${m.bucket}/${m.path}: ${error.message}`);
    const { error: dbError } = await supabase
      .from('materials')
      .update({ file_url: m.original_file_url, image_url: m.original_image_url, file_path: null })
      .eq('id', m.id);
    if (dbError) throw dbError;
    log(`material ${m.id}: original restored to ${m.bucket}/${m.path}, row put back`);
  }
  log('ROLLBACK done. (Previews under material-covers/previews/ were left in place.)');
}

async function thumbsOnly() {
  const { data: rows, error } = await supabase.from('materials').select('id, type, file_path, image_url').eq('type', 'Image').not('file_path', 'is', null);
  if (error) throw error;
  log(`--thumbs-only: ${rows.length} infographics, width ${WIDTH}px, blur ${BLUR}px`);
  for (const r of rows) {
    const orig = await download(PRIVATE_BUCKET, r.file_path);
    const thumb = await makeThumb(orig);
    const tp = `previews/${r.id}_preview.jpg`;
    if (!DRY) {
      const { error: upError } = await supabase.storage.from(COVER_BUCKET).upload(tp, thumb, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' });
      if (upError) throw new Error(`upload preview ${r.id}: ${upError.message}`);
      const { error: dbError } = await supabase.from('materials').update({ image_url: publicUrl(COVER_BUCKET, tp) }).eq('id', r.id);
      if (dbError) throw dbError;
    }
    counts.thumbnails++;
    log(`material ${r.id}: preview ${DRY ? '(dry run) ' : ''}rewritten, ${thumb.length} bytes`);
  }
}

async function main() {
  if (ROLLBACK) return rollback();
  if (THUMBS_ONLY) return thumbsOnly();

  const { data: rows, error } = await supabase
    .from('materials')
    .select('id, title, type, file_url, image_url, file_path, archived_at')
    .order('id');
  if (error) throw error;

  const todo = [];
  for (const r of rows) {
    if (r.file_path) { counts.skipped++; log(`material ${r.id}: already has file_path, skipped`); continue; }
    const src = parsePublicUrl(r.file_url);
    if (!src) { counts.skipped++; log(`material ${r.id} (${r.type}): not a stored file (link/YouTube/none), skipped`); continue; }
    todo.push({ r, src });
  }
  counts.originals = todo.length;
  log(`${rows.length} materials, ${todo.length} files to move, ${counts.skipped} skipped. ${DRY ? 'DRY RUN: nothing will be changed.' : 'LIVE RUN.'}`);
  if (todo.length === 0) return;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  log(`Backup folder: ${BACKUP_DIR}`);

  // ---- 1. back up every original, locally ----
  const manifest = [];
  const originals = new Map();
  for (const { r, src } of todo) {
    const buf = await download(src.bucket, src.path);
    const file = `${String(r.id).padStart(4, '0')}__${src.bucket}__${safe(path.basename(src.path))}`;
    fs.writeFileSync(path.join(BACKUP_DIR, file), buf);
    const onDisk = fs.readFileSync(path.join(BACKUP_DIR, file));
    if (onDisk.length !== buf.length || sha(onDisk) !== sha(buf)) throw new Error(`backup of material ${r.id} does not match what was downloaded. STOPPING, nothing deleted.`);
    manifest.push({ id: r.id, bucket: src.bucket, path: src.path, backupFile: file, size: buf.length, sha256: sha(buf), original_file_url: r.file_url, original_image_url: r.image_url });
    originals.set(r.id, buf);
    counts.backedUp++;
    log(`material ${r.id}: backed up ${buf.length} bytes (sha256 ${sha(buf).slice(0, 12)}…)`);
  }
  fs.writeFileSync(path.join(BACKUP_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`Backup complete: ${counts.backedUp}/${todo.length} files + manifest.json`);

  // ---- 2. private copy, verified ----
  const plan = [];
  for (const { r, src } of todo) {
    const orig = originals.get(r.id);
    // Already in the private bucket (the uploaded video): no copy, just verify.
    const target = src.bucket === PRIVATE_BUCKET ? src.path : `iec/${r.id}_${safe(path.basename(src.path))}`;
    if (!DRY && src.bucket !== PRIVATE_BUCKET) {
      const { error: upError } = await supabase.storage.from(PRIVATE_BUCKET).upload(target, orig, { contentType: mime(target), upsert: false });
      if (upError && !/already exists|Duplicate/i.test(upError.message)) throw new Error(`private copy of ${r.id}: ${upError.message}. STOPPING, nothing deleted.`);
    }
    if (!DRY) {
      const back = await download(PRIVATE_BUCKET, target);
      if (back.length !== orig.length || sha(back) !== sha(orig)) throw new Error(`private copy of material ${r.id} does NOT match the original (size ${back.length} vs ${orig.length}). STOPPING, nothing deleted.`);
    }
    counts.privateCopies++;
    log(`material ${r.id}: private copy ${DRY ? '(dry run) ' : 'verified '}at ${PRIVATE_BUCKET}/${target}`);
    plan.push({ r, src, target });
  }

  // ---- 3. previews for the infographics ----
  const previews = new Map();
  for (const { r } of plan) {
    if (r.type !== 'Image') continue;
    const thumb = await makeThumb(originals.get(r.id));
    const tp = `previews/${r.id}_preview.jpg`;
    if (!DRY) {
      const { error: upError } = await supabase.storage.from(COVER_BUCKET).upload(tp, thumb, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' });
      if (upError) throw new Error(`preview of ${r.id}: ${upError.message}. STOPPING, nothing deleted.`);
      const back = await download(COVER_BUCKET, tp);
      if (back.length !== thumb.length) throw new Error(`preview of ${r.id} was not stored correctly. STOPPING, nothing deleted.`);
    }
    previews.set(r.id, publicUrl(COVER_BUCKET, tp));
    counts.thumbnails++;
    log(`material ${r.id}: preview ${DRY ? '(dry run) ' : ''}${WIDTH}px, blur ${BLUR}, ${thumb.length} bytes`);
  }
  if (DRY) { log('DRY RUN finished. Counts: ' + JSON.stringify(counts)); return; }

  // ---- 4. database, then 5. delete the public original ----
  for (const { r, src, target } of plan) {
    const update = { file_path: target, file_url: null };
    if (previews.has(r.id)) update.image_url = previews.get(r.id);
    const { error: dbError } = await supabase.from('materials').update(update).eq('id', r.id);
    if (dbError) throw new Error(`row ${r.id}: ${dbError.message}. STOPPING, nothing more deleted.`);
    counts.rowsUpdated++;
    log(`material ${r.id}: row updated (file_path, file_url cleared${previews.has(r.id) ? ', image_url = preview' : ''})`);

    if (src.bucket !== PRIVATE_BUCKET) {
      const { error: delError } = await supabase.storage.from(src.bucket).remove([src.path]);
      if (delError) { log(`material ${r.id}: WARNING could not delete the public original: ${delError.message}`); continue; }
      counts.deleted++;
      log(`material ${r.id}: public original deleted from ${src.bucket}/${src.path}`);
    }
  }

  // ---- final check: the old public links must be dead ----
  let stillPublic = 0;
  for (const { r, src } of plan) {
    if (src.bucket === PRIVATE_BUCKET) continue;
    const res = await fetch(publicUrl(src.bucket, src.path), { method: 'HEAD' });
    if (res.status === 200) { stillPublic++; log(`material ${r.id}: OLD PUBLIC LINK STILL WORKS (${res.status})`); }
  }
  log('DONE. ' + JSON.stringify(counts) + `  old public links still working: ${stillPublic}`);
  log(`Backup (originals + manifest.json): ${BACKUP_DIR}`);
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  console.error('Nothing further was deleted. Backup folder (if created):', BACKUP_DIR);
  process.exit(1);
});
