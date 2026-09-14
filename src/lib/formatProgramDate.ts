// A program/activity can have a free-text `date_display` (e.g. "February
// 18-19, 2026") for events that don't fit a single-date picker. When set,
// it's printed verbatim instead of the real `date` column — which stays a
// plain date for sorting and the upcoming/completed comparison regardless.
export function formatProgramDate(
  program: { date: string; date_display?: string | null },
  formatFallback: (date: string) => string = (date) => date
): string {
  const display = program.date_display?.trim();
  if (display) return display;
  return formatFallback(program.date);
}
