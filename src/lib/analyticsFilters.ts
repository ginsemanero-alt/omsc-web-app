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

// The dashboard's age groups (AnalyticsDashboard getAgeGroup) as min/max ages.
export const AGE_GROUP_RANGES: Record<string, { min: number | null; max: number | null }> = {
  'Below 18': { min: null, max: 17 },
  '18–20': { min: 18, max: 20 },
  '21–22': { min: 21, max: 22 },
  '23–24': { min: 23, max: 24 },
  '25–26': { min: 25, max: 26 },
  '27+': { min: 27, max: null },
};

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

// ----- The small-group rule ---------------------------------------------
//
// A group of 1 to 4 students never has its scores shown (page, exports, and
// the AI insight); the counts stay visible. The learning-gain SQL applies the
// same rule (v_min_group in PHASE 41), so those scores never leave the database.

export const MIN_GROUP_SIZE = 5;
export const TOO_FEW_TEXT = `Too few to report (n < ${MIN_GROUP_SIZE})`;
export const isTooFew = (students: number) => students > 0 && students < MIN_GROUP_SIZE;
