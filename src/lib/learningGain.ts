import { ALL, AGE_BANDS, AGE_GROUP_RANGES, MIN_GROUP_SIZE, type AnalyticsFilters } from './analyticsFilters';

// Learning Gain (pre-test vs post-test) — shared constants and the
// statistics the Analytics Dashboard's Learning Gain section needs.
// The heavy aggregation (pairing, means, SD of differences) happens in
// SQL — see learning_gain_summary() in supabase/migrations.sql
// (PHASE 23). This file only turns those per-group aggregates into a
// normalized-gain label and a paired-samples t-test.

// Age brackets for every Learning Gain breakdown and filter, derived from AGE_BANDS (analyticsFilters.ts),
// the one definition of the age bands. This list is sent to learning_gain_summary() as p_age_brackets, so
// the SQL grouping follows automatically. The SQL needs a number for min, so the open-ended bottom band
// starts at 0: nobody lands in "Outside brackets". max: null = open-ended ("and above").
export const AGE_BRACKETS: { label: string; min: number; max: number | null }[] = AGE_BANDS.map((band) => ({
  label: band.label,
  min: band.min ?? 0,
  max: band.max,
}));

// Fewer paired students than this and the group is flagged "small group,
// interpret with caution". The scores are still shown (PHASE 57). Same number as
// MIN_GROUP_SIZE in analyticsFilters.ts.
export const SMALL_SAMPLE_N = MIN_GROUP_SIZE;

// Below this, the t-test result carries a caution: the paired t-test
// assumes the differences are roughly normal, which small samples
// can't show.
export const T_TEST_CAUTION_N = 30;

export const SIGNIFICANCE_ALPHA = 0.05;

export type LearningGainDimension =
  | 'program'
  | 'course'
  | 'gender'
  | 'age_bracket'
  | 'year_level'
  | 'pwd'
  | 'ip'
  | 'overall';

export interface LearningGainRow {
  dimension: LearningGainDimension;
  key: string;
  paired_n: number;
  incomplete_n: number;
  ceiling_n: number;
  // Opened one of the program's linked IEC materials at or before the
  // pre-test: left out of every other count and mean (PHASE 31).
  viewed_before_pre_n: number;
  mean_pre: number | null;
  mean_post: number | null;
  mean_gain: number | null;
  sd_diff: number | null;
  norm_gain: number | null;
  // Kept for the older SQL (PHASE 41), which withheld the scores of 1 to 4 paired
  // students (null above). After PHASE 57 it is always false.
  suppressed: boolean;
}

export interface LearningGainOptions {
  programs: { id: number; title: string }[];
  courses: string[];
  year_levels: string[];
  genders: string[];
  years: number[];
}

export interface LearningGainSummary {
  rows: LearningGainRow[];
  options: LearningGainOptions;
}

export function emptyRow(dimension: LearningGainDimension, key: string): LearningGainRow {
  return {
    dimension,
    key,
    paired_n: 0,
    incomplete_n: 0,
    ceiling_n: 0,
    viewed_before_pre_n: 0,
    mean_pre: null,
    mean_post: null,
    mean_gain: null,
    sd_diff: null,
    norm_gain: null,
    suppressed: false,
  };
}

// Hake (1998) bands for the class-average normalized gain <g>.
export function normalizedGainLevel(g: number | null): 'High' | 'Medium' | 'Low' | null {
  if (g === null || Number.isNaN(g)) return null;
  if (g >= 0.7) return 'High';
  if (g >= 0.3) return 'Medium';
  return 'Low';
}

export interface PairedTTest {
  t: number;
  df: number;
  p: number;
  significant: boolean;
}

// Paired-samples t-test from the aggregates: t = d̄ / (s_d / √n),
// df = n − 1, two-tailed p. Null when it can't be computed: fewer than
// 2 pairs, or every student gained exactly the same amount (s_d = 0).
export function pairedTTest(
  n: number,
  meanGain: number | null,
  sdDiff: number | null
): PairedTTest | null {
  if (n < 2 || meanGain === null || sdDiff === null || sdDiff === 0) return null;

  const df = n - 1;
  const t = meanGain / (sdDiff / Math.sqrt(n));
  const p = twoTailedTP(t, df);

  return { t, df, p, significant: p < SIGNIFICANCE_ALPHA };
}

// Two-tailed p-value of Student's t: p = I_x(df/2, 1/2), x = df/(df+t²),
// where I is the regularized incomplete beta function.
function twoTailedTP(t: number, df: number): number {
  const x = df / (df + t * t);
  return Math.min(1, Math.max(0, regularizedIncompleteBeta(x, df / 2, 0.5)));
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnFront =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lnFront);

  // The continued fraction converges fast only for x < (a+1)/(a+b+2);
  // use the symmetry I_x(a,b) = 1 − I_{1−x}(b,a) otherwise.
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

// Lentz's method for the incomplete beta continued fraction.
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITERATIONS = 300;
  const EPSILON = 1e-14;
  const TINY = 1e-300;

  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;

    let numerator = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    result *= d * c;

    numerator = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    result *= delta;

    if (Math.abs(delta - 1) < EPSILON) break;
  }

  return result;
}

// Lanczos approximation of ln Γ(z).
function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  const shifted = z - 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i++) {
    sum += coefficients[i] / (shifted + i + 1);
  }
  const t = shifted + coefficients.length - 0.5;

  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

export function formatPValue(p: number): string {
  return p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0/, '');
}

const YEAR_LEVEL_LABELS: Record<string, string> = {
  '1': '1st Year',
  '2': '2nd Year',
  '3': '3rd Year',
  '4': '4th Year',
  '5': '5th Year',
};

export function yearLevelLabel(value: string): string {
  return YEAR_LEVEL_LABELS[value] || value;
}

// The parameters learning_gain_summary() takes, built from the dashboard's
// shared filter bar (PHASE 41). Year levels are stored as "1".."5" in profiles
// while the bar shows "1st Year"..., so the label is mapped back.
const YEAR_LABEL_TO_RAW: Record<string, string> = {
  '1st Year': '1',
  '2nd Year': '2',
  '3rd Year': '3',
  '4th Year': '4',
  '5th Year': '5',
  'Not Specified': 'Not specified',
};

export function buildLearningGainParams(filters: AnalyticsFilters) {
  const orNull = (value: string) => (value === ALL ? null : value);
  const range = AGE_GROUP_RANGES[filters.age];
  const year = Number(filters.academicYear);
  return {
    p_program_id: filters.program === ALL ? null : Number(filters.program),
    p_campus: orNull(filters.campus),
    p_course: orNull(filters.course),
    p_year_level: filters.yearLevel === ALL ? null : YEAR_LABEL_TO_RAW[filters.yearLevel] || filters.yearLevel,
    p_gender: orNull(filters.gender),
    p_age_min: range ? range.min : null,
    p_age_max: range ? range.max : null,
    p_academic_year: filters.academicYear !== ALL && Number.isFinite(year) ? year : null,
    p_pwd: filters.pwd === 'pwd' ? true : filters.pwd === 'not' ? false : null,
    p_ip: filters.ip === 'ip' ? true : filters.ip === 'not' ? false : null,
    p_age_brackets: AGE_BRACKETS,
  };
}
