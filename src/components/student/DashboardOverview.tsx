import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, Check, HeartHandshake, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { campusVisibilityFilter } from '../../lib/campuses';
import { YEAR_LEVELS, normalizeYearLevel } from '../../lib/programs';
import { useAuth } from '../../hooks/useAuth';

const PROGRAMS_PATH = '/student/programs';
const ASSESSMENT_PATH = '/student/survey';
const YOUR_PROGRAMS_LIMIT = 5;

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface ProgramRow {
  id: number;
  title: string;
  image_url: string | null;
  created_at: string | null;
}

interface KnowledgeSurveyRow {
  id: number;
  program_id: number;
  status: string | null;
  created_at: string | null;
}

interface ResponseRow {
  survey_id: number;
  attempt_type: 'pre' | 'post' | null;
  score: number | null;
  total_scored: number | null;
  created_at: string;
}

interface NotificationRow {
  id: number;
  title: string;
  message: string | null;
  action_path: string | null;
  created_at: string;
}

type ProgramStatus = 'in_progress' | 'not_taken' | 'coming_soon' | 'completed';

interface ProgramProgress {
  program: ProgramRow;
  status: ProgramStatus;
  surveyId: number | null;
  pre: ResponseRow | null;
  post: ResponseRow | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

// No academic-year setting exists in the database, so it's computed:
// a new academic year starts in August.
function academicYearLabel(today: Date = new Date()): string {
  const year = today.getFullYear();
  const start = today.getMonth() >= 7 ? year : year - 1;
  return `Academic year ${start} to ${start + 1}`;
}

// TODO: return { viewed, total } once program_materials and material_views
// exist (along with post-test gating). Until then there is no reliable
// per-program material count, so this returns null and the UI shows the
// generic "Read the materials" copy instead of "2 of 3 materials viewed".
function getMaterialProgress(_programId: number): { viewed: number; total: number } | null {
  return null;
}

function scoreText(response: ResponseRow | null): string {
  if (!response || response.score === null || response.score === undefined) return '—';
  return response.total_scored ? `${response.score}/${response.total_scored}` : String(response.score);
}

function improvementPoints(item: ProgramProgress): number | null {
  if (item.status !== 'completed' || !item.pre || !item.post) return null;
  if (item.pre.score === null || item.post.score === null) return null;
  return item.post.score - item.pre.score;
}

function formatPoints(points: number): string {
  const sign = points > 0 ? '+' : '';
  return `${sign}${points} ${Math.abs(points) === 1 ? 'point' : 'points'}`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function whenLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return shortDate(value);
}

// Sort order for "Your programs": work in progress first, done last.
const STATUS_ORDER: Record<ProgramStatus, number> = {
  in_progress: 0,
  not_taken: 1,
  coming_soon: 2,
  completed: 3,
};

const STATUS_STYLE: Record<
  ProgramStatus,
  { label: string; badge: string; bar: string; cta: string; primary: boolean }
> = {
  coming_soon: {
    label: 'Pre-test coming soon',
    badge: 'bg-[#F1F5F9] text-[#475569] dark:bg-slate-800 dark:text-slate-300',
    bar: 'bg-[#DDE1EE]',
    cta: 'View materials',
    primary: false,
  },
  not_taken: {
    label: 'Pre-test not taken',
    badge: 'bg-[#E0E7FF] text-[#3730A3] dark:bg-indigo-500/20 dark:text-indigo-200',
    bar: 'bg-[#DDE1EE]',
    cta: 'Take pre-test',
    primary: true,
  },
  in_progress: {
    label: 'Read the materials',
    badge: 'bg-[#FEF3C7] text-[#92400E] dark:bg-amber-500/20 dark:text-amber-200',
    bar: 'bg-[#FBBF24]',
    cta: 'Continue',
    primary: true,
  },
  completed: {
    label: 'Completed',
    badge: 'bg-[#D1FAE5] text-[#065F46] dark:bg-emerald-500/20 dark:text-emerald-200',
    bar: 'bg-[#34D399]',
    cta: 'See results',
    primary: false,
  },
};

function progressPercent(item: ProgramProgress): number {
  switch (item.status) {
    case 'completed':
      return 100;
    case 'in_progress': {
      // Pre-test done is one third of the way (pre-test, materials,
      // post-test); material views fill the middle third once tracked.
      const materials = getMaterialProgress(item.program.id);
      const materialShare = materials && materials.total > 0 ? materials.viewed / materials.total : 0;
      return Math.round(((1 + materialShare) / 3) * 100);
    }
    default:
      return 0;
  }
}

function detailText(item: ProgramProgress): string {
  switch (item.status) {
    case 'coming_soon':
      return 'Materials are open now';
    case 'not_taken':
      return 'Take the pre-test before you read the materials.';
    case 'in_progress': {
      const materials = getMaterialProgress(item.program.id);
      return materials
        ? `Pre-test done. ${materials.viewed} of ${materials.total} materials viewed.`
        : 'Pre-test done. Read the materials, then take the post-test.';
    }
    case 'completed':
      // Scores only ever appear here, once the post-test exists.
      return `Pre-test ${scoreText(item.pre)}, post-test ${scoreText(item.post)}`;
  }
}

// Where each program's button goes: straight into its assessment, to My
// results, or to the program itself (?program=<id>).
function ctaPath(item: ProgramProgress): string {
  if (item.status === 'not_taken' && item.surveyId != null) return `${ASSESSMENT_PATH}?survey=${item.surveyId}`;
  if (item.status === 'completed') return `${ASSESSMENT_PATH}?view=results`;
  return `${PROGRAMS_PATH}?program=${item.program.id}`;
}

// Works out each program's status from the student's own responses. A
// program's assessment is the knowledge survey the student has already
// answered (even if it has since been closed), otherwise its newest
// active one.
function buildProgress(
  programs: ProgramRow[],
  surveys: KnowledgeSurveyRow[],
  responses: ResponseRow[]
): ProgramProgress[] {
  const surveysByProgram = new Map<number, KnowledgeSurveyRow[]>();
  for (const survey of surveys) {
    const list = surveysByProgram.get(survey.program_id) || [];
    list.push(survey);
    surveysByProgram.set(survey.program_id, list);
  }

  const responsesBySurvey = new Map<number, ResponseRow[]>();
  for (const response of responses) {
    if (response.attempt_type !== 'pre' && response.attempt_type !== 'post') continue;
    const list = responsesBySurvey.get(response.survey_id) || [];
    list.push(response);
    responsesBySurvey.set(response.survey_id, list);
  }

  return programs.map((program) => {
    const programSurveys = [...(surveysByProgram.get(program.id) || [])].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    const answered = programSurveys.find((s) => responsesBySurvey.has(s.id));
    const survey = answered || programSurveys.find((s) => s.status === 'active') || null;

    if (!survey) {
      return { program, status: 'coming_soon', surveyId: null, pre: null, post: null };
    }

    const attempts = responsesBySurvey.get(survey.id) || [];
    const latest = (type: 'pre' | 'post') =>
      attempts
        .filter((r) => r.attempt_type === type)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
    const pre = latest('pre');
    const post = latest('post');

    const status: ProgramStatus = pre && post ? 'completed' : pre ? 'in_progress' : 'not_taken';
    return { program, status, surveyId: survey.id, pre, post };
  });
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                       */
/* ------------------------------------------------------------------ */

function Poster({ program, className }: { program: ProgramRow; className: string }) {
  if (program.image_url) {
    return <img src={program.image_url} alt="" className={`object-cover ${className}`} loading="lazy" decoding="async" />;
  }
  return (
    <div className={`bg-[#E0E7FF] text-[#4338CA] flex items-center justify-center ${className}`} aria-hidden="true">
      <Calendar className="w-1/3 h-1/3 max-w-10 max-h-10" />
    </div>
  );
}

type StepState = 'done' | 'now' | 'next';

interface Step {
  label: string;
  sub: string;
  state: StepState;
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-5">
      {steps.map((step, index) => (
        <li key={step.label} className="flex flex-col gap-2 min-w-0">
          <span
            className={`w-[34px] h-[34px] rounded-full font-extrabold text-sm flex items-center justify-center ${
              step.state === 'done'
                ? 'bg-[#34D399] text-[#064E3B]'
                : step.state === 'now'
                  ? 'bg-[#FBBF24] text-[#1E1B4B]'
                  : 'bg-white/[0.14] text-[#C7C9F2]'
            }`}
            aria-hidden="true"
          >
            {step.state === 'done' ? <Check className="w-4 h-4" strokeWidth={3} /> : index + 1}
          </span>
          <span className={`font-bold text-[15px] leading-tight ${step.state === 'next' ? 'text-[#C7C9F2]' : 'text-white'}`}>
            <span className="sr-only">
              {step.state === 'done' ? 'Done: ' : step.state === 'now' ? 'Current step: ' : 'Later: '}
            </span>
            {step.label}
          </span>
          <span className="text-[13px] leading-snug text-[#C7C9F2]">{step.sub}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardOverview() {
  const navigate = useNavigate();
  const { dbUserId, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [userName, setUserName] = useState('Student');
  const [profileLine, setProfileLine] = useState('');
  const [progress, setProgress] = useState<ProgramProgress[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);

      // 1. Who is this, and which campus? (Needed to scope programs.)
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      let viewerCampus: string | null = null;

      if (user) {
        // profiles.id is the Supabase Auth user's uuid, unlike users.id
        // (an unrelated bigint), so this is the one that can actually be
        // matched against the session user's id.
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, campus, program, year_level')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.full_name) {
          setUserName(profile.full_name.trim().split(/\s+/)[0]);
        } else if (user.user_metadata?.full_name) {
          setUserName(String(user.user_metadata.full_name).trim().split(/\s+/)[0]);
        }

        viewerCampus = profile?.campus || null;
        const yearDigit = normalizeYearLevel(profile?.year_level);
        const yearLabel = YEAR_LEVELS.find((y) => y.value === yearDigit)?.label.toLowerCase();
        setProfileLine([profile?.campus, profile?.program, yearLabel].filter(Boolean).join(', '));
      }

      // 2. Everything else in one round, no query per program.
      // University-wide rows (campus NULL) plus this student's own campus.
      const scoped = <T extends { or: (filters: string) => T }>(query: T) =>
        viewerCampus ? query.or(campusVisibilityFilter(viewerCampus)) : query;

      const [programRes, surveyRes, responseRes, notificationRes] = await Promise.all([
        scoped(supabase.from('programs').select('id, title, image_url, created_at').is('archived_at', null)).order(
          'created_at',
          { ascending: false }
        ),
        supabase
          .from('surveys')
          .select('id, program_id, status, created_at')
          .eq('type', 'knowledge')
          .not('program_id', 'is', null)
          .is('archived_at', null),
        dbUserId
          ? supabase
              .from('survey_responses')
              .select('survey_id, attempt_type, score, total_scored, created_at')
              .eq('user_id', dbUserId)
          : Promise.resolve({ data: [] as ResponseRow[], error: null }),
        dbUserId
          ? supabase
              .from('notifications')
              .select('id, title, message, action_path, created_at')
              .eq('user_id', dbUserId)
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [] as NotificationRow[], error: null }),
      ]);

      // supabase queries resolve (not reject) on error, so Promise.all won't
      // throw — inspect each result and surface a retryable failure instead of
      // silently rendering an empty dashboard.
      const firstError = programRes.error || surveyRes.error || responseRes.error;
      if (firstError) throw firstError;
      if (notificationRes.error) console.warn('Unable to load updates:', notificationRes.error);

      setProgress(
        buildProgress(
          (programRes.data || []) as ProgramRow[],
          (surveyRes.data || []) as KnowledgeSurveyRow[],
          (responseRes.data || []) as ResponseRow[]
        )
      );
      setNotifications((notificationRes.data || []) as NotificationRow[]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [dbUserId]);

  useEffect(() => {
    // Wait for useAuth to resolve users.id — responses and notifications
    // are keyed by it.
    if (authLoading) return;
    fetchDashboardData();
  }, [authLoading, fetchDashboardData]);

  if (loading) {
    // A skeleton of the real layout rather than a second full-screen spinner —
    // ProtectedRoute already showed one while verifying the session.
    return (
      <div className="w-full font-figtree animate-pulse" aria-busy="true" aria-label="Loading your dashboard">
        <div className="flex flex-col gap-3 mb-6">
          <div className="h-12 w-72 max-w-full bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          <div className="h-4 w-60 max-w-full bg-slate-200/70 dark:bg-slate-800/70 rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
          <div className="flex flex-col gap-6">
            <div className="h-72 bg-slate-300/70 dark:bg-slate-800 rounded-[36px] lg:rounded-[48px]" />
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-24 bg-white dark:bg-slate-900 rounded-[28px]" />
            ))}
          </div>
          <div className="flex flex-col gap-6">
            <div className="h-56 bg-white dark:bg-slate-900 rounded-[36px]" />
            <div className="h-56 bg-white dark:bg-slate-900 rounded-[36px]" />
          </div>
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 px-4 text-center font-figtree">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
          <MapPin className="h-8 w-8 text-rose-500" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="m-0 font-bricolage font-extrabold text-2xl text-[#1E1B4B] dark:text-white">
            Couldn't load your dashboard
          </p>
          <p className="m-0 text-[15px] text-[#5B6477] dark:text-slate-400 max-w-sm">
            Check your internet connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchDashboardData}
          className={`h-12 px-8 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] transition-colors ${focusRing}`}
        >
          Try again
        </button>
      </div>
    );
  }

  /* ----------------------------- derived ----------------------------- */

  const inProgress = progress
    .filter((p) => p.status === 'in_progress')
    .sort((a, b) => new Date(b.pre!.created_at).getTime() - new Date(a.pre!.created_at).getTime());
  const continueItem: ProgramProgress | null =
    inProgress[0] || progress.find((p) => p.status === 'not_taken') || null;

  const yourPrograms = [...progress]
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    .slice(0, YOUR_PROGRAMS_LIMIT);

  const completedCount = progress.filter((p) => p.status === 'completed').length;
  const preTestsTaken = progress.filter((p) => p.pre).length;
  const improvements = progress.map(improvementPoints).filter((n): n is number => n !== null);
  const bestImprovement = improvements.length > 0 ? Math.max(...improvements) : null;

  let continueSteps: Step[] = [];
  let continueNote = '';
  let continueCta = { label: '', path: PROGRAMS_PATH };
  if (continueItem?.status === 'in_progress') {
    const materials = getMaterialProgress(continueItem.program.id);
    continueSteps = [
      { label: 'Pre-test', sub: `Submitted ${shortDate(continueItem.pre!.created_at)}`, state: 'done' },
      {
        label: 'Read the materials',
        sub: materials ? `${materials.viewed} of ${materials.total} viewed` : 'Open the program materials',
        state: 'now',
      },
      { label: 'Post-test', sub: 'After the materials', state: 'next' },
      { label: 'Your results', sub: 'Pre-test and post-test scores', state: 'next' },
    ];
    continueNote = 'Then take the post-test in Assessment.';
    continueCta = { label: 'Open the materials', path: ctaPath(continueItem) };
  } else if (continueItem?.status === 'not_taken') {
    continueSteps = [
      { label: 'Pre-test', sub: 'Take it before the materials', state: 'now' },
      { label: 'Read the materials', sub: 'Open the program materials', state: 'next' },
      { label: 'Post-test', sub: 'After the materials', state: 'next' },
      { label: 'Your results', sub: 'Pre-test and post-test scores', state: 'next' },
    ];
    continueNote = 'Take it before you open the materials.';
    continueCta = { label: 'Take pre-test', path: ctaPath(continueItem) };
  }

  /* ------------------------------ render ----------------------------- */

  return (
    <div className="w-full font-figtree text-[#1E293B] dark:text-slate-200">
      {/* ================= GREETING ================= */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6 mb-6">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h1 className="m-0 font-bricolage font-extrabold text-[34px] sm:text-[40px] lg:text-5xl leading-[1.05] tracking-[-0.025em] text-[#1E1B4B] dark:text-white break-words">
            Mabuhay, <span className="text-[#4F46E5] dark:text-indigo-400">{userName}!</span>
          </h1>
          {profileLine && (
            <p className="m-0 text-[15px] sm:text-base text-[#5B6477] dark:text-slate-400">{profileLine}</p>
          )}
        </div>
        <span className="self-start sm:self-auto shrink-0 px-3.5 py-2 rounded-full bg-white dark:bg-slate-900 font-bold text-sm text-[#1E1B4B] dark:text-slate-100">
          {academicYearLabel()}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* ================= LEFT COLUMN ================= */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* ---------- Continue where you left off ---------- */}
          {continueItem && (
            <section
              aria-labelledby="continue-heading"
              className="rounded-[36px] lg:rounded-[48px] bg-[#1E1B4B] text-white p-[22px] sm:p-8 lg:px-10 lg:py-9 grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)] gap-5 md:gap-8 items-center"
            >
              <Poster
                program={continueItem.program}
                className="w-full h-44 sm:h-56 md:h-[180px] xl:h-[220px] rounded-[24px] md:rounded-[32px]"
              />
              <div className="flex flex-col gap-[18px] min-w-0">
                <div className="flex flex-col gap-2">
                  <span className="self-start px-3 py-1.5 rounded-full bg-[#FBBF24] text-[#1E1B4B] font-extrabold text-[13px]">
                    Continue where you left off
                  </span>
                  <h2
                    id="continue-heading"
                    className="m-0 font-bricolage font-extrabold text-[26px] sm:text-[30px] lg:text-[34px] leading-[1.1] tracking-[-0.02em] break-words"
                  >
                    {continueItem.program.title}
                  </h2>
                </div>
                <StepList steps={continueSteps} />
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(continueCta.path)}
                    className={`h-[52px] px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1E1B4B] font-extrabold text-[15px] flex items-center justify-center gap-2 shrink-0 transition-colors ${focusRing}`}
                  >
                    {continueCta.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <p className="m-0 text-sm text-[#C7C9F2]">{continueNote}</p>
                </div>
              </div>
            </section>
          )}

          {/* ---------- Your programs ---------- */}
          <section aria-labelledby="programs-heading" className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 px-1">
              <h2
                id="programs-heading"
                className="m-0 font-bricolage font-extrabold text-2xl lg:text-[30px] tracking-[-0.02em] text-[#1E1B4B] dark:text-white"
              >
                Your programs
              </h2>
              <button
                type="button"
                onClick={() => navigate(PROGRAMS_PATH)}
                className={`min-h-[44px] px-2 -mr-2 rounded-xl font-bold text-[15px] text-[#4338CA] dark:text-indigo-300 hover:underline ${focusRing}`}
              >
                All programs
              </button>
            </div>

            {yourPrograms.length === 0 ? (
              <div className="rounded-[28px] bg-white dark:bg-slate-900 px-6 py-10 text-center">
                <p className="m-0 font-bold text-[#1E1B4B] dark:text-white">No programs posted yet</p>
                <p className="m-0 mt-1 text-sm text-[#5B6477] dark:text-slate-400">
                  New guidance programs for your campus will show up here.
                </p>
              </div>
            ) : (
              <ul className="m-0 p-0 list-none flex flex-col gap-3">
                {yourPrograms.map((item) => {
                  const style = STATUS_STYLE[item.status];
                  const percent = progressPercent(item);
                  return (
                    <li
                      key={item.program.id}
                      className="rounded-[28px] bg-white dark:bg-slate-900 p-4 sm:pr-5 grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[76px_minmax(0,1fr)_150px] xl:grid-cols-[76px_minmax(0,1fr)_190px_150px] gap-x-4 gap-y-3 xl:gap-5 items-center"
                    >
                      <Poster program={item.program} className="w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-[18px] sm:rounded-[20px]" />

                      <div className="flex flex-col gap-1.5 min-w-0">
                        <h3 className="m-0 font-bold text-base sm:text-[17px] leading-snug text-[#1E1B4B] dark:text-white break-words">
                          {item.program.title}
                        </h3>
                        <p className="m-0 text-sm text-[#5B6477] dark:text-slate-400">{detailText(item)}</p>
                      </div>

                      <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-2 xl:col-start-3 xl:row-start-1 flex flex-col gap-2">
                        <span className={`self-start px-2.5 py-1 rounded-full font-bold text-xs ${style.badge}`}>
                          {style.label}
                        </span>
                        <span
                          className="block h-1.5 rounded-full bg-[#EEF0FA] dark:bg-slate-800 overflow-hidden"
                          role="progressbar"
                          aria-label={`${item.program.title} progress`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                        >
                          <span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${percent}%` }} />
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(ctaPath(item))}
                        aria-label={`${style.cta}: ${item.program.title}`}
                        className={`col-span-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:row-span-2 xl:col-start-4 xl:row-span-1 h-[46px] rounded-[14px] font-bold text-sm flex items-center justify-center transition-colors ${focusRing} ${
                          style.primary
                            ? 'bg-[#4F46E5] hover:bg-[#4338CA] text-white'
                            : 'bg-white dark:bg-slate-900 border-[1.5px] border-[#DDE1EE] dark:border-slate-700 text-[#1E1B4B] dark:text-slate-100 hover:border-[#A5B4FC]'
                        }`}
                      >
                        {style.cta}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* ---------- Your progress ---------- */}
          <section
            aria-labelledby="progress-heading"
            className="rounded-[36px] bg-white dark:bg-slate-900 p-6 sm:p-7 flex flex-col gap-[18px]"
          >
            <h2 id="progress-heading" className="m-0 font-bold text-lg text-[#1E1B4B] dark:text-white">
              Your progress
            </h2>
            {preTestsTaken === 0 ? (
              <div className="rounded-[22px] bg-[#EEF0FA] dark:bg-slate-800 p-5 flex flex-col gap-1">
                <p className="m-0 font-bold text-[#1E1B4B] dark:text-white">No results yet</p>
                <p className="m-0 text-sm text-[#5B6477] dark:text-slate-400">
                  Take a program's pre-test to start tracking your progress.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[22px] bg-[#EEF0FA] dark:bg-slate-800 p-[18px] flex flex-col gap-1">
                  <span className="font-bricolage font-extrabold text-[34px] leading-none text-[#1E1B4B] dark:text-white">
                    {completedCount}
                  </span>
                  <span className="text-[13px] text-[#5B6477] dark:text-slate-400">
                    {completedCount === 1 ? 'Program completed' : 'Programs completed'}
                  </span>
                </div>
                <div className="rounded-[22px] bg-[#EEF0FA] dark:bg-slate-800 p-[18px] flex flex-col gap-1">
                  <span className="font-bricolage font-extrabold text-[34px] leading-none text-[#1E1B4B] dark:text-white">
                    {preTestsTaken}
                  </span>
                  <span className="text-[13px] text-[#5B6477] dark:text-slate-400">
                    {preTestsTaken === 1 ? 'Pre-test taken' : 'Pre-tests taken'}
                  </span>
                </div>
                <div className="col-span-2 rounded-[22px] bg-[#D1FAE5] dark:bg-emerald-500/15 p-[18px] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#065F46] dark:text-emerald-200">Best improvement</span>
                  {bestImprovement === null ? (
                    <span className="text-sm font-semibold text-[#065F46] dark:text-emerald-200">No results yet</span>
                  ) : (
                    <span className="font-bricolage font-extrabold text-[26px] leading-none text-[#065F46] dark:text-emerald-200">
                      {formatPoints(bestImprovement)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ---------- Updates ---------- */}
          <section
            aria-labelledby="updates-heading"
            className="rounded-[36px] bg-white dark:bg-slate-900 p-6 sm:p-7 flex flex-col gap-2"
          >
            <h2 id="updates-heading" className="m-0 font-bold text-lg text-[#1E1B4B] dark:text-white">
              Updates
            </h2>
            {notifications.length === 0 ? (
              <p className="m-0 py-3 text-sm text-[#5B6477] dark:text-slate-400">No updates yet.</p>
            ) : (
              <ul className="m-0 p-0 list-none flex flex-col">
                {notifications.map((n, index) => {
                  const body = (
                    <>
                      <span className="flex justify-between gap-3">
                        <span className="font-bold text-[15px] text-[#1E1B4B] dark:text-white">{n.title}</span>
                        <span className="text-[13px] text-[#5B6477] dark:text-slate-400 shrink-0">{whenLabel(n.created_at)}</span>
                      </span>
                      {n.message && (
                        <span className="text-sm leading-normal text-[#5B6477] dark:text-slate-400 line-clamp-2">{n.message}</span>
                      )}
                    </>
                  );
                  const rowClass = `w-full text-left py-3.5 flex flex-col gap-1 ${
                    index < notifications.length - 1 ? 'border-b border-[#EEF0FA] dark:border-slate-800' : ''
                  }`;
                  return (
                    <li key={n.id}>
                      {n.action_path ? (
                        <button
                          type="button"
                          onClick={() => navigate(n.action_path!)}
                          className={`${rowClass} min-h-[44px] rounded-lg hover:bg-[#F5F6FB] dark:hover:bg-slate-800/60 ${focusRing}`}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className={rowClass}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------- Counseling note ---------- */}
          <aside className="rounded-[36px] bg-white dark:bg-slate-900 px-6 py-6 sm:px-7 flex gap-3.5 items-start">
            <HeartHandshake className="w-5 h-5 mt-0.5 shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
            <p className="m-0 text-sm leading-[1.55] text-[#334155] dark:text-slate-300">
              <strong className="text-[#1E1B4B] dark:text-white">Need to talk to someone?</strong> Visit the Guidance Office at
              your campus. Counseling happens there, in person.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
