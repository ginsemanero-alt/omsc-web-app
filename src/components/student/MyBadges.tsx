import { useCallback, useEffect, useState } from 'react';
import { Award, BadgeCheck, Check, Compass, Footprints, Loader2, Lock, Medal, type LucideIcon } from 'lucide-react';
import {
  BADGE_DEFINITIONS,
  fetchMyBadges,
  type BadgeDefinition,
  type BadgeId,
  type BadgeStatus,
} from '../../lib/badges';

// "My badges" on the student dashboard (PHASE 34). Display only, for the
// student alone: no ranking, nothing about other students.
//
// Layout: xl five cards in one row (icon on top, title, description, status
// chip at the bottom); md two columns; below md one column of horizontal
// cards (icon on the left). The first locked badge is marked "Next up".

const ICONS: Record<BadgeId, LucideIcon> = {
  first_step: Footprints,
  explorer: Compass,
  program_complete: Award,
  knowledge_check_passed: BadgeCheck,
  committed_learner: Medal,
};

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

const earnedDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

type Tone = 'amber' | 'green' | 'next' | 'locked';

const CARD: Record<Tone, string> = {
  amber: 'bg-[#FDF3D8] dark:bg-amber-500/15',
  green: 'bg-[#DDF6E8] dark:bg-emerald-500/15',
  next: 'bg-white dark:bg-slate-900 border-2 border-[#4F46E5] dark:border-indigo-400',
  locked: 'bg-[#F3F4FA] dark:bg-slate-800',
};

const ICON: Record<Tone, string> = {
  amber: 'bg-gradient-to-b from-[#FCD34D] to-[#F59E0B] text-[#1E1B4B] ring-8 ring-[#FBBF24]/25',
  green: 'bg-gradient-to-b from-[#6EE7B7] to-[#10B981] text-[#064E3B] ring-8 ring-[#34D399]/25',
  next: 'bg-[#E0E7FF] dark:bg-indigo-500/20 text-[#4F46E5] dark:text-indigo-300',
  locked: 'bg-[#E3E5EE] dark:bg-slate-700 text-[#8A91A6] dark:text-slate-400',
};

const TITLE: Record<Tone, string> = {
  amber: 'text-[#1E1B4B] dark:text-amber-100',
  green: 'text-[#1E1B4B] dark:text-emerald-100',
  next: 'text-[#1E1B4B] dark:text-white',
  locked: 'text-[#1E1B4B] dark:text-slate-200',
};

export default function MyBadges({ programSteps = null }: { programSteps?: number | null }) {
  const [statuses, setStatuses] = useState<BadgeStatus[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const payload = await fetchMyBadges();
      setStatuses(payload.badges || []);
    } catch (error) {
      console.warn('Unable to load badges:', error);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusFor = (id: BadgeId) => statuses?.find((s) => s.id === id);
  const earnedCount = BADGE_DEFINITIONS.filter((d) => statusFor(d.id)?.earned).length;
  const percent = Math.round((earnedCount / BADGE_DEFINITIONS.length) * 100);
  const nextUpId = statuses ? BADGE_DEFINITIONS.find((d) => !statusFor(d.id)?.earned)?.id : undefined;

  const toneOf = (definition: BadgeDefinition): Tone => {
    if (statusFor(definition.id)?.earned) return definition.kind === 'completion' ? 'green' : 'amber';
    return definition.id === nextUpId ? 'next' : 'locked';
  };

  return (
    <section
      aria-labelledby="badges-heading"
      className="mt-6 rounded-[40px] lg:rounded-[3.5rem] bg-white dark:bg-slate-900 p-6 sm:p-8 lg:p-10 flex flex-col gap-6 lg:gap-8"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-8">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h2
            id="badges-heading"
            className="m-0 font-bricolage font-extrabold text-[32px] lg:text-[34px] leading-tight tracking-[-0.02em] text-[#1E1B4B] dark:text-white"
          >
            My badges
          </h2>
          <p className="m-0 text-sm sm:text-[15px] text-[#5B6477] dark:text-slate-400">
            Badges celebrate taking part and finishing programs. Only you can see them, and there is no ranking.
          </p>
        </div>

        {statuses && (
          <div className="flex flex-col gap-2 w-full lg:w-[260px] shrink-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-bold text-[#1E1B4B] dark:text-white">
                {earnedCount} of {BADGE_DEFINITIONS.length} earned
              </span>
              <span className="text-[#5B6477] dark:text-slate-400">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Badges earned"
              aria-valuemin={0}
              aria-valuemax={BADGE_DEFINITIONS.length}
              aria-valuenow={earnedCount}
              className="h-2 rounded-full bg-[#DDE1F4] dark:bg-slate-700 overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#4F46E5] to-[#7C73F0] motion-safe:transition-[width] motion-safe:duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {failed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="m-0 text-sm font-semibold text-[#5B6477] dark:text-slate-400">
            Couldn't load your badges.
          </p>
          <button
            type="button"
            onClick={load}
            className={`min-h-[44px] px-5 rounded-2xl bg-[#EEF0FA] dark:bg-slate-800 text-[#1E1B4B] dark:text-slate-100 font-bold text-sm hover:bg-[#E0E7FF] dark:hover:bg-slate-700 ${focusRing}`}
          >
            Try again
          </button>
        </div>
      ) : !statuses ? (
        <p role="status" className="m-0 flex items-center gap-2 text-sm text-[#5B6477] dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your badges...
        </p>
      ) : (
        <ul className="m-0 p-0 list-none grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {BADGE_DEFINITIONS.map((definition) => {
            const status = statusFor(definition.id);
            const earned = !!status?.earned;
            const tone = toneOf(definition);
            const isNext = tone === 'next';
            const Icon = ICONS[definition.id];
            const progress = status?.progress;
            const date = earnedDate(status?.earned_at ?? null);

            // The line under a locked badge's chip.
            let progressLine: string | null = null;
            if (!earned) {
              if (definition.id === 'program_complete' && isNext && programSteps !== null) {
                progressLine = `${programSteps} of 3 steps done`;
              } else if (progress && progress.target > 1) {
                progressLine = `${progress.current} of ${progress.target} ${definition.unit ?? ''}`.trim();
              }
            }

            return (
              <li
                key={definition.id}
                aria-current={isNext ? 'step' : undefined}
                className={`relative rounded-[28px] p-5 flex gap-4 md:flex-col md:gap-3.5 ${CARD[tone]}`}
              >
                {isNext && (
                  <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-[#4F46E5] text-white text-xs font-bold">
                    Next up
                  </span>
                )}

                <span
                  aria-hidden="true"
                  className={`relative w-[60px] h-[60px] md:w-[72px] md:h-[72px] shrink-0 rounded-full flex items-center justify-center ${ICON[tone]}`}
                >
                  <Icon className="w-7 h-7 md:w-8 md:h-8" />
                  <span
                    className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900 ${
                      earned
                        ? 'bg-[#10B981] text-white'
                        : isNext
                          ? 'bg-[#4F46E5] text-white'
                          : 'bg-white dark:bg-slate-900 text-[#5B6477] dark:text-slate-400'
                    }`}
                  >
                    {earned ? <Check className="w-4 h-4" strokeWidth={3} /> : <Lock className="w-3.5 h-3.5" />}
                  </span>
                </span>

                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <h3
                    className={`m-0 font-bricolage font-extrabold text-lg leading-tight tracking-[-0.01em] ${TITLE[tone]} ${
                      isNext ? 'pr-16 md:pr-0' : ''
                    }`}
                  >
                    {definition.title}
                  </h3>

                  <p className="m-0 text-sm leading-normal text-[#5B6477] dark:text-slate-300">
                    {earned ? definition.description : definition.howToEarn}
                  </p>

                  <div className="mt-auto pt-3 flex flex-col gap-1.5 items-start">
                    {earned ? (
                      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 py-1.5 rounded-full bg-[#CFF5E1] dark:bg-emerald-500/20 text-[#065F46] dark:text-emerald-200 text-xs font-bold">
                        <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
                        Earned
                        {date && <span className="font-semibold whitespace-nowrap">{date}</span>}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                          isNext
                            ? 'bg-[#E0E7FF] dark:bg-indigo-500/20 text-[#3730A3] dark:text-indigo-200'
                            : 'bg-[#E3E5EE] dark:bg-slate-700 text-[#5B6477] dark:text-slate-300'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        Locked
                      </span>
                    )}
                    {progressLine && (
                      <span className="text-xs font-semibold text-[#5B6477] dark:text-slate-400">{progressLine}</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
