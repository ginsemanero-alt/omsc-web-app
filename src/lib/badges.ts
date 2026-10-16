import { supabase } from './supabase';
import { PASS_THRESHOLD_PCT } from './assessment';

// Achievement badges (PHASE 34). Display only: derived on the server by
// my_badges() from the student's own pre/post submissions and material
// views, never stored and never used in analytics.
//
// Badges reward taking part and finishing, never score gain: a gain badge
// would reward a deliberately low pre-test and corrupt the Learning Gain
// data. "Knowledge Check Passed" looks only at the post-test score.

export type BadgeId =
  | 'first_step'
  | 'explorer'
  | 'program_complete'
  | 'knowledge_check_passed'
  | 'committed_learner';

// participation = amber, completion = green.
export type BadgeKind = 'participation' | 'completion';

export interface BadgeDefinition {
  id: BadgeId;
  title: string;
  description: string;
  howToEarn: string;
  kind: BadgeKind;
  // What the progress numbers count, e.g. "programs" in "2 of 3 programs".
  unit?: string;
}

// In the order they are shown.
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first_step',
    title: 'First Step',
    description: 'You took a pre-test.',
    howToEarn: "Take a program's pre-test.",
    kind: 'participation',
  },
  {
    id: 'explorer',
    title: 'Explorer',
    description: 'You opened every IEC material of a program.',
    howToEarn: 'Open every IEC material linked to a program.',
    kind: 'participation',
  },
  {
    id: 'program_complete',
    title: 'Program Complete',
    description: 'You finished the pre-test, all the materials and the post-test of a program.',
    howToEarn: "Finish a program's pre-test, all of its materials, and its post-test.",
    kind: 'completion',
  },
  {
    id: 'knowledge_check_passed',
    title: 'Awareness Check Passed',
    description: `You scored ${PASS_THRESHOLD_PCT}% or higher on a post-test.`,
    howToEarn: `Score ${PASS_THRESHOLD_PCT}% or higher on a post-test.`,
    kind: 'completion',
  },
  {
    id: 'committed_learner',
    title: 'Committed Learner',
    description: 'You completed 3 programs.',
    howToEarn: 'Complete 3 programs.',
    kind: 'completion',
    unit: 'programs',
  },
];

export interface BadgeStatus {
  id: BadgeId;
  earned: boolean;
  earned_at: string | null;
  progress: { current: number; target: number };
}

export interface BadgesPayload {
  pass_threshold_pct: number;
  badges: BadgeStatus[];
}

export async function fetchMyBadges(): Promise<BadgesPayload> {
  const { data, error } = await supabase.rpc('my_badges');
  if (error) throw error;
  return data as BadgesPayload;
}
