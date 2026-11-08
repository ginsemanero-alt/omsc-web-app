import { supabase } from './supabase';

// Archive retention (PHASE 50). The settings live in the database
// (retention_settings, one row) and are changed only through the server.

export interface RetentionSettings {
  archived_content_days: number | null;
  archived_students_days: number | null;
  dpo_name: string | null;
  dpo_email: string | null;
  retention_updated_at: string | null;
  updated_at: string | null;
}

export const MIN_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 3650;
const DAY_MS = 86400000;
export const WARNING_DAYS = 7;

export async function fetchRetentionSettings(): Promise<RetentionSettings | null> {
  const { data, error } = await supabase
    .from('retention_settings')
    .select('archived_content_days, archived_students_days, dpo_name, dpo_email, retention_updated_at, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return (data as RetentionSettings | null) ?? null;
}

// POST to one of the admin routes with the signed-in session.
export async function adminPost<T = any>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No active session — please log in again.');
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || 'Something went wrong.') as Error & { code?: string };
    error.code = data?.code;
    throw error;
  }
  return data as T;
}

// "Mar 5, 2026" — dates stay in the English format everywhere in the app.
export const formatDay = (value: string | Date) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export interface RemovalInfo {
  removeOn: Date;
  daysLeft: number;
  soon: boolean;
}

// When an item archived at `archivedAt` will be removed, or null when the
// setting is Off.
export function removalInfo(archivedAt: string, days: number | null, now = new Date()): RemovalInfo | null {
  if (!days) return null;
  const removeOn = new Date(new Date(archivedAt).getTime() + days * DAY_MS);
  const daysLeft = Math.max(0, Math.ceil((removeOn.getTime() - now.getTime()) / DAY_MS));
  return { removeOn, daysLeft, soon: daysLeft <= WARNING_DAYS };
}
