// `status` (upcoming/ongoing/completed) is a manual dropdown the admin sets
// — nobody reliably comes back to flip it to "completed" the moment an
// event's own end time passes. This derives what should actually be shown,
// without ever writing back to the DB: once `completed` is set explicitly
// it's final, otherwise the program's own date + end time decides.
export interface ProgramStatusFields {
  date: string;
  time_range?: string | null;
  status: string;
  date_display?: string | null;
}

function getProgramEndDateTime(program: ProgramStatusFields): Date | null {
  if (!program.date) return null;
  const [year, month, day] = program.date.split('-').map(Number);
  if (!year || !month || !day) return null;

  // time_range is stored as "8:00 AM - 5:00 PM" (see ProgramManager's
  // formatTo12h) — take the end half. Built with new Date(y, m, d, h, min)
  // (all local-time arguments) rather than string-parsing a combined
  // "YYYY-MM-DDTHH:mm" — that form is parsed as UTC by some engines, which
  // would shift the cutoff by a timezone offset.
  const endTimeStr = program.time_range?.split(' - ')[1]?.trim();
  const match = endTimeStr?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return new Date(year, month - 1, day, 23, 59, 59);
  }

  const [, hourStr, minuteStr, ampm] = match;
  let hour = parseInt(hourStr, 10) % 12;
  if (ampm.toUpperCase() === 'PM') hour += 12;
  const minute = parseInt(minuteStr, 10);
  return new Date(year, month - 1, day, hour, minute, 0);
}

export function getEffectiveProgramStatus(program: ProgramStatusFields): string {
  if (program.status === 'completed') return 'completed';

  // `date` is a single day, but date_display exists specifically for events
  // that don't fit one — a multi-day range typed as free text ("09/01/2026
  // – 09/30/2026"). When it's set, `date` is only the start day, so timing
  // the cutoff off it would mark the whole event "completed" the moment day
  // one ends. There's no reliable way to parse an end date back out of
  // arbitrary display text, so defer to the admin's manual status instead.
  if (program.date_display?.trim()) return program.status;

  const endDateTime = getProgramEndDateTime(program);
  if (endDateTime && endDateTime.getTime() < Date.now()) return 'completed';
  return program.status;
}

// Not-completed first (soonest date first), completed pushed to the end —
// each group still ordered chronologically by date.
export function compareProgramsForDisplay(a: ProgramStatusFields, b: ProgramStatusFields): number {
  const aCompleted = getEffectiveProgramStatus(a) === 'completed';
  const bCompleted = getEffectiveProgramStatus(b) === 'completed';
  if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
  return (a.date || '').localeCompare(b.date || '');
}
