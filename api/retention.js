// Archive retention (PHASE 50): the Guidance Office decides, in Privacy and
// retention, how long archived content and archived student accounts are kept.
// Everything here runs on the server with the service key.
//
//   * Archived programs / materials / surveys older than the chosen number of
//     days are deleted for good, including their files in Storage and (for
//     hosted videos) in Cloudinary. A survey that has responses is never
//     deleted automatically.
//   * Archived STUDENT accounts older than the chosen number of days are
//     anonymized (name, email, student ID, contact details removed) so the
//     combined analytics stay correct. Administrators are never touched.
//   * Both are OFF until a number of days is saved. Restoring an item before
//     it is removed cancels the removal: every delete re-checks archived_at.
import crypto from 'node:crypto';

export const MIN_DAYS = 30;
export const MAX_DAYS = 3650;
const DAY_MS = 86400000;
const PRIVATE_BUCKET = 'material-files';
const SYSTEM = 'System';
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const daysText = (n) => (n ? `${n} days` : 'Off');

function parseStorageUrl(url) {
    if (!url) return null;
    const match = String(url).match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
}

export function validateSettings(body) {
    const days = (value, label) => {
        if (value === null || value === undefined || value === '') return { value: null };
        const n = Number(value);
        if (!Number.isInteger(n) || n < MIN_DAYS || n > MAX_DAYS) {
            return { error: `${label}: choose a number of days from ${MIN_DAYS} to ${MAX_DAYS}, or leave it Off.` };
        }
        return { value: n };
    };
    const content = days(body?.archivedContentDays, 'Archived content');
    if (content.error) return { error: content.error };
    const students = days(body?.archivedStudentsDays, 'Archived student accounts');
    if (students.error) return { error: students.error };

    const clean = (value, max) => {
        const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
        return text.length > max ? null : text;
    };
    const dpoName = clean(body?.dpoName, 200);
    const dpoEmail = clean(body?.dpoEmail, 254);
    if (dpoName === null) return { error: 'The Data Protection Officer name is too long.' };
    if (dpoEmail === null) return { error: 'The Data Protection Officer email is too long.' };
    if (dpoEmail && !EMAIL_SHAPE.test(dpoEmail)) return { error: 'Enter a valid email address for the Data Protection Officer, or leave it empty.' };

    return {
        values: {
            archived_content_days: content.value,
            archived_students_days: students.value,
            dpo_name: dpoName || null,
            dpo_email: dpoEmail || null,
        },
    };
}

export function createRetention({ supabase, findAuthUserByEmail, cldDestroy, cldReady = () => true }) {
    const writeLog = async (entry) => {
        try {
            await supabase.from('activity_logs').insert([{ entity_type: 'retention', ...entry }]);
        } catch (err) {
            console.warn('Activity log write failed (retention):', err.message);
        }
    };

    async function getSettings() {
        const { data, error } = await supabase.from('retention_settings').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;
        return data || { id: 1, archived_content_days: null, archived_students_days: null, dpo_name: null, dpo_email: null };
    }

    const cutoffFor = (days, now = Date.now()) => new Date(now - days * DAY_MS).toISOString();

    // ---- what a setting would affect right now (for the confirmation dialog)
    async function preview(contentDays, studentDays) {
        const head = (table) => supabase.from(table).select('id', { count: 'exact', head: true }).not('archived_at', 'is', null);
        const dueOf = (query, days) => (days ? query.lt('archived_at', cutoffFor(days)) : null);
        const n = async (query) => (query ? (await query).count || 0 : 0);

        const out = {
            content: { programs: { archived: 0, due: 0 }, materials: { archived: 0, due: 0 }, surveys: { archived: 0, due: 0, keptHasResponses: 0 } },
            students: { archived: 0, due: 0 },
        };
        const studentHead = () => supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student').is('anonymized_at', null).not('archived_at', 'is', null);
        const surveysDue = async () => {
            if (!contentDays) return [0, 0];
            const { data: dueSurveys } = await supabase.from('surveys').select('id').not('archived_at', 'is', null).lt('archived_at', cutoffFor(contentDays)).limit(500);
            const counts = await Promise.all((dueSurveys || []).map((s) => supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', s.id)));
            const kept = counts.filter((c) => c.count).length;
            return [counts.length - kept, kept];
        };
        const [pa, pd, ma, md, sa, [sd, sk], sta, std] = await Promise.all([
            n(head('programs')),
            n(dueOf(head('programs'), contentDays)),
            n(head('materials').is('program_id', null)),
            n(dueOf(head('materials').is('program_id', null), contentDays)),
            n(head('surveys')),
            surveysDue(),
            n(studentHead()),
            n(dueOf(studentHead(), studentDays)),
        ]);
        out.content.programs = { archived: pa, due: pd };
        out.content.materials = { archived: ma, due: md };
        out.content.surveys = { archived: sa, due: sd, keptHasResponses: sk };
        out.students = { archived: sta, due: std };
        return out;
    }

    // ---- saving the settings (the route checks the caller first)
    async function saveSettings(actor, body) {
        const checked = validateSettings(body);
        if (checked.error) return { status: 400, message: checked.error };
        const before = await getSettings();
        const next = checked.values;

        const notes = [];
        if ((before.archived_content_days || null) !== next.archived_content_days) {
            notes.push(`Archived content: ${daysText(before.archived_content_days)} → ${daysText(next.archived_content_days)}`);
        }
        if ((before.archived_students_days || null) !== next.archived_students_days) {
            notes.push(`Archived student accounts: ${daysText(before.archived_students_days)} → ${daysText(next.archived_students_days)}`);
        }
        const dpoChanged = (before.dpo_name || null) !== next.dpo_name || (before.dpo_email || null) !== next.dpo_email;
        if (dpoChanged) notes.push('Data Protection Officer details updated');
        if (notes.length === 0) return { status: 200, unchanged: true, settings: before };

        const retentionChanged = notes.some((t) => t.startsWith('Archived'));
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('retention_settings')
            .update({
                ...next,
                updated_at: now,
                updated_by: actor.email,
                ...(retentionChanged ? { retention_updated_at: now } : {}),
            })
            .eq('id', 1)
            .select('*')
            .maybeSingle();
        if (error) throw error;

        await writeLog({
            actor_email: actor.email,
            actor_name: actor.name || actor.email,
            action: 'update',
            entity_label: 'Privacy and retention',
            details: notes.join('; '),
        });
        return { status: 200, settings: data };
    }

    // ---- anonymize one student (archived only) ---------------------------
    async function anonymizeStudent(userId) {
        const { data: u, error } = await supabase
            .from('users')
            .select('id, email, student_id, role, archived_at, anonymized_at')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw error;
        if (!u) throw Object.assign(new Error('Student not found.'), { status: 404 });
        if (u.role !== 'student') throw Object.assign(new Error('Only student accounts can be anonymized.'), { status: 400 });
        if (!u.archived_at) throw Object.assign(new Error('Archive the student before anonymizing.'), { status: 400 });

        // The sign-in (Auth) account, found BEFORE the email changes.
        let authId = null;
        if (!u.anonymized_at && u.email) {
            const found = await findAuthUserByEmail(u.email);
            authId = found?.id || null;
        }

        const { data: result, error: rpcError } = await supabase.rpc('anonymize_student', { p_user_id: Number(userId) });
        if (rpcError) throw new Error(rpcError.message);
        const anonEmail = result.anon_email;

        // Retry path (the database step already ran): the profile now carries ANON-<id>.
        if (!authId) {
            const { data: profile } = await supabase.from('profiles').select('id').eq('student_id', `ANON-${userId}`).maybeSingle();
            authId = profile?.id || null;
        }
        if (!authId) {
            const found = await findAuthUserByEmail(anonEmail);
            authId = found?.id || null;
        }
        if (authId) {
            const { error: authError } = await supabase.auth.admin.updateUserById(authId, {
                email: anonEmail,
                email_confirm: true,
                password: `${crypto.randomBytes(30).toString('base64url')}aA1`,
                ban_duration: '876000h',
                user_metadata: { name: 'Anonymized student', role: 'student' },
            });
            if (authError) throw new Error(`The records were anonymized but the sign-in account could not be updated: ${authError.message}`);
        }
        return { ...result, authUpdated: !!authId };
    }

    // ---- permanent removal of archived content ---------------------------
    const removeFiles = async (publicUrls, privatePaths) => {
        const byBucket = new Map();
        for (const url of new Set((publicUrls || []).filter(Boolean))) {
            const parsed = parseStorageUrl(url);
            if (parsed) byBucket.set(parsed.bucket, [...(byBucket.get(parsed.bucket) || []), parsed.path]);
        }
        const priv = [...new Set((privatePaths || []).filter(Boolean))];
        if (priv.length) byBucket.set(PRIVATE_BUCKET, [...(byBucket.get(PRIVATE_BUCKET) || []), ...priv]);
        for (const [bucket, paths] of byBucket) {
            const { error } = await supabase.storage.from(bucket).remove(paths);
            if (error) console.warn(`Retention: storage cleanup failed in ${bucket}:`, error.message);
        }
    };

    // A removal is skipped (never forced) when the item was restored meanwhile.
    const stillDue = (row, cutoffIso) => row && row.archived_at && new Date(row.archived_at) < new Date(cutoffIso);

    async function removeProgram(id, cutoffIso) {
        const { data: program } = await supabase.from('programs').select('id, image_url, gallery_urls, archived_at').eq('id', id).maybeSingle();
        if (!stillDue(program, cutoffIso)) return 'skipped';
        const [{ data: entries }, { data: handouts }] = await Promise.all([
            supabase.from('program_entries').select('image_urls').eq('program_id', id),
            supabase.from('materials').select('file_url, image_url, file_path, thumb_path, video_public_id').eq('program_id', id),
        ]);
        for (const h of handouts || []) if (h.video_public_id) await cldDestroy(h.video_public_id);
        const { data: deleted, error } = await supabase.from('programs').delete().eq('id', id).lt('archived_at', cutoffIso).select('id');
        if (error) throw error;
        if (!deleted?.length) return 'skipped';
        await removeFiles(
            [program.image_url, ...(program.gallery_urls || []), ...(entries || []).flatMap((e) => e.image_urls || []), ...(handouts || []).flatMap((h) => [h.file_url, h.image_url])],
            (handouts || []).flatMap((h) => [h.file_path, h.thumb_path])
        );
        return 'removed';
    }

    async function removeMaterial(id, cutoffIso) {
        const { data: m } = await supabase.from('materials').select('id, file_url, image_url, file_path, thumb_path, video_public_id, archived_at, program_id').eq('id', id).maybeSingle();
        if (!stillDue(m, cutoffIso) || m.program_id !== null) return 'skipped';
        // The hosted video goes first; if that fails the row is kept.
        if (m.video_public_id) await cldDestroy(m.video_public_id);
        const { data: deleted, error } = await supabase.from('materials').delete().eq('id', id).lt('archived_at', cutoffIso).select('id');
        if (error) throw error;
        if (!deleted?.length) return 'skipped';
        await removeFiles([m.file_url, m.image_url], [m.file_path, m.thumb_path]);
        return 'removed';
    }

    async function removeSurvey(id, cutoffIso) {
        const { data: s } = await supabase.from('surveys').select('id, archived_at').eq('id', id).maybeSingle();
        if (!stillDue(s, cutoffIso)) return 'skipped';
        const { count } = await supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', id);
        if (count) return 'kept';
        const { data: deleted, error } = await supabase.from('surveys').delete().eq('id', id).lt('archived_at', cutoffIso).select('id');
        if (error) throw error;
        return deleted?.length ? 'removed' : 'skipped';
    }

    // ---- the daily run ----------------------------------------------------
    async function run({ cap = 25, maxMs = 8000, now = Date.now() } = {}) {
        const started = Date.now();
        const settings = await getSettings();
        const out = { off: false, programs: 0, materials: 0, surveys: 0, keptSurveys: 0, students: 0, failed: 0, capped: false };
        if (!settings.archived_content_days && !settings.archived_students_days) {
            out.off = true;
            return out;
        }
        let budget = cap;
        const outOfRoom = () => {
            if (budget <= 0 || Date.now() - started > maxMs) {
                out.capped = true;
                return true;
            }
            return false;
        };
        const attempt = async (fn, onRemoved) => {
            try {
                const result = await fn();
                if (result === 'removed') {
                    budget -= 1;
                    onRemoved();
                } else if (result === 'kept') {
                    out.keptSurveys += 1;
                }
                return result;
            } catch (err) {
                // A failure does not use up the day's budget (one stuck video must not
                // block everything behind it); the item is simply tried again next run.
                out.failed += 1;
                console.warn('Retention: one item could not be removed:', err.message);
                return 'failed';
            }
        };
        const MAX_FAILURES_PER_GROUP = 5;

        if (settings.archived_content_days) {
            const cutoff = cutoffFor(settings.archived_content_days, now);
            const jobs = [
                ['programs', removeProgram, 'programs', (q) => q],
                ['materials', removeMaterial, 'materials', (q) => q.is('program_id', null)],
                ['surveys', removeSurvey, 'surveys', (q) => q],
            ];
            for (const [table, fn, key, narrow] of jobs) {
                const { data: rows } = await narrow(supabase.from(table).select('id').not('archived_at', 'is', null).lt('archived_at', cutoff)).order('archived_at', { ascending: true }).limit(200);
                let groupFailures = 0;
                for (const row of rows || []) {
                    if (outOfRoom()) break;
                    const result = await attempt(() => fn(row.id, cutoff), () => { out[key] += 1; });
                    if (result === 'failed' && ++groupFailures >= MAX_FAILURES_PER_GROUP) break;
                }
            }
        }

        if (settings.archived_students_days) {
            const cutoff = cutoffFor(settings.archived_students_days, now);
            const { data: rows } = await supabase
                .from('users')
                .select('id')
                .eq('role', 'student')
                .is('anonymized_at', null)
                .not('archived_at', 'is', null)
                .lt('archived_at', cutoff)
                .order('archived_at', { ascending: true })
                .limit(200);
            let studentFailures = 0;
            for (const row of rows || []) {
                if (outOfRoom()) break;
                if (studentFailures >= MAX_FAILURES_PER_GROUP) break;
                // Re-check right before acting: a restored student is left alone.
                const { data: fresh } = await supabase.from('users').select('id, role, archived_at, anonymized_at').eq('id', row.id).maybeSingle();
                if (!fresh || fresh.role !== 'student' || fresh.anonymized_at || !stillDue(fresh, cutoff)) continue;
                const result = await attempt(async () => { await anonymizeStudent(row.id); return 'removed'; }, () => { out.students += 1; });
                if (result === 'failed') studentFailures += 1;
            }
        }

        if (out.programs + out.materials + out.surveys + out.students + out.failed > 0) {
            const parts = [
                `Removed ${out.programs} program${out.programs === 1 ? '' : 's'}, ${out.materials} material${out.materials === 1 ? '' : 's'}, ${out.surveys} survey${out.surveys === 1 ? '' : 's'}`,
                `anonymized ${out.students} student${out.students === 1 ? '' : 's'}`,
            ];
            if (out.keptSurveys) parts.push(`${out.keptSurveys} survey${out.keptSurveys === 1 ? '' : 's'} kept (have responses)`);
            if (out.failed) parts.push(`${out.failed} could not be removed and will be retried`);
            if (out.capped) parts.push('more remain for the next run');
            await writeLog({ actor_email: SYSTEM, actor_name: SYSTEM, action: 'delete', entity_label: 'Automatic cleanup', details: parts.join('; ') });
        }
        return out;
    }

    // The Activity Log entry for an administrator anonymizing a student by hand.
    // Written after the anonymization, so it never carries the old name.
    const writeAdminEntry = (admin, userId) =>
        supabase.from('activity_logs').insert([{
            actor_email: admin.authUser.email,
            actor_name: admin.record.name || admin.authUser.email,
            action: 'update',
            entity_type: 'user',
            entity_id: String(userId),
            entity_label: 'Anonymized student',
            details: 'Anonymized',
        }]);

    return { getSettings, preview, saveSettings, anonymizeStudent, writeAdminEntry, run, cldReady };
}

// ---- routes -----------------------------------------------------------------
export function registerRetentionRoutes(app, { retention, requireActiveAdmin, limiter, reminders }) {
    app.post('/api/admin/retention-preview', limiter, async (req, res) => {
        try {
            const admin = await requireActiveAdmin(req, res, 'Only administrators can view this.');
            if (!admin) return;
            const checked = validateSettings({ archivedContentDays: req.body?.archivedContentDays, archivedStudentsDays: req.body?.archivedStudentsDays });
            if (checked.error) return res.status(400).json({ message: checked.error });
            res.status(200).json(await retention.preview(checked.values.archived_content_days, checked.values.archived_students_days));
        } catch (error) {
            console.error('retention-preview error:', error.message);
            res.status(500).json({ message: 'Could not work out what this would affect.' });
        }
    });

    app.post('/api/admin/retention-settings', limiter, async (req, res) => {
        try {
            const admin = await requireActiveAdmin(req, res, 'Only administrators can change these settings.');
            if (!admin) return;
            const result = await retention.saveSettings({ email: admin.authUser.email, name: admin.record.name }, req.body || {});
            if (result.status !== 200) return res.status(result.status).json({ message: result.message });
            res.status(200).json({ unchanged: !!result.unchanged, settings: result.settings });
        } catch (error) {
            console.error('retention-settings error:', error.message);
            res.status(500).json({ message: 'Could not save the settings.' });
        }
    });

    app.post('/api/admin/anonymize-student', limiter, async (req, res) => {
        try {
            const admin = await requireActiveAdmin(req, res, 'Only administrators can anonymize a student.');
            if (!admin) return;
            const userId = Number(req.body?.userId);
            if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: 'userId is required' });
            const result = await retention.anonymizeStudent(userId);
            try {
                await retention.writeAdminEntry?.(admin, userId);
            } catch { /* logging never fails the action */ }
            res.status(200).json({ message: 'Student anonymized.', already: !!result.already });
        } catch (error) {
            const status = error.status || 500;
            if (status === 500) console.error('anonymize-student error:', error.message);
            res.status(status).json({ message: status === 500 ? 'Could not anonymize this student. Nothing was lost; try again.' : error.message });
        }
    });

    // Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>".
    app.get('/api/cron/retention', async (req, res) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return res.status(503).json({ message: 'The scheduled cleanup is not configured.' });
        const given = String(req.headers.authorization || '').replace(/^Bearer /, '');
        const hash = (v) => crypto.createHash('sha256').update(v).digest();
        if (!crypto.timingSafeEqual(hash(given), hash(secret))) return res.status(401).json({ message: 'Unauthorized' });
        // Two independent steps: the cleanup, then (PHASE 56) the day-before reminders.
        // A failure in one never stops the other.
        let failed = false;
        let cleanup = {};
        try {
            if (!retention.cldReady()) console.warn('Retention: Cloudinary is not configured; hosted videos cannot be removed.');
            cleanup = await retention.run();
        } catch (error) {
            failed = true;
            cleanup = { cleanupFailed: true };
            console.error('retention cron error:', error.message);
        }
        let reminderResult = { skipped: true };
        if (reminders) {
            try {
                reminderResult = await reminders.run();
            } catch (error) {
                failed = true;
                reminderResult = { failed: true };
                console.error('reminder cron error:', error.message);
            }
        }
        res.status(failed ? 500 : 200).json({ ...cleanup, reminders: reminderResult });
    });
}
