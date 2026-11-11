// The Analytics dashboard's shared filters: their shape, how they live in the
// URL (so a filtered view survives a reload and can be shared with another
// admin), the "Filters:" line every export prints, and the one small-group rule.
//
// PWD / IP are ONLY ever used here to narrow an aggregate. Nothing in this
// file (or anything built on it) lists, names, or identifies a student.

export const ALL = 'all';

export interface AnalyticsFilters {
  campus: string;
  course: string; // the student's degree program (e.g. Midwifery)
  yearLevel: string;
  gender: string;
  age: string;
  academicYear: string;
  program: string; // a GUIDANCE program id (e.g. Suicide Prevention), or "all"
  pwd: 'all' | 'pwd' | 'not';
  ip: 'all' | 'ip' | 'not';
}

export const DEFAULT_FILTERS: AnalyticsFilters = {
  campus: ALL,
  course: ALL,
  yearLevel: ALL,
  gender: ALL,
  age: ALL,
  academicYear: ALL,
  program: ALL,
  pwd: ALL,
  ip: ALL,
};

// URL parameter of each filter.
const PARAM: Record<keyof AnalyticsFilters, string> = {
  campus: 'campus',
  course: 'course',
  yearLevel: 'year',
  gender: 'gender',
  age: 'age',
  academicYear: 'ay',
  program: 'program',
  pwd: 'pwd',
  ip: 'ip',
};

export const FILTER_KEYS = Object.keys(PARAM) as (keyof AnalyticsFilters)[];

export function filtersFromParams(params: URLSearchParams): AnalyticsFilters {
  const read = (key: keyof AnalyticsFilters) => params.get(PARAM[key]) || ALL;
  const pwd = read('pwd');
  const ip = read('ip');
  const program = read('program');
  return {
    campus: read('campus'),
    course: read('course'),
    yearLevel: read('yearLevel'),
    gender: read('gender'),
    age: read('age'),
    academicYear: read('academicYear'),
    // A program is a numeric id; anything else means "all".
    program: /^\d+$/.test(program) ? program : ALL,
    pwd: pwd === 'pwd' || pwd === 'not' ? pwd : ALL,
    ip: ip === 'ip' || ip === 'not' ? ip : ALL,
  };
}

// Writes the filters into `base` (other parameters, such as ?tab=, are kept);
// a filter that is "all" is not written, so an unfiltered page has a clean URL.
export function filtersToParams(filters: AnalyticsFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (!value || value === ALL) next.delete(PARAM[key]);
    else next.set(PARAM[key], value);
  }
  return next;
}

export const hasActiveFilters = (filters: AnalyticsFilters) => FILTER_KEYS.some((key) => filters[key] !== ALL);

// ----- Age bands: the ONE definition ------------------------------------
//
// Every place that groups or filters by age is derived from AGE_BANDS: the demographic breakdown, the Age
// filter, Learning gain (its p_age_brackets, see AGE_BRACKETS in learningGain.ts), Material reach, and the
// PDF and Excel exports. Change the bands here only. min / max are inclusive; null = open-ended.
// A missing age is "Not specified". Nobody falls outside the bands.
export const AGE_NOT_SPECIFIED = 'Not specified';

export const AGE_BANDS: { label: string; min: number | null; max: number | null }[] = [
  { label: '19 and below', min: null, max: 19 },
  { label: '20–22', min: 20, max: 22 },
  { label: '23 and above', min: 23, max: null },
];

// The band a student's age belongs to, or "Not specified" when the age is missing or not a number.
export function ageBandOf(age: unknown): string {
  if (age === null || age === undefined || age === '') return AGE_NOT_SPECIFIED;
  const n = Number(age);
  if (!Number.isFinite(n)) return AGE_NOT_SPECIFIED;
  const band = AGE_BANDS.find((b) => (b.min === null || n >= b.min) && (b.max === null || n <= b.max));
  return band ? band.label : AGE_NOT_SPECIFIED;
}

// The same bands as min/max ages, keyed by label (for the Age filter's RPC parameters).
export const AGE_GROUP_RANGES: Record<string, { min: number | null; max: number | null }> = Object.fromEntries(
  AGE_BANDS.map((b) => [b.label, { min: b.min, max: b.max }])
);

// ----- What the exports print -------------------------------------------

export const PARTICIPANTS_DEFINITION =
  "Participants = students who answered this program's awareness check.";

const LABEL: Record<keyof AnalyticsFilters, string> = {
  program: 'Program',
  campus: 'Campus',
  course: 'Course',
  yearLevel: 'Year level',
  gender: 'Gender',
  age: 'Age',
  academicYear: 'Academic year',
  pwd: 'PWD status',
  ip: 'IP status',
};

const PRINT_ORDER: (keyof AnalyticsFilters)[] = ['program', 'campus', 'course', 'yearLevel', 'gender', 'age', 'academicYear', 'pwd', 'ip'];

export function filterValueText(key: keyof AnalyticsFilters, value: string, programName?: string): string {
  if (key === 'program') return programName || `Program ${value}`;
  if (key === 'pwd') return value === 'pwd' ? 'PWD' : 'Not PWD';
  if (key === 'ip') return value === 'ip' ? 'IP' : 'Not IP';
  return value;
}

// "Filters: Program = Suicide Prevention; PWD status = PWD; all other filters = All"
export function describeFilters(filters: AnalyticsFilters, programName?: string): string {
  const active = PRINT_ORDER.filter((key) => filters[key] !== ALL);
  if (active.length === 0) return 'Filters: none (all filters = All)';
  const parts = active.map((key) => `${LABEL[key]} = ${filterValueText(key, filters[key], programName)}`);
  if (active.length < PRINT_ORDER.length) parts.push('all other filters = All');
  return `Filters: ${parts.join('; ')}`;
}

// ----- The small-group note ----------------------------------------------
//
// Nothing is withheld any more (PHASE 57). A group of 1 to 4 students shows its
// real numbers, with "n = X — small group, interpret with caution" next to it.
// This applies on the page, in the PDF and in the Excel export. The learning-gain
// SQL no longer hides scores either (v_min_group = 1 in PHASE 57).
//
// The AI insight is the one exception, on purpose: its own guard still refuses to
// send a filtered group of fewer than MIN_GROUP_SIZE students to the external AI
// service (see handleGenerateInsight).

export const MIN_GROUP_SIZE = 5;
export const isSmallGroup = (students: number) => students > 0 && students < MIN_GROUP_SIZE;
export const smallGroupNote = (students: number) => `n = ${students} — small group, interpret with caution`;
// "Label (n = 3 — small group, interpret with caution)" when the group is small, the label alone otherwise.
export const withSmallGroupNote = (label: string, students: number) =>
  isSmallGroup(students) ? `${label} (${smallGroupNote(students)})` : label;
// Page 1 of an export and the Analytics page, when the filters match nobody.
export const NO_MATCH_TEXT =
  'No students match the selected filters (0 students). Remove some filters and export again.';
