// Messages that the DATABASE sends back to a student (RAISE EXCEPTION in the assessment
// functions) shown in the student's language.
//   - A known message is matched exactly (or by its one number), so nothing is guessed.
//   - A message we don't know is returned as it came, in English.
//   - One message is technical ("Answers must be an object keyed by question id."): it is
//     replaced by a friendly one in BOTH languages.
import { fill, type Translate } from './fill';

const FRIENDLY_SUBMIT_PROBLEM = 'There was a problem submitting your answers. Refresh the page and try again.';

// English text -> the same text as a Tagalog key (see tl.ts)
const KNOWN = new Set([
  'You have already submitted this assessment.',
  'This assessment is not open.',
  'Assessment not found.',
  'The review opens after you submit the post-test.',
  'Sign in with a student account.',
  'Sign in with a student account to take assessments.',
  'Sign in with a student account to submit.',
]);

const LOCK_PREFIX = /^Post-test locked:\s*/;
const VIEW_MORE = /^View (\d+) more materials? to unlock$/;
const LOCK_REASONS = new Set(['Materials for this program are coming soon.', "Couldn't check your materials. Refresh to try again."]);

export function translateServerMessage(message: string, tr: Translate, language: 'en' | 'tl'): string {
  const text = (message ?? '').trim();
  if (!text) return message;

  // friendly in both languages (in English tr() hands the English text back)
  if (text === 'Answers must be an object keyed by question id.') return tr(FRIENDLY_SUBMIT_PROBLEM);

  // English stays exactly as the server said it
  if (language !== 'tl') return message;

  if (KNOWN.has(text)) return tr(text);

  // "Post-test locked: <reason>", or the bare reason (the start function also returns it on its own)
  const reason = text.replace(LOCK_PREFIX, '');
  const viewMore = VIEW_MORE.exec(reason);
  if (viewMore) {
    // this Tagalog sentence already says "Naka-lock pa ang post-test: ..."
    return fill(tr('View {n} more materials to unlock', { n: viewMore[1] }), {});
  }
  if (LOCK_REASONS.has(reason)) {
    return LOCK_PREFIX.test(text) ? `${tr('Post-test locked:')} ${tr(reason)}` : tr(reason);
  }
  return message;
}
