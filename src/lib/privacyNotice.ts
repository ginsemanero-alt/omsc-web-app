// The Data Privacy Notice (RA 10173) — one source for every place it is
// shown: the registration consent step, the /privacy page, the Privacy
// Notice modal, the consent screen for existing accounts, and the notice
// bar. Edit the text here only.
//
// PRIVACY_NOTICE_VERSION: bump it whenever the notice changes in a way
// students should agree to again. Every student is then shown the consent
// screen once more, and the notice bar reappears for visitors. Keep it in
// step with CURRENT_CONSENT_VERSION in api/index.js (format "YYYY-MM").
export const PRIVACY_NOTICE_VERSION = '2026-10';

export const GUIDANCE_OFFICE_EMAIL = 'guidance@omsc.edu.ph';

// ---------------------------------------------------------------------
// Waiting for the Guidance and Testing Center. Replace each placeholder
// with the confirmed value; nothing else needs to change. Do not deploy
// the notice to students while any of these is still a placeholder.
// ---------------------------------------------------------------------
const TO_CONFIRM = '[To be confirmed by the Guidance and Testing Center]';

// TODO: confirm with Guidance Center — how long records are kept, e.g.
// "for as long as you are enrolled, then for X years".
export const RETENTION_PERIOD = TO_CONFIRM;

// TODO: confirm with Guidance Center — the University Data Protection Officer.
export const DPO_NAME = TO_CONFIRM;

// TODO: confirm with Guidance Center — the Data Protection Officer's email.
export const DPO_EMAIL = TO_CONFIRM;

// TODO: confirm with Guidance Center — what the Center requires when a
// student is under 18 (shown beside the age field at registration).
export const UNDER_18_POLICY = TO_CONFIRM;

const PLACEHOLDERS: Record<string, string> = { RETENTION_PERIOD, DPO_NAME, DPO_EMAIL, UNDER_18_POLICY };

export const isPlaceholder = (value: string) => value === TO_CONFIRM;

// Development only: say which values are still missing.
if (import.meta.env.DEV) {
  const missing = Object.entries(PLACEHOLDERS)
    .filter(([, value]) => isPlaceholder(value))
    .map(([name]) => name);
  if (missing.length > 0) {
    console.warn(
      `[privacyNotice] Still placeholders in src/lib/privacyNotice.ts: ${missing.join(', ')}. ` +
        'Get the values from the Guidance and Testing Center before deploying.'
    );
  }
}

export interface NoticeSection {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export const NOTICE_SECTIONS: NoticeSection[] = [
  {
    id: 'who',
    title: 'Who collects your data',
    paragraphs: [
      'The Guidance and Testing Center of Occidental Mindoro State University collects your personal information through this system.',
    ],
  },
  {
    id: 'what',
    title: 'What we collect',
    items: [
      'Your name, student ID and institutional email',
      'Your campus, program, year level, age and gender',
      'Whether you are a person with disability (PWD) and whether you belong to an Indigenous Peoples (IP) group',
      'Your answers and scores in the pre-tests, post-tests and surveys you take',
      'Which guidance programs and materials you open',
    ],
  },
  {
    id: 'why',
    title: 'Why we collect it',
    items: [
      'To give you access to guidance programs and materials',
      'To run the pre-test and post-test and to compute your results',
      'To produce combined statistics for the Guidance and Testing Center, so it can see which students its programs reach and whether they help',
    ],
  },
  {
    id: 'sensitive',
    title: 'PWD and IP status',
    paragraphs: [
      'PWD status and IP membership are required when you register. We ask so that the Guidance and Testing Center can see whether its programs reach PWD and IP students.',
      'Under RA 10173 (the Data Privacy Act of 2012), this is sensitive personal information. It is shown only as combined counts, never as a list of names and never next to your name.',
    ],
  },
  {
    id: 'who-sees',
    title: 'Who can see it',
    paragraphs: [
      'Only authorized Guidance personnel can see your records. Results and statistics are shown only in combined form.',
    ],
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    paragraphs: [`We keep your information ${RETENTION_PERIOD}.`],
  },
  {
    id: 'rights',
    title: 'Your rights under RA 10173',
    items: [
      'To be informed about how your data is collected and used',
      'To access the personal information we hold about you',
      'To correct it if it is wrong',
      'To object to its collection or use',
      'To have it erased',
    ],
    paragraphs: [
      'You may also file a complaint with the National Privacy Commission (privacy.gov.ph) if you believe your rights were violated.',
    ],
  },
  {
    id: 'accuracy',
    title: 'Accuracy and account security',
    paragraphs: [
      'Please give true and accurate information when you register. You are responsible for keeping your password secure.',
    ],
  },
  {
    id: 'contact',
    title: 'Who to contact',
    items: [
      `Guidance Office: ${GUIDANCE_OFFICE_EMAIL}`,
      `University Data Protection Officer: ${DPO_NAME}, ${DPO_EMAIL}`,
    ],
  },
];

// Wording of the one required checkbox, on both consent screens.
export const CONSENT_CHECKBOX_LABEL =
  'I have read the notice and I agree to the collection and use of my personal information as described.';

// Wording of the notice bar shown on the public pages.
export const NOTICE_BAR_TEXT =
  'This site collects only what it needs to give you access to guidance programs and to measure awareness.';
