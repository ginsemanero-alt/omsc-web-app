// PHASE 56: day-before reminder for students.
//
// Runs as a step of the existing daily cron (/api/cron/retention, see retention.js).
// Finds every published, non-archived program whose first day is TOMORROW in
// Asia/Manila time and creates ONE in-app notification per active student for it.
//
//   * In-app only. This module never sends email and never reads the email setting.
//   * Recipients: active, non-archived, non-test students.
//   * Idempotent: a program is claimed once per start date (programs.reminder_for_date),
//     so a rerun does not duplicate. If the start date is changed later, the stored
//     date no longer matches and a new reminder becomes possible.
//   * programs.date is the first day, programs.end_date the optional last day and
//     programs.time_range ("8:00 AM - 5:00 PM") holds the start time. date_display is
//     free text and is never parsed (same rule as src/lib/programStatus.ts).

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "YYYY-MM-DD" -> real calendar day, or null.
function parseDay(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
    return { y, m, d };
}

// "8:00 AM" -> "8:00 AM" (normalised), or null when there is no usable start time.
function startTimeText(timeRange) {
    const match = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(String(timeRange ?? ''));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return `${hour}:${match[2]} ${match[3].toUpperCase()}`;
}

// The calendar day after `nowMs`, in Asia/Manila, as "YYYY-MM-DD".
export function tomorrowInManila(nowMs = Date.now()) {
    return new Date(nowMs + MANILA_OFFSET_MS + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// A program an admin has not postponed or cancelled by hand.
const isGoingAhead = (status) => {
    const value = String(status ?? '').trim().toLowerCase();
    return value !== 'postponed' && value !== 'cancelled' && value !== 'canceled';
};

export function reminderText(program) {
    const first = parseDay(program.date);
    if (!first) return null;
    const last = parseDay(program.end_date);
    const multiDay = !!last && Date.UTC(last.y, last.m - 1, last.d) > Date.UTC(first.y, first.m - 1, first.d);
    const day = `${MONTHS[first.m - 1]} ${first.d}, ${first.y}`;
    const time = startTimeText(program.time_range);
    const when = time ? `${day}, ${time}` : day;
    const title = String(program.title ?? '').trim() || 'A guidance program';
    return `Reminder: ${title} ${multiDay ? 'starts' : 'is'} tomorrow, ${when}.`;
}

export function createReminders({ supabase }) {
    async function run({ now = Date.now() } = {}) {
        const out = { tomorrow: tomorrowInManila(now), programs: 0, notified: 0, alreadySent: 0, skipped: 0, failed: 0 };

        const { data: programs, error: programsError } = await supabase
            .from('programs')
            .select('id, title, date, end_date, time_range, status, reminder_for_date')
            .eq('date', out.tomorrow)
            .is('archived_at', null);
        if (programsError) throw programsError;

        const due = (programs || []).filter((p) => isGoingAhead(p.status));
        out.programs = due.length;
        if (due.length === 0) return out;

        const { data: students, error: studentsError } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'student')
            .eq('status', 'active')
            .is('archived_at', null)
            .eq('is_test_account', false);
        if (studentsError) throw studentsError;
        const recipients = students || [];

        for (const program of due) {
            const message = reminderText(program);
            if (!message || recipients.length === 0) {
                out.skipped += 1;
                continue;
            }

            // Claim it: only one run can win, and only for a date it was not already sent for.
            const { data: claimed, error: claimError } = await supabase
                .from('programs')
                .update({ reminder_sent_at: new Date(now).toISOString(), reminder_for_date: program.date })
                .eq('id', program.id)
                .or(`reminder_for_date.is.null,reminder_for_date.neq.${program.date}`)
                .select('id');
            if (claimError) {
                out.failed += 1;
                console.error('Reminder: could not claim a program:', claimError.message);
                continue;
            }
            if (!claimed || claimed.length === 0) {
                out.alreadySent += 1;
                continue;
            }

            // One insert for everybody, so it either all lands or none does.
            const { error: insertError, count } = await supabase.from('notifications').insert(
                recipients.map((student) => ({
                    user_id: student.id,
                    type: 'program',
                    title: program.title,
                    message,
                    action_path: `/student/programs?program=${program.id}`,
                })),
                { count: 'exact' }
            );
            if (insertError) {
                // Undo the claim so the next run tries again.
                await supabase.from('programs').update({ reminder_sent_at: null, reminder_for_date: null }).eq('id', program.id);
                out.failed += 1;
                console.error('Reminder: notifications could not be created:', insertError.message);
                continue;
            }
            out.notified += count ?? recipients.length;
        }
        return out;
    }

    return { run };
}
