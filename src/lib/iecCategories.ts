// Shared between MaterialLibrary.tsx (materials.category) and
// SurveyBuilder.tsx (surveys.iec_category) — the two lists used to be
// defined separately and could drift apart, which is exactly what made
// it impossible to tie a survey to the materials covering the same
// topic. See the PHASE 13 migration note in supabase/migrations.sql.
export const IEC_CATEGORIES = [
  'Guidance Services',
  'Academic Development',
  'Career Development',
  'Personal & Social Development',
  'Mental Health & Wellness',
  'Psychological Testing & Assessment',
  'Safe & Positive Learning Environment',
  'Student Programs & Resources',
] as const;
