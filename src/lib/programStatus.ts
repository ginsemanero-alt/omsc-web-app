// What a program's status is RIGHT NOW, worked out from its schedule at read
// time. Nothing is written back to the database.
//
//   Upcoming   before the first day's start time
//   Ongoing    from the first day's start to the last day's end (the whole
//              span, including the nights between the days of a multi-day program)
//   Completed  once the last day's end time has passed (7:00 AM-5:00 PM is
//              Completed from 5:01 PM)
//
// The only thing an admin sets by hand is an override: Postponed or Cancelled.
// Any other stored value (upcoming / ongoing / completed, any capitalisation,
// empty, or something unknown: programs.status has no CHECK) means
// "Automatic" and is ignored.
//
// All times are Asia/Manila (UTC+8, no daylight saving), whatever the time zone
// of the device that is looking at the page.
export type ProgramStatus = 'upcoming' | 'ongoing' | 'completed' | 'postponed' | 'cancelled';

export interface ProgramStatusFields {
  date: string; // programs.date is a DATE column: "YYYY-MM-DD" (the first day)
  end_date?: string | null; // optional last day of a multi-day program (DATE)
  time_range?: string | null; // "8:00 AM - 5:00 PM" (see ProgramManager's formatTo12h)
  status?: string | null;
  date_display?: string | null; // display text only, never parsed
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MINUTES = 24 * 60;

export type StatusOverride = 'postponed' | 'cancelled' | null;

// The stored value as an override, or null for Automatic. Tolerates case,
// stray spaces, the US spelling, and every legacy / unknown value.
export function statusOverride(stored: string | null | undefined): StatusOverride {
  const value = (stored ?? '').toString().trim().toLowerCase();
  if (value === 'postponed') return 'postponed';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  return null;
}

// "YYYY-MM-DD" (a longer ISO timestamp is cut to its date) -> real calendar day, or null.
function parseDay(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? '').toString().trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

// "8:00 AM" -> minutes after midnight, or null.
function parseClock(text: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((text ?? '').trim());
  if (!match) return null;
  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
  return (hour12 % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + minute;
}

// Minutes after midnight (Asia/Manila) of a calendar day, as a UTC timestamp.
function manilaMoment(day: { y: number; m: number; d: number }, minutes: number): number {
  return Date.UTC(day.y, day.m - 1, day.d, 0, minutes) - MANILA_OFFSET_MS;
}

export interface ProgramWindow {
  start: number; // first moment of the program (ms)
  endExclusive: number; // first moment AFTER it (ms): the end minute plus one minute
}

// The program's first and last moment, or null when `date` is unusable.
export function getProgramWindow(program: ProgramStatusFields): ProgramWindow | null {
  const first = parseDay(program.date);
  if (!first) return null;

  // A missing, invalid or backwards end date means a single-day program.
  const firstMs = Date.UTC(first.y, first.m - 1, first.d);
  const last = parseDay(program.end_date);
  const lastDay = last && Date.UTC(last.y, last.m - 1, last.d) >= firstMs ? last : first;
  const singleDay = lastDay === first;

  const times = (program.time_range ?? '').match(/\d{1,2}:\d{2}\s*[AP]M/gi) ?? [];
  const startMinutes = parseClock(times[0]) ?? 0;
  let endMinutes = parseClock(times[1]);
  // No end time (or one that is not after the start on a single-day program):
  // the program lasts until the end of its last day.
  if (endMinutes === null || (singleDay && endMinutes < startMinutes)) endMinutes = DAY_MINUTES - 1;

  return {
    start: manilaMoment(first, startMinutes),
    endExclusive: manilaMoment(lastDay, endMinutes) + MINUTE_MS,
  };
}

export function getEffectiveProgramStatus(program: ProgramStatusFields, now: number = Date.now()): ProgramStatus {
  const override = statusOverride(program.status);
  if (override) return override;

  const window = getProgramWindow(program);
  if (!window) return 'upcoming'; // no usable date: nothing to compute from
  if (now < window.start) return 'upcoming';
  if (now < window.endExclusive) return 'ongoing';
  return 'completed';
}

export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
};

export function programStatusLabel(status: string): string {
  return PROGRAM_STATUS_LABEL[status as ProgramStatus] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

// Postponed and Cancelled programs stay visible to students (with a badge) but
// are left out of the "latest programs" lists.
export function isOffSchedule(status: string): boolean {
  return status === 'postponed' || status === 'cancelled';
}

// Ongoing first (happening right now is the most relevant to a student), then
// upcoming, then postponed, then completed, cancelled last; each group in date order.
function statusRank(status: ProgramStatus): number {
  switch (status) {
    case 'ongoing':
      return 0;
    case 'upcoming':
      return 1;
    case 'postponed':
      return 2;
    case 'completed':
      return 3;
    default:
      return 4; // cancelled
  }
}

export function compareProgramsForDisplay(a: ProgramStatusFields, b: ProgramStatusFields): number {
  const rankA = statusRank(getEffectiveProgramStatus(a));
  const rankB = statusRank(getEffectiveProgramStatus(b));
  if (rankA !== rankB) return rankA - rankB;
  return (a.date || '').localeCompare(b.date || '');
}

// Badge colours for the public and student pages (the admin list has its own).
export function programBadgeClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-[#E2E8F0] text-[#1E293B]';
    case 'postponed':
      return 'bg-[#FFEDD5] text-[#9A3412]';
    case 'cancelled':
      return 'bg-[#FFE4E6] text-[#9F1239]';
    default:
      return 'bg-[#FBBF24] text-[#1E1B4B]';
  }
}
