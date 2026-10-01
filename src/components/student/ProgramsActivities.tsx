import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  Search, Calendar, MapPin, Loader2, Clock, ChevronRight, ZoomIn, FileText, Download, HardDrive,
  Check, Lock, Image as ImageIcon, PlayCircle, Music, File as FileIcon, X, AlertCircle,
} from 'lucide-react';
import { formatProgramDate } from '../../lib/formatProgramDate';
import { getEffectiveProgramStatus, compareProgramsForDisplay } from '../../lib/programStatus';
import { logActivity } from '../../lib/activityLog';
import { fetchViewerCampus, campusVisibilityFilter } from '../../lib/campuses';
import { useAuth } from '../../hooks/useAuth';
import { usePagination } from '../../hooks/usePagination';
import { PaginationControls } from '../../components/ui/pagination-controls';
import ProgramEntryTimeline from '../shared/ProgramEntryTimeline';
import PhotoViewer, { collectProgramPhotos, viewerAt, type PhotoViewerState } from '../shared/PhotoViewer';

// Lazy: pdfjs-dist is a large library (~500KB+) — no reason to ship it in
// this chunk unless someone actually opens a handout PDF preview.
const PdfPreview = lazy(() => import('../shared/PdfPreview'));

const PROGRAMS_PAGE_SIZE = 8;
const ASSESSMENT_PATH = '/student/survey';
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop';

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

const GUIDANCE_SERVICES = [
  'Information Services',
  'Individual Inventory',
  'Research and Evaluation',
  'Career Orientation',
  'Testing Services',
  'Counseling Services',
];

const PROGRAM_COMPONENTS = [
  'Group Guidance',
  'Individual Student Planning',
  'Responsive Services',
  'System Support',
];

interface Program {
  id: number;
  title: string;
  date: string;
  time_range: string;
  location: string;
  category: string;
  guidance_service: string;
  program_component: string;
  capacity: number;
  registered: number;
  status: string;
  image_url?: string;
  gallery_urls?: string[] | null;
  content?: string;
  date_display?: string;
  duration_label?: string | null;
  materials?: { id: number; title: string; file_url: string }[];
  program_entries?: {
    id: number;
    label: string;
    description: string | null;
    caption: string | null;
    image_urls: string[] | null;
    sort_order: number;
  }[];
}

type Handout = NonNullable<Program['materials']>[number];

/* ------------------------------------------------------------------ */
/* Pre-test / post-test status                                        */
/* ------------------------------------------------------------------ */

interface KnowledgeSurveyRow {
  id: number;
  program_id: number | null;
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

type AssessmentStatus = 'coming_soon' | 'not_taken' | 'in_progress' | 'completed';

interface ProgramAssessment {
  status: AssessmentStatus;
  surveyId: number | null;
  pre: ResponseRow | null;
  post: ResponseRow | null;
}

// Same rule as the dashboard: the program's knowledge survey the student
// has already answered (even if since closed), otherwise its newest
// active one.
function resolveAssessment(programId: number, surveys: KnowledgeSurveyRow[], responses: ResponseRow[]): ProgramAssessment {
  const programSurveys = surveys
    .filter((s) => s.program_id === programId)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const attemptsFor = (surveyId: number) =>
    responses.filter((r) => r.survey_id === surveyId && (r.attempt_type === 'pre' || r.attempt_type === 'post'));

  const answered = programSurveys.find((s) => attemptsFor(s.id).length > 0);
  const survey = answered || programSurveys.find((s) => s.status === 'active');
  if (!survey) return { status: 'coming_soon', surveyId: null, pre: null, post: null };

  const latest = (type: 'pre' | 'post') =>
    attemptsFor(survey.id)
      .filter((r) => r.attempt_type === type)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
  const pre = latest('pre');
  const post = latest('post');
  return { status: pre && post ? 'completed' : pre ? 'in_progress' : 'not_taken', surveyId: survey.id, pre, post };
}

// TODO: return true/false once material_views exists (a row per student
// per material opened). null = not tracked yet, so no "Viewed" badge.
function getMaterialViewed(_materialId: number): boolean | null {
  return null;
}

// TODO: return { viewed, total } once program_materials and material_views
// exist. null = not tracked yet, so no "2 of 3 viewed" count.
function getMaterialProgress(_programId: number): { viewed: number; total: number } | null {
  return null;
}

// TODO: return a reason string (e.g. "Opens after you view all
// materials") once post-test gating exists. null = not locked, so the
// post-test button stays enabled after the pre-test.
function getPostTestLock(_programId: number): string | null {
  return null;
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                    */
/* ------------------------------------------------------------------ */

function scoreText(response: ResponseRow | null): string {
  if (!response || response.score === null || response.score === undefined) return '—';
  return response.total_scored ? `${response.score}/${response.total_scored}` : String(response.score);
}

function formatPoints(points: number): string {
  const sign = points > 0 ? '+' : '';
  return `${sign}${points} ${Math.abs(points) === 1 ? 'point' : 'points'}`;
}

function longDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function programDateText(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function handoutTitle(material: Handout): string {
  return material.title.replace('HANDOUT: ', '');
}

// Handouts carry no type column in this fetch, so the file extension
// decides the icon and label.
function handoutKind(url: string): { label: string; icon: React.ElementType } {
  const path = (url || '').split('?')[0].toLowerCase();
  if (/\.pdf$/.test(path)) return { label: 'PDF document', icon: FileText };
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(path)) return { label: 'Image', icon: ImageIcon };
  if (/\.(mp4|webm|mov)$/.test(path)) return { label: 'Video', icon: PlayCircle };
  if (/\.(mp3|wav|m4a|ogg)$/.test(path)) return { label: 'Audio', icon: Music };
  return { label: 'File', icon: FileIcon };
}

const PROGRAM_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-[#E2E8F0] text-[#1E293B] dark:bg-slate-800 dark:text-slate-200' },
  ongoing: { label: 'Happening now', className: 'bg-[#D1FAE5] text-[#065F46] dark:bg-emerald-500/20 dark:text-emerald-200' },
  upcoming: { label: 'Upcoming', className: 'bg-[#FEF3C7] text-[#92400E] dark:bg-amber-500/20 dark:text-amber-200' },
};

const ASSESSMENT_BADGE: Record<AssessmentStatus, { label: string; className: string }> = {
  coming_soon: { label: 'Pre-test coming soon', className: 'bg-[#F1F5F9] text-[#475569] dark:bg-slate-800 dark:text-slate-300' },
  not_taken: { label: 'Pre-test open', className: 'bg-[#E0E7FF] text-[#3730A3] dark:bg-indigo-500/20 dark:text-indigo-200' },
  in_progress: { label: 'Post-test open', className: 'bg-[#FEF3C7] text-[#92400E] dark:bg-amber-500/20 dark:text-amber-200' },
  completed: { label: 'Pre- and post-test done', className: 'bg-[#D1FAE5] text-[#065F46] dark:bg-emerald-500/20 dark:text-emerald-200' },
};

type StepState = 'done' | 'now' | 'next' | 'locked';

interface Step {
  label: string;
  sub: string;
  state: StepState;
}

function stepsFor(programId: number, assessment: ProgramAssessment): Step[] {
  const materials = getMaterialProgress(programId);
  const lock = getPostTestLock(programId);

  switch (assessment.status) {
    case 'coming_soon':
      return [
        { label: 'Pre-test', sub: 'Coming soon', state: 'next' },
        { label: 'Read the materials', sub: 'Open now, below', state: 'next' },
        { label: 'Post-test', sub: 'After the materials', state: 'next' },
      ];
    case 'not_taken':
      return [
        { label: 'Pre-test', sub: 'Take it before the materials', state: 'now' },
        { label: 'Read the materials', sub: 'After the pre-test', state: 'next' },
        { label: 'Post-test', sub: 'After the materials', state: 'next' },
      ];
    case 'in_progress':
      return [
        { label: 'Pre-test submitted', sub: longDate(assessment.pre!.created_at), state: 'done' },
        {
          label: 'Read the materials',
          sub: materials ? `${materials.viewed} of ${materials.total} viewed` : 'Open them below',
          state: 'now',
        },
        lock
          ? { label: 'Post-test', sub: lock, state: 'locked' }
          : { label: 'Post-test', sub: 'Open now', state: 'next' },
      ];
    case 'completed':
      return [
        { label: 'Pre-test submitted', sub: longDate(assessment.pre!.created_at), state: 'done' },
        { label: 'Read the materials', sub: 'Done', state: 'done' },
        { label: 'Post-test submitted', sub: longDate(assessment.post!.created_at), state: 'done' },
      ];
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProgramsActivities() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, userName: authUserName, dbUserId, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [guidanceServiceFilter, setGuidanceServiceFilter] = useState('all');
  const [programComponentFilter, setProgramComponentFilter] = useState('all');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState | null>(null);
  const [previewHandout, setPreviewHandout] = useState<{ url: string; title: string } | null>(null);

  const [knowledgeSurveys, setKnowledgeSurveys] = useState<KnowledgeSurveyRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [assessmentLoading, setAssessmentLoading] = useState(true);
  const [assessmentLoadFailed, setAssessmentLoadFailed] = useState(false);

  // The open program lives in the URL (?program=<id>) so the phone's back
  // button returns to the list, and a link can point straight at one.
  const programParam = searchParams.get('program');

  const openProgram = (programId: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('program', String(programId));
      return next;
    });
  };

  const closeProgram = (options?: { replace?: boolean }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('program');
        return next;
      },
      { replace: options?.replace }
    );
  };

  // Handouts open in an in-app preview first — downloading is a separate,
  // explicit action inside that preview, not the default click behavior.
  const downloadHandout = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.location.href = url;
    }
  };

  // Logged at most once per browser session — see PHASE 12
  // (supabase/migrations.sql) for why this isn't one row per page load.
  useEffect(() => {
    if (!user?.email) return;
    const flagKey = 'logged_programs_view';
    if (sessionStorage.getItem(flagKey)) return;
    sessionStorage.setItem(flagKey, '1');
    logActivity({
      actorEmail: user.email,
      actorName: authUserName,
      action: 'view',
      entityType: 'program',
      entityLabel: 'Programs & Activities',
    });
  }, [user, authUserName]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('programs')
        .select('*, materials!materials_program_id_fkey(id, title, file_url), program_entries(id, label, description, caption, image_urls, sort_order)')
        .is('archived_at', null);

      const campus = await fetchViewerCampus();
      if (campus) query = query.or(campusVisibilityFilter(campus));

      const { data: programsData, error: programsError } = await query.order('date', { ascending: true });

      if (programsError) throw programsError;
      if (programsData) setPrograms(programsData);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      toast({
        variant: "destructive",
        title: "SYNC ERROR",
        description: err.message || "Failed to connect to database.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The student's pre-/post-test status for every program: two queries
  // total, not one per program. Keyed on users.id, so it waits for
  // useAuth to resolve it.
  const fetchAssessments = useCallback(async () => {
    setAssessmentLoading(true);
    setAssessmentLoadFailed(false);
    try {
      const [surveyRes, responseRes] = await Promise.all([
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
      ]);
      if (surveyRes.error || responseRes.error) throw surveyRes.error || responseRes.error;
      setKnowledgeSurveys((surveyRes.data || []) as KnowledgeSurveyRow[]);
      setResponses((responseRes.data || []) as ResponseRow[]);
    } catch (err) {
      console.error('Error fetching assessment status:', err);
      setAssessmentLoadFailed(true);
    } finally {
      setAssessmentLoading(false);
    }
  }, [dbUserId]);

  useEffect(() => {
    if (authLoading) return;
    fetchAssessments();
  }, [authLoading, fetchAssessments]);

  const filteredPrograms = programs
    .filter((p) => {
      const matchesSearch = p.title?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGuidanceService =
        guidanceServiceFilter === 'all' || p.guidance_service === guidanceServiceFilter;
      const matchesProgramComponent =
        programComponentFilter === 'all' || p.program_component === programComponentFilter;
      return matchesSearch && matchesGuidanceService && matchesProgramComponent;
    })
    .sort(compareProgramsForDisplay);

  const {
    page: programsPage,
    setPage: setProgramsPage,
    totalPages: programsTotalPages,
    pageItems: pagedPrograms,
  } = usePagination(filteredPrograms, PROGRAMS_PAGE_SIZE);

  useEffect(() => {
    setProgramsPage(1);
  }, [searchQuery, guidanceServiceFilter, programComponentFilter]);

  const selectedProgram = programParam ? programs.find((p) => String(p.id) === programParam) || null : null;
  const programNotFound = !loading && !!programParam && !selectedProgram;

  // Start each opened program at the top of the page.
  useEffect(() => {
    if (selectedProgram) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedProgram?.id]);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Syncing Cloud Data...</p>
      </div>
    );
  }

  /* ============================ DETAIL VIEW ============================ */

  if (selectedProgram) {
    const program = selectedProgram;
    const effectiveStatus = getEffectiveProgramStatus(program);
    const statusBadge = PROGRAM_STATUS_BADGE[effectiveStatus] || {
      label: effectiveStatus ? effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1) : 'Program',
      className: 'bg-[#E2E8F0] text-[#1E293B] dark:bg-slate-800 dark:text-slate-200',
    };
    const assessment = resolveAssessment(program.id, knowledgeSurveys, responses);
    const assessmentBadge = ASSESSMENT_BADGE[assessment.status];
    const steps = stepsFor(program.id, assessment);
    const postTestLock = getPostTestLock(program.id);
    const handouts = program.materials?.filter((m) => !m.title?.startsWith('CERTIFICATE_TEMPLATE:')) || [];
    const materialProgress = getMaterialProgress(program.id);
    const entries = program.program_entries || [];
    const photos = collectProgramPhotos(program);
    const poster = program.image_url || FALLBACK_POSTER;
    const improvement =
      assessment.status === 'completed' && assessment.pre?.score != null && assessment.post?.score != null
        ? assessment.post.score - assessment.pre.score
        : null;

    const whenWhere = [
      formatProgramDate(program, programDateText) + (program.duration_label ? `, ${program.duration_label}` : ''),
      program.time_range,
      program.location,
    ]
      .filter(Boolean)
      .join(', ');

    return (
      <div className="w-full max-w-[1440px] mx-auto font-figtree text-[#1E293B] dark:text-slate-200 animate-in fade-in duration-300">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="m-0 p-0 list-none flex items-center flex-wrap gap-1 text-sm text-[#5B6477] dark:text-slate-400">
            <li>
              <button
                type="button"
                onClick={() => closeProgram()}
                className={`min-h-[44px] px-1 -ml-1 rounded-lg font-bold text-[#4338CA] dark:text-indigo-300 hover:underline ${focusRing}`}
              >
                Programs
              </button>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-4 h-4" />
            </li>
            <li aria-current="page" className="min-w-0 truncate max-w-[60vw] sm:max-w-md">
              {program.title}
            </li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
          {/* ---------- Header card ---------- */}
          <section className="lg:col-start-1 lg:row-start-1 rounded-[36px] lg:rounded-[2.75rem] bg-white dark:bg-slate-900 p-4 sm:p-6 xl:p-7 grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-5 xl:gap-8 items-center">
            <button
              type="button"
              onClick={() => setPhotoViewer(viewerAt(photos, poster, program.title))}
              aria-label={`Enlarge poster: ${program.title}`}
              className={`group relative w-full h-56 sm:h-72 xl:w-[260px] xl:h-[260px] rounded-[28px] xl:rounded-[32px] overflow-hidden bg-[#E0E7FF] ${focusRing}`}
            >
              <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
              </span>
            </button>

            <div className="flex flex-col gap-3.5 min-w-0 px-1 sm:px-0">
              <div className="flex flex-wrap gap-2">
                <span className={`px-3 py-1.5 rounded-full font-extrabold text-xs ${statusBadge.className}`}>{statusBadge.label}</span>
                {!assessmentLoading && !assessmentLoadFailed && (
                  <span className={`px-3 py-1.5 rounded-full font-bold text-xs ${assessmentBadge.className}`}>
                    {assessmentBadge.label}
                  </span>
                )}
              </div>
              <h1 className="m-0 font-bricolage font-extrabold text-[30px] sm:text-4xl xl:text-[44px] leading-[1.05] tracking-[-0.025em] text-[#1E1B4B] dark:text-white break-words">
                {program.title}
              </h1>
              {whenWhere && (
                <p className="m-0 text-[15px] sm:text-base text-[#5B6477] dark:text-slate-400 flex gap-2">
                  <Calendar className="w-4 h-4 mt-1 shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                  <span>{whenWhere}</span>
                </p>
              )}
              {(program.guidance_service || program.program_component) && (
                <p className="m-0 text-sm font-semibold text-[#4338CA] dark:text-indigo-300">
                  {[program.guidance_service, program.program_component].filter(Boolean).join(', ')}
                </p>
              )}
              {program.content && (
                <div className="pt-1">
                  <h2 className="m-0 font-bold text-[15px] text-[#1E1B4B] dark:text-white">About this program</h2>
                  <p className="m-0 mt-1 text-[15px] leading-relaxed text-[#334155] dark:text-slate-300 whitespace-pre-wrap">
                    {program.content}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ---------- Right column (under the header on mobile) ---------- */}
          <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[104px] flex flex-col gap-5 min-w-0">
            {/* Pre- and post-test */}
            <section
              aria-labelledby="assessment-heading"
              className="rounded-[36px] lg:rounded-[40px] bg-[#1E1B4B] text-white p-6 sm:p-7 flex flex-col gap-[18px]"
            >
              <h2
                id="assessment-heading"
                className="m-0 font-bricolage font-extrabold text-2xl tracking-[-0.02em]"
              >
                Your pre- and post-test
              </h2>

              {assessmentLoading ? (
                <p className="m-0 flex items-center gap-2 text-sm text-[#C7C9F2]">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking your progress...
                </p>
              ) : assessmentLoadFailed ? (
                <div className="flex flex-col gap-3">
                  <p className="m-0 flex gap-2 text-sm text-[#C7C9F2]">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    Couldn't load your assessment status.
                  </p>
                  <button
                    type="button"
                    onClick={fetchAssessments}
                    className={`h-11 rounded-2xl bg-white/[0.12] hover:bg-white/20 text-white font-bold text-[15px] ${focusRing}`}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  {assessment.status === 'coming_soon' && (
                    <p className="m-0 font-bold text-[15px] text-[#FBBF24]">Pre-test coming soon</p>
                  )}

                  <ol className="m-0 p-0 list-none flex flex-col gap-3.5">
                    {steps.map((step, index) => (
                      <li key={step.label} className="flex gap-3.5 items-center">
                        <span
                          className={`w-[34px] h-[34px] shrink-0 rounded-full font-extrabold text-sm flex items-center justify-center ${
                            step.state === 'done'
                              ? 'bg-[#34D399] text-[#064E3B]'
                              : step.state === 'now'
                                ? 'bg-[#FBBF24] text-[#1E1B4B]'
                                : 'bg-white/[0.14] text-[#C7C9F2]'
                          }`}
                          aria-hidden="true"
                        >
                          {step.state === 'done' ? (
                            <Check className="w-4 h-4" strokeWidth={3} />
                          ) : step.state === 'locked' ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className={`font-bold text-[15px] ${step.state === 'next' || step.state === 'locked' ? 'text-[#C7C9F2]' : 'text-white'}`}>
                            <span className="sr-only">
                              {step.state === 'done' ? 'Done: ' : step.state === 'now' ? 'Current step: ' : step.state === 'locked' ? 'Locked: ' : ''}
                            </span>
                            {step.label}
                          </span>
                          <span className={`text-[13px] ${step.state === 'now' ? 'text-[#FBBF24]' : 'text-[#A5A8E0]'}`}>{step.sub}</span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  {assessment.status === 'completed' && (
                    <dl className="m-0 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Pre-test', value: scoreText(assessment.pre) },
                        { label: 'Post-test', value: scoreText(assessment.post) },
                        { label: 'Change', value: improvement === null ? '—' : formatPoints(improvement) },
                      ].map((tile) => (
                        <div key={tile.label} className="rounded-2xl bg-white/10 px-3 py-3 flex flex-col gap-0.5 min-w-0">
                          <dt className="text-xs text-[#C7C9F2]">{tile.label}</dt>
                          <dd className="m-0 font-bricolage font-extrabold text-lg leading-tight text-white break-words">{tile.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {assessment.status === 'not_taken' && (
                    <button
                      type="button"
                      onClick={() => navigate(`${ASSESSMENT_PATH}?survey=${assessment.surveyId}`)}
                      className={`h-[52px] rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1E1B4B] font-extrabold text-[15px] transition-colors ${focusRing}`}
                    >
                      Take pre-test
                    </button>
                  )}

                  {assessment.status === 'in_progress' && (
                    <>
                      {postTestLock ? (
                        <button
                          type="button"
                          disabled
                          className="h-[52px] rounded-2xl bg-white/[0.12] text-[#C7C9F2] font-bold text-[15px] cursor-not-allowed"
                        >
                          Post-test locked
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`${ASSESSMENT_PATH}?survey=${assessment.surveyId}`)}
                          className={`h-[52px] rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1E1B4B] font-extrabold text-[15px] transition-colors ${focusRing}`}
                        >
                          Take post-test
                        </button>
                      )}
                      <p className="m-0 text-[13px] leading-normal text-[#A5A8E0]">
                        Your pre-test score and the answer key are shown after the post-test.
                      </p>
                    </>
                  )}

                  {assessment.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => navigate(`${ASSESSMENT_PATH}?view=results`)}
                      className={`h-[52px] rounded-2xl bg-white hover:bg-[#E0E7FF] text-[#1E1B4B] font-extrabold text-[15px] transition-colors ${focusRing}`}
                    >
                      See results
                    </button>
                  )}
                </>
              )}
            </section>

            {/* Materials */}
            <section
              aria-labelledby="materials-heading"
              className="rounded-[36px] lg:rounded-[40px] bg-white dark:bg-slate-900 p-5 sm:p-[26px] flex flex-col gap-3.5"
            >
              <div className="flex justify-between items-baseline gap-3 px-1">
                <h2 id="materials-heading" className="m-0 font-bold text-lg text-[#1E1B4B] dark:text-white">
                  Materials
                </h2>
                {materialProgress && (
                  <span className="text-sm font-semibold text-[#92400E] dark:text-amber-200">
                    {materialProgress.viewed} of {materialProgress.total} viewed
                  </span>
                )}
              </div>

              {handouts.length === 0 ? (
                <p className="m-0 px-1 text-sm text-[#5B6477] dark:text-slate-400">No materials for this program yet.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
                  {handouts.map((material) => {
                    const kind = handoutKind(material.file_url);
                    const KindIcon = kind.icon;
                    const viewed = getMaterialViewed(material.id);
                    const title = handoutTitle(material);
                    return (
                      <li key={material.id} className="rounded-[20px] bg-[#F5F6FB] dark:bg-slate-800 p-3 flex gap-3 items-center">
                        <span className="w-[46px] h-[46px] shrink-0 rounded-[14px] bg-[#E0E7FF] dark:bg-indigo-500/20 text-[#4338CA] dark:text-indigo-200 flex items-center justify-center" aria-hidden="true">
                          <KindIcon className="w-5 h-5" />
                        </span>
                        <span className="grow flex flex-col gap-0.5 min-w-0">
                          <span className="font-bold text-sm text-[#1E1B4B] dark:text-white break-words">{title}</span>
                          <span className="text-xs text-[#5B6477] dark:text-slate-400">{kind.label}</span>
                        </span>
                        {viewed === true && (
                          <span className="hidden sm:inline px-2.5 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] font-bold text-xs shrink-0">
                            Viewed
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setPreviewHandout({ url: material.file_url, title })}
                          aria-label={`Open ${title}`}
                          className={`h-11 px-4 shrink-0 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[13px] transition-colors ${focusRing}`}
                        >
                          Open
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>

          {/* ---------- What the program covered ---------- */}
          {(entries.length > 0 || (program.gallery_urls?.length ?? 0) > 0) && (
            <section
              aria-labelledby="covered-heading"
              className="lg:col-start-1 lg:row-start-2 rounded-[36px] lg:rounded-[40px] bg-white dark:bg-slate-900 p-6 sm:px-9 sm:py-8 flex flex-col gap-5 min-w-0"
            >
              {entries.length > 0 && (
                <>
                  <h2
                    id="covered-heading"
                    className="m-0 font-bricolage font-extrabold text-[22px] sm:text-[26px] tracking-[-0.02em] text-[#1E1B4B] dark:text-white"
                  >
                    What the program covered
                  </h2>
                  <ProgramEntryTimeline
                    entries={entries}
                    onImageClick={(url, title) => setPhotoViewer(viewerAt(photos, url, title))}
                  />
                </>
              )}

              {(program.gallery_urls?.length ?? 0) > 0 && (
                <div className="flex flex-col gap-2">
                  <h2
                    id={entries.length > 0 ? undefined : 'covered-heading'}
                    className="m-0 font-bold text-base text-[#1E1B4B] dark:text-white"
                  >
                    More photos <span className="font-medium text-[#5B6477] dark:text-slate-400">{program.gallery_urls!.length}</span>
                  </h2>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {program.gallery_urls!.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPhotoViewer(viewerAt(photos, url, program.title))}
                        aria-label={`Enlarge photo ${i + 1} of ${program.gallery_urls!.length}`}
                        className={`shrink-0 rounded-2xl ${focusRing}`}
                      >
                        <img src={url} alt="" className="h-28 w-auto rounded-2xl object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <PhotoViewer state={photoViewer} onChange={setPhotoViewer} />
        {renderHandoutPreview()}
      </div>
    );
  }

  // Shared by both views (hoisted, so the detail view above can call it).
  function renderHandoutPreview() {
    return (
      /* HANDOUT PREVIEW — opens in-app first; downloading is a separate,
         explicit action below, not the default click behavior. */
      <Dialog open={!!previewHandout} onOpenChange={(open) => !open && setPreviewHandout(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl flex flex-col font-figtree">
          <DialogHeader className="p-5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between shrink-0">
            <DialogTitle className="font-bold text-base text-[#1E1B4B] dark:text-white truncate pr-8">
              {previewHandout?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 w-full bg-slate-900/50 flex items-center justify-center overflow-hidden relative">
            {previewHandout && /\.pdf(\?.*)?$/i.test(previewHandout.url) ? (
              <Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p className="text-sm text-slate-400">Loading PDF...</p>
                  </div>
                }
              >
                <PdfPreview url={previewHandout.url} />
              </Suspense>
            ) : previewHandout && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(previewHandout.url) ? (
              <div className="p-4 w-full h-full flex items-center justify-center">
                <img src={previewHandout.url} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt={previewHandout.title} />
              </div>
            ) : (
              <div className="text-center px-6">
                <HardDrive className="w-16 h-16 text-slate-700 dark:text-slate-200 mx-auto" />
                <p className="font-bold text-slate-400 mt-4 text-sm">Preview not available for this file type</p>
                <p className="text-slate-400 text-[13px] mt-1">Download it below to open it.</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={() => setPreviewHandout(null)} className="h-11 rounded-xl font-bold text-sm">Close</Button>
            <Button
              onClick={() => previewHandout && downloadHandout(previewHandout.url, previewHandout.title)}
              className="h-11 bg-[#4F46E5] hover:bg-[#4338CA] rounded-xl font-bold text-sm px-6 text-white"
            >
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ============================= LIST VIEW ============================= */

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-6 pb-20 max-w-7xl mx-auto font-sans w-full overflow-hidden animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight uppercase mb-1">
          Programs & <span className="text-indigo-600">Activities</span>
        </h1>
        <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">Guidance and development events console</p>
      </div>

      {/* ?program=<id> that doesn't match a program this student can see */}
      {programNotFound && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-[#FEF3C7] dark:bg-amber-500/15 text-[#92400E] dark:text-amber-200 pl-4 pr-1 py-1 font-figtree">
          <p className="m-0 flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            Program not found. It may have been removed or isn't available for your campus.
          </p>
          <button
            type="button"
            onClick={() => closeProgram({ replace: true })}
            aria-label="Dismiss message"
            className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center hover:bg-black/5 ${focusRing}`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Filter active activity titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold text-xs md:text-sm text-slate-700 dark:text-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-100 w-full"
          />
        </div>
        <Select value={guidanceServiceFilter} onValueChange={setGuidanceServiceFilter}>
          <SelectTrigger className="w-full sm:w-56 h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-widest">
            <SelectValue placeholder="Guidance Service" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-none shadow-xl bg-white dark:bg-slate-900">
            <SelectItem value="all">All Guidance Services</SelectItem>
            {GUIDANCE_SERVICES.map((service) => (
              <SelectItem key={service} value={service}>{service}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={programComponentFilter} onValueChange={setProgramComponentFilter}>
          <SelectTrigger className="w-full sm:w-56 h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-widest">
            <SelectValue placeholder="Program Component" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-none shadow-xl bg-white dark:bg-slate-900">
            <SelectItem value="all">All Program Components</SelectItem>
            {PROGRAM_COMPONENTS.map((component) => (
              <SelectItem key={component} value={component}>{component}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* RENDER CARDS GRID LOOP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {pagedPrograms.map((program) => {
          const effectiveStatus = getEffectiveProgramStatus(program);
          return (
          <Card key={program.id} className="rounded-2xl md:rounded-[2.5rem] border-none shadow-sm bg-white dark:bg-slate-900 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col gap-6 border-b-4 border-b-slate-100 dark:border-b-slate-800">

            <div
              className="aspect-video w-full bg-slate-900 relative shrink-0 cursor-pointer group/poster"
              onClick={() => setPhotoViewer(viewerAt(
                collectProgramPhotos(program),
                program.image_url || FALLBACK_POSTER,
                program.title,
              ))}
            >
              <img
                src={program.image_url || FALLBACK_POSTER}
                className="absolute inset-0 w-full h-full object-cover"
                alt={program.title}
              />
              <div className="absolute inset-0 bg-black/0 group-hover/poster:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover/poster:opacity-100 transition-opacity" />
              </div>
              <div className={`absolute top-4 right-4 px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm
                ${effectiveStatus === 'ongoing' ? 'bg-emerald-500 text-white animate-pulse' : effectiveStatus === 'completed' ? 'bg-slate-700 text-white' : 'bg-indigo-600 text-white'}`}>
                {effectiveStatus}
              </div>
            </div>

            <div className="px-6 md:px-8 space-y-3 -mt-2">
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-md inline-block">
                  {program.guidance_service || 'General Guidance'}
                </span>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest rounded-md inline-block">
                  {program.program_component || 'General'}
                </span>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase leading-tight max-w-[85%]">
                {program.title}
              </h3>
            </div>

            <div className="px-6 md:px-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100/30 dark:border-slate-700/30">
                <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{formatProgramDate(program)}{program.duration_label && ` · ${program.duration_label}`}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100/30 dark:border-slate-700/30">
                <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{program.time_range || 'All Day Schedule'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100/30 dark:border-slate-700/30 sm:col-span-2">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{program.location}</span>
              </div>
            </div>

            <div className="px-6 md:px-8 pb-6 md:pb-8">
              <Button
                variant="ghost"
                className="w-full border-t border-dashed rounded-none pt-4 justify-between text-indigo-600 hover:text-indigo-700 hover:bg-transparent px-0 font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-colors"
                onClick={() => openProgram(program.id)}
              >
                View Details
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

          </Card>
          );
        })}
      </div>

      <PaginationControls
        page={programsPage}
        totalPages={programsTotalPages}
        totalItems={filteredPrograms.length}
        pageSize={PROGRAMS_PAGE_SIZE}
        onPageChange={setProgramsPage}
        className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800"
      />

      <PhotoViewer state={photoViewer} onChange={setPhotoViewer} />
      {renderHandoutPreview()}

    </div>
  );
}
