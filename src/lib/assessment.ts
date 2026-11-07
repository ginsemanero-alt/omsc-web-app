// Shared rules and wording for knowledge-assessment results (PHASE 34).
import { plain, type Translate } from '../i18n/fill';

// The post-test percentage that counts as passed: shown green in the
// results and needed for the "Knowledge Check Passed" badge. The same
// number lives in pass_threshold_pct() in supabase/migrations.sql
// (my_badges() uses it): change both together.
export const PASS_THRESHOLD_PCT = 75;

export const isPassingPct = (percentage: number | null | undefined): boolean =>
  percentage !== null && percentage !== undefined && percentage >= PASS_THRESHOLD_PCT;

// Shown wherever a pre-test score appears. The pre-test form is never
// shown back to the student, so the post-test measures learning and not
// memory of the first form.
export const PRE_TEST_PRIVACY_NOTE =
  "Your pre-test answers stay private to protect the assessment. You'll see your score here.";

// Percentage of a score, rounded like the stored percentage.
export function percentFrom(score: number | null | undefined, total: number | null | undefined): number | null {
  if (score === null || score === undefined || !total) return null;
  return Math.round((score * 100) / total);
}

// The optional translator is passed by the student portal; everything else gets English.
export function formatPointChange(points: number, tr: Translate = plain): string {
  const signed = `${points > 0 ? '+' : ''}${points}`;
  return Math.abs(points) === 1 ? tr('{points} point', { points: signed }) : tr('{points} points', { points: signed });
}

// "Pre-test 60% → Post-test 85% (+25 points)"
export function formatComparison(
  prePct: number | null | undefined,
  postPct: number | null | undefined,
  tr: Translate = plain
): string | null {
  if (prePct === null || prePct === undefined || postPct === null || postPct === undefined) return null;
  return tr('Pre-test {pre}% → post-test {post}% ({change})', { pre: prePct, post: postPct, change: formatPointChange(postPct - prePct, tr) });
}
