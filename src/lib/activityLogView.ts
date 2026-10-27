import type { ActivityAction, ActivityEntityType } from './activityLog';

// Wording, tabs, filters and date helpers for the admin Activity Log page.
// Kept out of the component so the rules live in one readable place.

export type LogTab = 'admin' | 'student';

export interface LogRow {
  id: number;
  actor_email: string;
  actor_name: string | null;
  action: ActivityAction;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  entity_label: string | null;
  details: string | null;
  created_at: string;
}

// consent_log joined to the student, merged into the Student activity tab.
export interface ConsentRow {
  id: number;
  consent_version: string;
  given_at: string;
  users: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null;
}

export type EventKind =
  | 'created'
  | 'updated'
  | 'archived'
  | 'restored'
  | 'permanently_deleted'
  | 'deleted'
  | 'removed_response'
  | 'about'
  | 'signed_in'
  | 'signed_out'
  | 'registered'
  | 'opened_programs'
  | 'consent';

// The exact notes the app writes into `details`. An archive is stored as a
// 'delete' with this note, so the page tells the three apart by it.
export const SELF_REGISTRATION = 'Student self-registration';
export const NOTE_ARCHIVED = 'Archived';
export const NOTE_RESTORED = 'Restored from Archive';
export const NOTE_PERMANENT = 'Permanently deleted from Archive';

export function eventKind(row: Pick<LogRow, 'action' | 'entity_type' | 'details'>): EventKind {
  const { action, entity_type: type, details } = row;
  if (action === 'login') return 'signed_in';
  if (action === 'logout') return 'signed_out';
  if (action === 'view') return 'opened_programs';
  if (action === 'create' && type === 'user' && details === SELF_REGISTRATION) return 'registered';
  if (type === 'about') return 'about';
  if (action === 'create') return 'created';
  if (action === 'update') return details === NOTE_RESTORED ? 'restored' : 'updated';
  if (details === NOTE_ARCHIVED) return 'archived';
  if (details === NOTE_PERMANENT) return 'permanently_deleted';
  if (type === 'survey' && details?.startsWith('removed ')) return 'removed_response';
  return 'deleted';
}

export const VERB: Record<EventKind, string> = {
  created: 'created',
  updated: 'updated',
  archived: 'archived',
  restored: 'restored',
  permanently_deleted: 'permanently deleted',
  deleted: 'deleted',
  removed_response: 'removed a response from',
  about: 'updated the About page',
  signed_in: 'signed in',
  signed_out: 'signed out',
  registered: 'registered an account',
  opened_programs: 'opened the Programs page',
  consent: 'agreed to the privacy notice',
};

export const NOUN: Record<ActivityEntityType, string> = {
  program: 'program',
  material: 'material',
  survey: 'survey',
  user: 'user account',
  about: 'About page',
};

// ----- Filters ---------------------------------------------------------

export interface Option {
  value: string;
  label: string;
}

export const ADMIN_ACTIONS: Option[] = [
  { value: 'all', label: 'All actions' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'archived', label: 'Archived' },
  { value: 'restored', label: 'Restored' },
  { value: 'permanently_deleted', label: 'Permanently deleted' },
  { value: 'removed_response', label: 'Removed a survey response' },
  { value: 'deleted', label: 'Deleted (before the Archive)' },
];

export const STUDENT_ACTIONS: Option[] = [
  { value: 'all', label: 'All activity' },
  { value: 'signed_in', label: 'Signed in' },
  { value: 'signed_out', label: 'Signed out' },
  { value: 'registered', label: 'Registered' },
  { value: 'consent', label: 'Agreed to the privacy notice' },
  { value: 'opened_programs', label: 'Opened the Programs page' },
];

export const ADMIN_TYPES: Option[] = [
  { value: 'all', label: 'All types' },
  { value: 'program', label: 'Programs' },
  { value: 'material', label: 'Materials' },
  { value: 'survey', label: 'Surveys' },
  { value: 'user', label: 'User accounts' },
  { value: 'about', label: 'About page' },
];

export const RANGES: Option[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

// PostgREST conditions, joined with AND by the page. What each tab may show
// is decided HERE, so a student's "viewed material" row can never come back:
// the admin tab only allows create/update/delete, the student tab only allows
// sign-in/out, program-page views and self-registration.
export function tabConditions(tab: LogTab): string[] {
  if (tab === 'admin') {
    return ['action.in.(create,update,delete)', `or(details.is.null,details.neq."${SELF_REGISTRATION}")`];
  }
  return [
    `or(action.in.(login,logout),and(action.eq.view,entity_type.eq.program),and(action.eq.create,entity_type.eq.user,details.eq."${SELF_REGISTRATION}"))`,
  ];
}

export function actionConditions(tab: LogTab, action: string): string[] {
  if (tab === 'student') {
    if (action === 'signed_in') return ['action.eq.login'];
    if (action === 'signed_out') return ['action.eq.logout'];
    if (action === 'registered') return ['action.eq.create'];
    if (action === 'opened_programs') return ['action.eq.view'];
    return [];
  }
  switch (action) {
    case 'created':
      return ['action.eq.create'];
    case 'updated':
      return ['action.eq.update', `or(details.is.null,details.neq."${NOTE_RESTORED}")`];
    case 'restored':
      return ['action.eq.update', `details.eq."${NOTE_RESTORED}"`];
    case 'archived':
      return ['action.eq.delete', `details.eq."${NOTE_ARCHIVED}"`];
    case 'permanently_deleted':
      return ['action.eq.delete', `details.eq."${NOTE_PERMANENT}"`];
    case 'removed_response':
      return ['action.eq.delete', 'entity_type.eq.survey', 'details.like."removed *"'];
    case 'deleted':
      return [
        'action.eq.delete',
        `or(details.is.null,and(details.neq."${NOTE_ARCHIVED}",details.neq."${NOTE_PERMANENT}",details.not.like."removed *"))`,
      ];
    default:
      return [];
  }
}

export function typeCondition(type: string): string[] {
  return ADMIN_TYPES.some((t) => t.value === type && type !== 'all') ? [`entity_type.eq.${type}`] : [];
}

// Characters that would break the PostgREST filter string are dropped.
export function cleanSearch(text: string): string {
  return text.replace(/[,()"\\*%]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function searchCondition(text: string): string[] {
  const q = cleanSearch(text);
  if (!q) return [];
  return [`or(actor_name.ilike.*${q}*,actor_email.ilike.*${q}*,entity_label.ilike.*${q}*)`];
}

// ----- Dates -----------------------------------------------------------

export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const parseLocalDate = (value: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

// ISO bounds for the chosen range, on local-day boundaries. `to` is exclusive.
export function rangeBounds(range: string, from: string, to: string, now = new Date()): { from?: string; to?: string } {
  const today = startOfLocalDay(now);
  if (range === '7d' || range === '30d') {
    const start = new Date(today);
    start.setDate(start.getDate() - (range === '7d' ? 6 : 29));
    return { from: start.toISOString() };
  }
  if (range === 'custom') {
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    const bounds: { from?: string; to?: string } = {};
    if (start) bounds.from = start.toISOString();
    if (end) {
      const next = new Date(end);
      next.setDate(next.getDate() + 1);
      bounds.to = next.toISOString();
    }
    return bounds;
  }
  return {};
}

export function dayLabel(iso: string, now = new Date()): string {
  const day = startOfLocalDay(new Date(iso));
  const today = startOfLocalDay(now);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const fullLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
