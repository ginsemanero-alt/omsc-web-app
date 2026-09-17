import { supabase } from './supabase';

// Fire-and-forget email fan-out to every active student, sent via the
// server's /api/notify-students (needs the service-role client + Resend's
// key, neither of which belong in the browser). Called right after a
// Program is published or a Survey goes active — a failure here (missing
// RESEND_API_KEY, Resend being down, etc.) must never surface as an error
// on what was otherwise a successful publish, so every failure path just
// warns to the console instead of throwing.
export async function notifyStudents(
  type: 'program' | 'survey',
  title: string,
  details?: string | null,
  actionPath?: string
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn('notifyStudents: no active session, skipping notification.');
      return;
    }

    const response = await fetch('/api/notify-students', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ type, title, details, actionPath }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('notifyStudents failed:', data?.message || response.statusText);
    } else {
      console.log(
        `notifyStudents: ${data.notified ?? 0} in-app notification(s), ` +
        `${data.emailSent ?? 0} email(s) sent of ${data.total ?? 0} active student(s).`
      );
    }
  } catch (err) {
    console.warn('notifyStudents error:', err);
  }
}
