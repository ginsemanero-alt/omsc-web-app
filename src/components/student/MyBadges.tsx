import { useCallback, useEffect, useState } from 'react';
import { Award, BadgeCheck, Compass, Footprints, Loader2, Lock, Medal, type LucideIcon } from 'lucide-react';
import {
  BADGE_DEFINITIONS,
  fetchMyBadges,
  type BadgeId,
  type BadgeStatus,
} from '../../lib/badges';

// "My badges" on the student dashboard (PHASE 34). Display only, for the
// student alone: no ranking, nothing about other students.

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

export default function MyBadges() {
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

  return (
    <section
      aria-labelledby="badges-heading"
      className="mt-6 rounded-[40px] lg:rounded-[3.5rem] bg-white dark:bg-slate-900 p-6 sm:p-8 lg:p-10 flex flex-col gap-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h2
            id="badges-heading"
            className="m-0 font-bricolage font-extrabold text-2xl lg:text-[30px] tracking-[-0.02em] text-[#1E1B4B] dark:text-white"
          >
            My badges
          </h2>
          <p className="m-0 text-sm sm:text-[15px] text-[#5B6477] dark:text-slate-400">
            Badges celebrate taking part and finishing programs. They are only for you: there is no ranking.
          </p>
        </div>
        {statuses && (
          <span className="shrink-0 px-3.5 py-2 rounded-full bg-[#EEF0FA] dark:bg-slate-800 font-bold text-sm text-[#1E1B4B] dark:text-slate-100">
            {earnedCount} of {BADGE_DEFINITIONS.length} earned
          </span>
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
        <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {BADGE_DEFINITIONS.map((definition) => {
            const status = statusFor(definition.id);
            const earned = !!status?.earned;
            const Icon = ICONS[definition.id];
            const completion = definition.kind === 'completion';
            const progress = status?.progress;

            return (
              <li
                key={definition.id}
                className={`rounded-[28px] p-5 flex gap-4 items-start ${
                  earned
                    ? completion
                      ? 'bg-[#D1FAE5] dark:bg-emerald-500/15'
                      : 'bg-[#FEF3C7] dark:bg-amber-500/15'
                    : 'bg-[#F1F2F9] dark:bg-slate-800'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative w-14 h-14 shrink-0 rounded-full flex items-center justify-center ${
                    earned
                      ? completion
                        ? 'bg-[#34D399] text-[#064E3B]'
                        : 'bg-[#FBBF24] text-[#1E1B4B]'
                      : 'bg-[#DDE1EE] dark:bg-slate-700 text-[#8A91A6] dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-7 h-7" />
                  {!earned && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5 text-[#5B6477] dark:text-slate-400" />
                    </span>
                  )}
                </span>

                <div className="flex flex-col gap-1 min-w-0">
                  <h3
                    className={`m-0 font-bold text-base leading-snug ${
                      earned
                        ? completion
                          ? 'text-[#065F46] dark:text-emerald-200'
                          : 'text-[#92400E] dark:text-amber-200'
                        : 'text-[#5B6477] dark:text-slate-300'
                    }`}
                  >
                    {definition.title}
                  </h3>

                  <p className="m-0 text-[13px] leading-normal text-[#334155] dark:text-slate-300">
                    {earned ? definition.description : definition.howToEarn}
                  </p>

                  <p className="m-0 text-xs font-bold uppercase tracking-wider text-[#5B6477] dark:text-slate-400">
                    {earned ? (
                      <>
                        Earned{earnedDate(status?.earned_at ?? null) ? ` ${earnedDate(status?.earned_at ?? null)}` : ''}
                      </>
                    ) : (
                      <>
                        Locked
                        {progress && progress.target > 1 && (
                          <span className="normal-case tracking-normal font-semibold">
                            {' '}
                            · {progress.current} of {progress.target} {definition.unit ?? ''}
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
