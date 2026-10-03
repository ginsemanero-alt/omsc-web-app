import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { loadMaterialProgress, postTestLockFor, type MaterialProgressData } from '../../lib/materialProgress';

import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  Send,
  RotateCcw,
  FileCheck2,
  Clock,
  Trophy,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Lock,
} from 'lucide-react';

interface Question {
  id: string | number;
  text: string;
  type: 'mcq' | 'scale' | 'text' | 'checkbox' | string;
  options?: string[];
  required?: boolean;
  correct_option?: string;
  related_program_id?: number | null;
  related_material_id?: number | null;
  // checkbox only
  allow_other?: boolean;
  option_program_ids?: Record<string, number> | null;
}

interface Survey {
  id: string | number;
  title: string;
  description?: string | null;
  // Question counts per form, for the cards (active_survey_question_counts).
  // The questions themselves load only when the student starts, through
  // get_assessment_questions(), without answer keys (PHASE 30). Form B is
  // the parallel post-test form (PHASE 27); 0 means the post-test reuses
  // Form A.
  form_a_count?: number;
  form_b_count?: number;
  status?: string;
  type?: 'knowledge' | 'opinion';
  program_id?: number | null;
  created_at?: string;
  is_completed?: boolean;
  // Knowledge assessments are taken twice (PHASE 22): a pre-test, then a
  // post-test after the program's IEC materials. This is the attempt the
  // student's next submission will become — the database assigns it
  // (set_attempt_type trigger); this is only for labels.
  next_attempt?: AttemptType | null;
  // Why the post-test can't be taken yet (PHASE 29: the program's linked
  // IEC materials aren't all viewed), or null when it can.
  post_test_lock?: string | null;
}

type AttemptType = 'pre' | 'post';

// How many questions the student's next attempt has: Form B for a
// knowledge post-test when the assessment has one, otherwise Form A. The
// server picks the same form (get_assessment_questions).
function questionCountForAttempt(survey: Survey): number {
  const useFormB = survey.type === 'knowledge' && survey.next_attempt === 'post' && (survey.form_b_count ?? 0) > 0;
  return (useFormB ? survey.form_b_count : survey.form_a_count) ?? 0;
}

// The review a student gets after the post-test (get_assessment_review):
// each attempt's questions with their answer keys, and their answers.
interface ReviewAttempt {
  form: 'A' | 'B';
  questions: Question[];
  answers: Record<string, any>;
  score: number | null;
  total_scored: number | null;
  percentage: number | null;
}

interface AssessmentReview {
  survey_id: string;
  title: string;
  pre: ReviewAttempt | null;
  post: ReviewAttempt;
}

// Supabase function errors carry the message raised in the database
// (e.g. "Post-test locked: View 1 more material to unlock").
function rpcErrorMessage(error: any, fallback: string): string {
  return (error?.message as string | undefined)?.trim() || fallback;
}

const ATTEMPT_LABEL: Record<AttemptType, string> = {
  pre: 'Pre-Test',
  post: 'Post-Test',
};

interface SurveyResult {
  id: string | number;
  survey_id: string | number;
  title: string;
  category?: string | null;
  created_at: string;
  score?: number | null;
  total_scored?: number | null;
  percentage?: number | null;
  attempt_type?: AttemptType | null;
}

interface MissedQuestion {
  question: Question;
  studentAnswer: any;
}

interface ScoreSummary {
  correct: number;
  total: number;
  percentage: number | null;
  missed: MissedQuestion[];
}

function computeScoreSummary(
  questions: Question[],
  answers: Record<string, any>
): ScoreSummary {
  const scoredQuestions = questions.filter(
    (question) => question.type === 'mcq' && question.correct_option
  );

  const missed: MissedQuestion[] = [];
  let correct = 0;

  for (const question of scoredQuestions) {
    const studentAnswer = answers[String(question.id)];

    if (studentAnswer === question.correct_option) {
      correct += 1;
    } else {
      missed.push({ question, studentAnswer });
    }
  }

  const total = scoredQuestions.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : null;

  return { correct, total, percentage, missed };
}

export default function QuizzesSurveys() {
  const navigate = useNavigate();
  const { dbUserId } = useAuth();

  const [view, setView] = useState<'available' | 'results'>('available');

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [surveysLoadFailed, setSurveysLoadFailed] = useState(false);

  const [results, setResults] = useState<SurveyResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsLoadFailed, setResultsLoadFailed] = useState(false);

  const [activeSurveyId, setActiveSurveyId] = useState<string | number | null>(
    null
  );

  const [answers, setAnswers] = useState<Record<string, any>>({});

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Anchor at the top of the active assessment card. Moving between questions
  // scrolls this into view instead of jumping the whole window to top:0, which
  // on mobile threw the user up past the page title on every "Next".
  const assessmentTopRef = useRef<HTMLDivElement>(null);

  const scrollToAssessmentTop = () => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    requestAnimationFrame(() => {
      assessmentTopRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  const [showInstructions, setShowInstructions] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [scoreSummary, setScoreSummary] = useState<ScoreSummary | null>(null);
  // Which attempt the just-submitted response was, captured before the
  // survey list refetches (after which the survey's next_attempt has
  // already moved on). A pre-test result must not reveal correct answers,
  // or the post-test would measure memory of the key, not learning.
  const [submittedAttempt, setSubmittedAttempt] = useState<AttemptType | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [programTitles, setProgramTitles] = useState<Record<number, string>>({});
  const [materialTitles, setMaterialTitles] = useState<Record<number, string>>({});

  const { toast } = useToast();

  // Deep links from the dashboard and program pages:
  //   ?survey=<id>   opens that assessment (or its results if done)
  //   ?view=results  opens My results
  // The parameters are cleared once handled, so Back and refresh don't
  // reopen the assessment.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const wantSurvey = searchParams.get('survey');
    const wantView = searchParams.get('view');
    if (!wantSurvey && !wantView) return;
    if (wantSurvey && loading) return; // wait for the list

    if (wantView === 'results') setView('results');

    if (wantSurvey && !surveysLoadFailed) {
      const survey = surveys.find((s) => String(s.id) === wantSurvey);
      if (survey && !survey.is_completed) {
        setView('available');
        handleStartSurvey(survey);
      } else if (survey) {
        setView('results');
      } else {
        toast({
          title: 'Assessment not available',
          description: 'It may be closed or not open yet. Here are the assessments you can take now.',
        });
      }
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('survey');
        next.delete('view');
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, surveys, surveysLoadFailed]);

  useEffect(() => {
    if (!dbUserId) return;

    fetchActiveSurveys();
    fetchMyResults();
    fetchLinkTitles();
  }, [dbUserId]);

  async function fetchLinkTitles() {
    const [programsRes, materialsRes] = await Promise.all([
      supabase.from('programs').select('id, title').is('archived_at', null),
      supabase.from('materials').select('id, title').is('archived_at', null),
    ]);

    if (programsRes.data) {
      setProgramTitles(
        Object.fromEntries(programsRes.data.map((p: any) => [p.id, p.title]))
      );
    }

    if (materialsRes.data) {
      setMaterialTitles(
        Object.fromEntries(materialsRes.data.map((m: any) => [m.id, m.title]))
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * FETCH MY RESULTS
   * ---------------------------------------------------------
   */
  async function fetchMyResults() {
    if (!dbUserId) return;

    try {
      setResultsLoading(true);
      setResultsLoadFailed(false);

      // Own responses, newest first. A pre-test score comes back empty
      // until the post-test exists (student_my_responses, PHASE 30).
      const { data: myResponses, error: responsesError } = await supabase.rpc('student_my_responses');

      if (responsesError) throw responsesError;

      const responsesData = (myResponses || []) as any[];
      const surveyIds = [
        ...new Set(responsesData.map((r) => r.survey_id).filter(Boolean)),
      ];

      let surveysMap: Record<string, any> = {};

      if (surveyIds.length > 0) {
        const { data: surveysData, error: surveysError } = await supabase
          .from('surveys')
          .select('id, title, category')
          .in('id', surveyIds);

        if (surveysError) {
          console.warn('Unable to fetch survey titles:', surveysError);
        } else {
          surveysMap = (surveysData || []).reduce((acc: Record<string, any>, s: any) => {
            acc[String(s.id)] = s;
            return acc;
          }, {});
        }
      }

      const formattedResults: SurveyResult[] = (responsesData || []).map((response: any) => {
        const survey = surveysMap[String(response.survey_id)];

        return {
          id: response.id,
          survey_id: response.survey_id,
          title: survey?.title || 'Guidance Assessment Response',
          category: survey?.category || null,
          created_at: response.created_at,
          score: response.score,
          total_scored: response.total_scored,
          percentage: response.percentage,
          attempt_type: response.attempt_type ?? null,
        };
      });

      setResults(formattedResults);
    } catch (error: any) {
      console.error('Results Fetch Error:', error);
      setResultsLoadFailed(true);
    } finally {
      setResultsLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * FETCH ACTIVE SURVEYS
   * ---------------------------------------------------------
   */
  async function fetchActiveSurveys() {
    if (!dbUserId) return;

    try {
      setLoading(true);
      setSurveysLoadFailed(false);

      const [surveyRes, countRes, responseRes] = await Promise.all([
        supabase
          .from('surveys')
          .select('id, title, description, category, type, status, program_id, created_at')
          .eq('status', 'active')
          .is('archived_at', null)
          .order('created_at', { ascending: false }),
        supabase.rpc('active_survey_question_counts'),
        supabase.rpc('student_my_responses'),
      ]);

      if (surveyRes.error) throw surveyRes.error;
      const surveysData = surveyRes.data;
      if (countRes.error) console.warn('Unable to fetch question counts:', countRes.error);
      const countsBySurvey = new Map<string, { form_a_count: number; form_b_count: number }>(
        ((countRes.data || []) as any[]).map((c) => [String(c.survey_id), c])
      );
      const responsesData = (responseRes.data || []) as { survey_id: string; attempt_type: string | null }[];
      const responsesError = responseRes.error;

      // Post-test lock: same rule as the program page and dashboard
      // (src/lib/materialProgress.ts). If it can't be checked, the lock
      // holds with a "couldn't check" reason. submit_assessment enforces
      // the same rule on the server (PHASE 30), so this is for the UI.
      let materialData: MaterialProgressData | null = null;
      let materialLoadFailed = false;
      try {
        materialData = await loadMaterialProgress(dbUserId);
      } catch (error) {
        console.warn('Unable to check material progress:', error);
        materialLoadFailed = true;
      }

      if (responsesError) {
        console.warn('Unable to fetch completed surveys:', responsesError);
      }

      // survey id -> the attempts this student has already submitted
      const attemptsBySurvey: Record<string, Set<string>> = {};
      for (const response of responsesData || []) {
        const key = String(response.survey_id);
        (attemptsBySurvey[key] ||= new Set()).add(
          response.attempt_type || 'single'
        );
      }

      const formattedSurveys: Survey[] =
        (surveysData || []).map((row: any) => {
          const survey = { ...row, ...countsBySurvey.get(String(row.id)) };
          const attempts = attemptsBySurvey[String(survey.id)];

          // Opinion survey: one response and it's done. Knowledge
          // assessment: done only once both pre-test and post-test exist.
          if (survey.type !== 'knowledge') {
            return { ...survey, is_completed: Boolean(attempts), next_attempt: null };
          }

          const next_attempt: AttemptType | null = !attempts?.has('pre')
            ? 'pre'
            : !attempts.has('post')
              ? 'post'
              : null;

          const post_test_lock =
            next_attempt === 'post' ? postTestLockFor(materialData, survey.program_id, materialLoadFailed) : null;

          return { ...survey, is_completed: next_attempt === null, next_attempt, post_test_lock };
        }) || [];

      setSurveys(formattedSurveys);
    } catch (error: any) {
      console.error('Fetch Error:', error);
      setSurveysLoadFailed(true);

      toast({
        title: 'Unable to Load Assessments',
        description:
          error?.message || 'Failed to load available assessments.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * ACTIVE SURVEY
   * ---------------------------------------------------------
   */
  // Knowledge assessments: survey id -> the student's latest pre-test and
  // post-test result. A pre-test score stays hidden until the post-test
  // for the same survey exists. (results is newest first.)
  const attemptsBySurveyResult = useMemo(() => {
    const map: Record<string, { pre?: SurveyResult; post?: SurveyResult }> = {};
    for (const result of results) {
      if (result.attempt_type !== 'pre' && result.attempt_type !== 'post') continue;
      const entry = (map[String(result.survey_id)] ||= {});
      if (!entry[result.attempt_type]) entry[result.attempt_type] = result;
    }
    return map;
  }, [results]);

  const preTestComparison = (surveyId: string | number) => {
    const { pre, post } = attemptsBySurveyResult[String(surveyId)] || {};
    if (!pre || !post || pre.score == null || post.score == null) return null;
    const points = post.score - pre.score;
    const preText = pre.total_scored ? `${pre.score}/${pre.total_scored}` : String(pre.score);
    const postText = post.total_scored ? `${post.score}/${post.total_scored}` : String(post.score);
    const change = `${points > 0 ? '+' : ''}${points} ${Math.abs(points) === 1 ? 'point' : 'points'}`;
    return `Pre-test ${preText}, post-test ${postText}, ${change}`;
  };

  // The questions of the attempt being taken, loaded when it starts from
  // get_assessment_questions(): the form the server picked (Form B for a
  // post-test when the assessment has one, otherwise Form A), without
  // correct answers. The server scores the submission against the same
  // form.
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [startingSurveyId, setStartingSurveyId] = useState<string | number | null>(null);

  const activeSurvey = useMemo(() => {
    if (activeSurveyId === null) return null;

    return (
      surveys.find(
        (survey) => String(survey.id) === String(activeSurveyId)
      ) || null
    );
  }, [activeSurveyId, surveys]);

  const questions: Question[] = activeQuestions;

  // The post-test review (answer keys included), loaded on demand. The
  // server opens it only once this student has submitted the post-test.
  const [reviews, setReviews] = useState<Record<string, AssessmentReview>>({});
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);

  async function loadReview(surveyId: string | number): Promise<AssessmentReview | null> {
    const key = String(surveyId);
    if (reviews[key]) return reviews[key];
    const { data, error } = await supabase.rpc('get_assessment_review', { p_survey_id: surveyId });
    if (error || !data) {
      console.warn('Review unavailable:', error?.message);
      return null;
    }
    setReviews((prev) => ({ ...prev, [key]: data as AssessmentReview }));
    return data as AssessmentReview;
  }

  const toggleReview = async (surveyId: string | number) => {
    const key = String(surveyId);
    if (openReviewId === key) {
      setOpenReviewId(null);
      return;
    }
    setReviewLoadingId(key);
    const review = await loadReview(surveyId);
    setReviewLoadingId(null);
    if (!review) {
      toast({ title: 'Review unavailable', description: 'Please try again in a moment.', variant: 'destructive' });
      return;
    }
    setOpenReviewId(key);
  };

  const currentQuestion = questions[currentQuestionIndex];

  const totalQuestions = questions.length;

  const progressPercentage =
    totalQuestions > 0
      ? ((currentQuestionIndex + 1) / totalQuestions) * 100
      : 0;

  /*
   * ---------------------------------------------------------
   * START SURVEY
   * ---------------------------------------------------------
   */
  const handleStartSurvey = async (survey: Survey) => {
    if (survey.is_completed || startingSurveyId !== null) return;
    if (survey.post_test_lock) {
      toast({ title: 'Post-test locked', description: survey.post_test_lock });
      return;
    }

    setStartingSurveyId(survey.id);
    const { data, error } = await supabase.rpc('get_assessment_questions', { p_survey_id: survey.id });
    setStartingSurveyId(null);

    if (error || !data) {
      toast({
        title: 'Unable to Open Assessment',
        description: rpcErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
      fetchActiveSurveys();
      return;
    }
    if (data.post_test_lock) {
      toast({ title: 'Post-test locked', description: data.post_test_lock });
      fetchActiveSurveys();
      return;
    }

    setActiveQuestions((data.questions || []) as Question[]);
    setActiveSurveyId(survey.id);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowInstructions(true);
    setShowReview(false);
    setShowSubmitConfirmation(false);
    setScoreSummary(null);
  };

  /*
   * ---------------------------------------------------------
   * CLOSE SURVEY
   * ---------------------------------------------------------
   */
  const handleCloseSurvey = () => {
    if (submitting) return;

    setActiveSurveyId(null);
    setActiveQuestions([]);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowInstructions(false);
    setShowReview(false);
    setShowSubmitConfirmation(false);
    setScoreSummary(null);
  };

  /*
   * ---------------------------------------------------------
   * ANSWER HANDLER
   * ---------------------------------------------------------
   */
  const updateAnswer = (questionId: string | number, value: any) => {
    setAnswers((previous) => ({
      ...previous,
      [String(questionId)]: value,
    }));
  };

  /*
   * ---------------------------------------------------------
   * CHECK ANSWER
   * ---------------------------------------------------------
   */
  const hasAnswer = (question: Question | undefined) => {
    if (!question) return false;

    const value = answers[String(question.id)];

    if (value === undefined || value === null) {
      return false;
    }

    if (typeof value === 'string' && value.trim() === '') {
      return false;
    }

    // checkbox answers are an array of selected option strings — nothing
    // checked yet is not answered, even though the key exists.
    if (Array.isArray(value) && value.length === 0) {
      return false;
    }

    return true;
  };

  /*
   * ---------------------------------------------------------
   * GET UNANSWERED QUESTIONS
   * ---------------------------------------------------------
   */
  const unansweredQuestions = useMemo(() => {
    return questions.filter((question) => {
      /*
       * If "required" is explicitly false,
       * the question does not need an answer.
       */
      if (question.required === false) return false;

      return !hasAnswer(question);
    });
  }, [questions, answers]);

  /*
   * ---------------------------------------------------------
   * NEXT QUESTION
   * ---------------------------------------------------------
   */
  const handleNextQuestion = () => {
    if (!currentQuestion) return;

    if (!hasAnswer(currentQuestion)) {
      toast({
        title: 'Please Answer This Question',
        description:
          'Review the question and choose or enter your response before continuing.',
        variant: 'destructive',
      });

      return;
    }

    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((previous) => previous + 1);
      scrollToAssessmentTop();
      return;
    }

    /*
     * Last question:
     * Go to review screen instead of submitting immediately.
     */
    setShowReview(true);
    scrollToAssessmentTop();
  };

  /*
   * ---------------------------------------------------------
   * PREVIOUS QUESTION
   * ---------------------------------------------------------
   */
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex <= 0) return;

    setCurrentQuestionIndex((previous) => previous - 1);
    scrollToAssessmentTop();
  };

  /*
   * ---------------------------------------------------------
   * EDIT ANSWER FROM REVIEW
   * ---------------------------------------------------------
   */
  const handleEditQuestion = (index: number) => {
    setCurrentQuestionIndex(index);
    setShowReview(false);
    scrollToAssessmentTop();
  };

  /*
   * ---------------------------------------------------------
   * FINAL SUBMISSION
   * ---------------------------------------------------------
   */
  const handleSubmit = async () => {
    if (!activeSurvey) return;

    if (unansweredQuestions.length > 0) {
      toast({
        title: 'Incomplete Assessment',
        description:
          'Please complete all required questions before submitting.',
        variant: 'destructive',
      });

      setShowSubmitConfirmation(false);
      setShowReview(false);

      const firstUnansweredIndex = questions.findIndex(
        (question) => !hasAnswer(question)
      );

      if (firstUnansweredIndex >= 0) {
        setCurrentQuestionIndex(firstUnansweredIndex);
      }

      return;
    }

    if (!dbUserId) {
      toast({
        title: 'Session Not Ready',
        description: 'Please wait a moment and try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);

      // Only the answers go up. submit_assessment (PHASE 30) picks the
      // form, scores it, rejects a locked post-test and records the
      // attempt; a pre-test's score isn't returned.
      const { data: submitted, error } = await supabase.rpc('submit_assessment', {
        p_survey_id: activeSurvey.id,
        p_answers: answers,
      });

      if (error) throw error;

      const attempt = (submitted?.attempt_type ?? null) as AttemptType | null;

      // After the post-test the review (with the answer key) opens: the
      // missed items come from it, scored by the server.
      let summary: ScoreSummary | null = null;
      if (attempt === 'post') {
        const review = await loadReview(activeSurvey.id);
        const fromReview = review
          ? computeScoreSummary(review.post.questions, review.post.answers || {})
          : null;
        summary = {
          correct: submitted.score ?? fromReview?.correct ?? 0,
          total: submitted.total_scored ?? fromReview?.total ?? 0,
          percentage: submitted.percentage != null ? Number(submitted.percentage) : fromReview?.percentage ?? null,
          missed: fromReview?.missed ?? [],
        };
      } else if (attempt === 'pre') {
        // The pre-test screen shows no score; this only opens it.
        summary = { correct: 0, total: 1, percentage: null, missed: [] };
      }

      await fetchActiveSurveys();
      await fetchMyResults();

      setShowSubmitConfirmation(false);
      setShowReview(false);

      if (summary && summary.total > 0) {
        // Knowledge assessment with scored questions — show the results
        // screen instead of closing, so a missed question can point the
        // student back to the program/material it covers.
        setSubmittedAttempt(attempt);
        setScoreSummary(summary);
      } else {
        toast({
          title: attempt ? `${ATTEMPT_LABEL[attempt]} Submitted` : 'Assessment Submitted',
          description:
            attempt === 'pre'
              ? 'Read the program\'s IEC materials, then come back for the Post-Test.'
              : 'Your response has been successfully recorded. Thank you for participating!',
        });

        setActiveSurveyId(null);
        setAnswers({});
        setCurrentQuestionIndex(0);
      }
    } catch (error: any) {
      console.error('Submission Error:', error);

      toast({
        title: 'Submission Failed',
        description: rpcErrorMessage(error, 'We were unable to submit your response. Please try again.'),
        variant: 'destructive',
      });
      // e.g. the post-test turned out to be locked: refresh the cards.
      fetchActiveSurveys();
    } finally {
      setSubmitting(false);
    }
  };

  // Missed items with the student's answer, the correct answer, and links
  // to the program or material each one covers. Only ever called with a
  // post-test review (answer keys come from get_assessment_review).
  const renderMissedList = (missed: MissedQuestion[]) => (
    <div className="mt-8 space-y-4">
      {missed.map(({ question, studentAnswer }) => (
        <div
          key={question.id}
          className="p-4 sm:p-6 rounded-2xl border border-rose-100 bg-rose-50/50"
        >
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />

            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 leading-relaxed">
                {question.text}
              </p>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-rose-100">
                  <p className="text-[9px] font-black uppercase text-rose-500">
                    Your Answer
                  </p>
                  <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {studentAnswer || 'No answer'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100">
                  <p className="text-[9px] font-black uppercase text-emerald-600">
                    Correct Answer
                  </p>
                  <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {question.correct_option}
                  </p>
                </div>
              </div>

              {(question.related_program_id || question.related_material_id) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {question.related_program_id &&
                    programTitles[question.related_program_id] && (
                      <Button
                        onClick={() => navigate(`/student/programs?program=${question.related_program_id}`)}
                        variant="outline"
                        className="h-9 rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        {programTitles[question.related_program_id]}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    )}

                  {question.related_material_id &&
                    materialTitles[question.related_material_id] && (
                      <Button
                        onClick={() => navigate('/student/materials')}
                        variant="outline"
                        className="h-9 rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {materialTitles[question.related_material_id]}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  /*
   * ---------------------------------------------------------
   * RENDER QUESTION
   * ---------------------------------------------------------
   */
  const renderQuestionInput = (question: Question) => {
    const questionKey = String(question.id);
    const selectedAnswer = answers[questionKey];

    /*
     * MULTIPLE CHOICE
     */
    if (question.type === 'mcq') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(question.options || []).map((option) => {
            const selected = selectedAnswer === option;

            return (
              <button
                key={option}
                type="button"
                onClick={() => updateAnswer(question.id, option)}
                className={`
                  w-full text-left p-4 sm:p-5 rounded-2xl border-2
                  transition-all duration-200
                  ${
                    selected
                      ? 'border-indigo-600 bg-indigo-50 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:bg-slate-50'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`
                      mt-0.5 w-5 h-5 rounded-full border-2
                      flex items-center justify-center shrink-0
                      ${
                        selected
                          ? 'border-indigo-600'
                          : 'border-slate-300'
                      }
                    `}
                  >
                    {selected && (
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    )}
                  </div>

                  <span
                    className={`
                      text-sm sm:text-base font-semibold leading-relaxed
                      ${
                        selected
                          ? 'text-indigo-900'
                          : 'text-slate-600'
                      }
                    `}
                  >
                    {option}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    /*
     * SCALE
     */
    if (question.type === 'scale') {
      return (
        <div>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {[1, 2, 3, 4, 5].map((number) => {
              const selected = selectedAnswer === number;

              return (
                <button
                  key={number}
                  type="button"
                  onClick={() => updateAnswer(question.id, number)}
                  className={`
                    h-14 sm:h-16 rounded-2xl font-black text-base sm:text-lg
                    transition-all duration-200
                    ${
                      selected
                        ? 'bg-indigo-600 text-white shadow-lg scale-[1.03]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                    }
                  `}
                >
                  {number}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between mt-3 px-1">
            <span className="text-[10px] sm:text-xs font-bold text-slate-400">
              Lowest
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-slate-400">
              Highest
            </span>
          </div>
        </div>
      );
    }

    /*
     * CHECKBOX (multiple answers)
     */
    if (question.type === 'checkbox') {
      const OTHER_PREFIX = 'Other: ';
      const selectedList: string[] = Array.isArray(selectedAnswer) ? selectedAnswer : [];
      const otherEntry = selectedList.find((v) => v.startsWith(OTHER_PREFIX));
      const otherChecked = otherEntry !== undefined;
      const otherText = otherEntry ? otherEntry.slice(OTHER_PREFIX.length) : '';

      const toggleOption = (option: string) => {
        const next = selectedList.includes(option)
          ? selectedList.filter((v) => v !== option)
          : [...selectedList, option];
        updateAnswer(question.id, next);
      };

      const toggleOther = () => {
        const next = otherChecked
          ? selectedList.filter((v) => !v.startsWith(OTHER_PREFIX))
          : [...selectedList, OTHER_PREFIX];
        updateAnswer(question.id, next);
      };

      const setOtherText = (text: string) => {
        const withoutOther = selectedList.filter((v) => !v.startsWith(OTHER_PREFIX));
        updateAnswer(question.id, [...withoutOther, OTHER_PREFIX + text]);
      };

      const checkRow = (checked: boolean, label: string, onClick: () => void, key: string) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className={`
            w-full text-left p-4 sm:p-5 rounded-2xl border-2
            transition-all duration-200
            ${
              checked
                ? 'border-indigo-600 bg-indigo-50 shadow-md'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:bg-slate-50'
            }
          `}
        >
          <div className="flex items-start gap-3">
            <div
              className={`
                mt-0.5 w-5 h-5 rounded-md border-2
                flex items-center justify-center shrink-0
                ${checked ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}
              `}
            >
              {checked && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <span
              className={`
                text-sm sm:text-base font-semibold leading-relaxed
                ${checked ? 'text-indigo-900' : 'text-slate-600'}
              `}
            >
              {label}
            </span>
          </div>
        </button>
      );

      return (
        <div className="space-y-3">
          {(question.options || []).map((option) =>
            checkRow(selectedList.includes(option), option, () => toggleOption(option), option)
          )}

          {question.allow_other && (
            <div className="space-y-2">
              {checkRow(otherChecked, 'Other', toggleOther, '__other__')}
              {otherChecked && (
                <input
                  type="text"
                  value={otherText}
                  onChange={(event) => setOtherText(event.target.value)}
                  placeholder="Please specify..."
                  className="
                    w-full h-12 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800
                    border border-slate-200 dark:border-slate-700
                    text-sm font-medium text-slate-700 dark:text-slate-200
                    outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100
                  "
                />
              )}
            </div>
          )}
        </div>
      );
    }

    /*
     * TEXT
     */
    if (question.type === 'text') {
      return (
        <textarea
          value={selectedAnswer || ''}
          onChange={(event) =>
            updateAnswer(question.id, event.target.value)
          }
          placeholder="Write your response here..."
          className="
            w-full min-h-[160px] sm:min-h-[190px]
            rounded-2xl bg-slate-50 dark:bg-slate-800
            border border-slate-200 dark:border-slate-700
            p-4 sm:p-6
            text-sm sm:text-base
            font-medium text-slate-700 dark:text-slate-200
            outline-none resize-none
            focus:border-indigo-500
            focus:ring-4 focus:ring-indigo-100
            placeholder:text-slate-300
          "
        />
      );
    }

    /*
     * FALLBACK TEXT INPUT
     */
    return (
      <textarea
        value={selectedAnswer || ''}
        onChange={(event) =>
          updateAnswer(question.id, event.target.value)
        }
        placeholder="Write your response here..."
        className="
          w-full min-h-[160px]
          rounded-2xl bg-slate-50 dark:bg-slate-800
          border border-slate-200 dark:border-slate-700
          p-5
          text-sm sm:text-base
          font-medium text-slate-700 dark:text-slate-200
          outline-none resize-none
          focus:border-indigo-500
          focus:ring-4 focus:ring-indigo-100
        "
      />
    );
  };

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="flex flex-col items-center text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />

          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Loading Assessments
          </p>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * MAIN UI
   * ---------------------------------------------------------
   */
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* HEADER */}
      <div className="mb-8 sm:mb-10">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-indigo-600">
            Student Portal
          </p>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
            Assessment
          </h1>

          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            Take part in guidance assessments to help us
            understand student awareness and experiences.
          </p>
        </div>
      </div>

      {/* VIEW TOGGLE */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <button
          type="button"
          onClick={() => setView('available')}
          className={`h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
            view === 'available'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          Available Assessments
        </button>
        <button
          type="button"
          onClick={() => setView('results')}
          className={`h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
            view === 'results'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          My Results ({results.length})
        </button>
      </div>

      {/* MY RESULTS */}
      {view === 'results' && (
        resultsLoading ? (
          <div className="min-h-[40vh] flex items-center justify-center px-4">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Loading Your Results
              </p>
            </div>
          </div>
        ) : resultsLoadFailed ? (
          <div className="flex flex-col items-center justify-center text-center py-20 sm:py-28 bg-slate-50 dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6">
            <h2 className="text-lg sm:text-xl font-black text-slate-700 dark:text-slate-200">
              Couldn't load your results
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md">
              Check your internet connection and try again.
            </p>
            <Button
              onClick={fetchMyResults}
              className="mt-5 h-11 px-8 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest"
            >
              Try Again
            </Button>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 sm:py-28 bg-slate-50 dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6">
            <FileCheck2 className="w-12 h-12 text-slate-300 mb-4" />
            <h2 className="text-lg sm:text-xl font-black text-slate-700 dark:text-slate-200">
              No Completed Assessments Yet
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md">
              Once you complete an assessment, your results will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result) => (
              <div key={result.id} className="space-y-3">
              <Card
                className="p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <FileCheck2 className="w-6 h-6 text-indigo-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                    {result.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {result.attempt_type && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          result.attempt_type === 'pre'
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {ATTEMPT_LABEL[result.attempt_type]}
                      </span>
                    )}
                    {result.category && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-violet-500">
                        {result.category}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <Clock className="w-3 h-3" />
                      {new Date(result.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {result.attempt_type === 'pre' && !attemptsBySurveyResult[String(result.survey_id)]?.post ? (
                  // Pre-test without a post-test yet: no score, percentage,
                  // or correct/incorrect detail.
                  <div className="text-right shrink-0 max-w-[45%]">
                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-300">Pre-test done</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Your score is shown after the post-test.
                    </p>
                  </div>
                ) : result.percentage !== null && result.percentage !== undefined ? (
                  <div className="text-center shrink-0">
                    <p
                      className={`text-xl font-black ${
                        result.percentage >= 70 ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {result.percentage}%
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      {result.score}/{result.total_scored} Correct
                    </p>
                    {result.attempt_type === 'post' && preTestComparison(result.survey_id) && (
                      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {preTestComparison(result.survey_id)}
                      </p>
                    )}
                    {result.attempt_type === 'post' && (
                      <button
                        type="button"
                        onClick={() => toggleReview(result.survey_id)}
                        aria-expanded={openReviewId === String(result.survey_id)}
                        className="mt-1 min-h-[44px] px-2 inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-indigo-700 dark:text-indigo-300 hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
                      >
                        {reviewLoadingId === String(result.survey_id) && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                        {openReviewId === String(result.survey_id) ? 'Hide review' : 'Review answers'}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Submitted
                  </span>
                )}
              </Card>

              {/* Post-test review: Form B answers against Form B's key. */}
              {result.attempt_type === 'post' && openReviewId === String(result.survey_id) && reviews[openReviewId] && (() => {
                const review = reviews[openReviewId];
                const summary = computeScoreSummary(review.post.questions, review.post.answers || {});
                return (
                  <section
                    aria-label={`Review of ${result.title}`}
                    className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                  >
                    <p className="m-0 text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {summary.missed.length === 0
                        ? 'You answered every post-test question correctly.'
                        : `${summary.missed.length} post-test ${summary.missed.length === 1 ? 'question' : 'questions'} to review. Each links to where you can learn more.`}
                    </p>
                    {summary.missed.length > 0 && renderMissedList(summary.missed)}
                  </section>
                );
              })()}
              </div>
            ))}
          </div>
        )
      )}

      {/* SURVEY LIST */}
      {view === 'available' && (!activeSurvey ? (
        <>
          {surveysLoadFailed ? (
            <div className="flex flex-col items-center justify-center text-center py-20 sm:py-28 bg-slate-50 dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6">
              <h2 className="text-lg sm:text-xl font-black text-slate-700 dark:text-slate-200">
                Couldn't load assessments
              </h2>

              <p className="text-sm text-slate-400 mt-2 max-w-md">
                Check your internet connection and try again.
              </p>

              <Button
                onClick={fetchActiveSurveys}
                className="mt-5 h-11 px-8 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest"
              >
                Try Again
              </Button>
            </div>
          ) : surveys.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 sm:py-28 bg-slate-50 dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6">
              <ClipboardList className="w-12 h-12 text-slate-300 mb-4" />

              <h2 className="text-lg sm:text-xl font-black text-slate-700 dark:text-slate-200">
                No Active Assessments
              </h2>

              <p className="text-sm text-slate-400 mt-2 max-w-md">
                There are currently no active assessments available.
                Please check again later.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
              {surveys.map((survey) => (
                <Card
                  key={survey.id}
                  className="
                    p-5 sm:p-7 lg:p-8
                    rounded-3xl
                    border border-slate-100 dark:border-slate-800
                    shadow-sm
                    bg-white dark:bg-slate-900
                    hover:shadow-xl
                    transition-all duration-300
                  "
                >
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div
                      className="
                        w-12 h-12 sm:w-14 sm:h-14
                        rounded-2xl
                        bg-indigo-50
                        flex items-center justify-center
                        shrink-0
                      "
                    >
                      <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-600" />
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`
                          inline-flex items-center gap-1.5
                          px-3 py-1.5
                          rounded-full
                          text-[9px] sm:text-[10px]
                          font-black uppercase tracking-wider
                          ${
                            survey.is_completed
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-indigo-50 text-indigo-600'
                          }
                        `}
                      >
                        {survey.is_completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <PlayCircle className="w-3.5 h-3.5" />
                        )}

                        {survey.is_completed
                          ? 'Completed'
                          : survey.next_attempt === 'post'
                            ? survey.post_test_lock
                              ? 'Post-Test Locked'
                              : 'Post-Test Ready'
                            : 'Available'}
                      </span>

                      <span
                        className={`
                          px-3 py-1 rounded-full
                          text-[8px] sm:text-[9px]
                          font-black uppercase tracking-wider
                          ${
                            survey.type === 'knowledge'
                              ? 'bg-purple-50 text-purple-600'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }
                        `}
                      >
                        {survey.type === 'knowledge' ? 'Scored' : 'Opinion'}
                      </span>
                    </div>
                  </div>

                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-tight">
                    {survey.title}
                  </h2>

                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {survey.description ||
                      'Please complete this assessment based on your own knowledge and experience.'}
                  </p>

                  <div className="mt-6 flex items-center gap-2 text-xs text-slate-400 font-semibold">
                    <ClipboardList className="w-4 h-4" />

                    <span>
                      {questionCountForAttempt(survey)} question
                      {questionCountForAttempt(survey) !== 1
                        ? 's'
                        : ''}
                    </span>
                  </div>

                  <Button
                    onClick={() => handleStartSurvey(survey)}
                    disabled={survey.is_completed || !!survey.post_test_lock || startingSurveyId !== null}
                    aria-describedby={survey.post_test_lock ? `lock-reason-${survey.id}` : undefined}
                    className={`
                      mt-7 w-full h-12 sm:h-14
                      rounded-2xl
                      font-black uppercase
                      text-[10px] sm:text-xs
                      tracking-widest
                      ${
                        survey.is_completed || survey.post_test_lock
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }
                    `}
                  >
                    {survey.post_test_lock && <Lock className="w-4 h-4 mr-2" aria-hidden="true" />}
                    {String(startingSurveyId) === String(survey.id) && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
                    {survey.is_completed
                      ? 'Already Submitted'
                      : survey.next_attempt === 'pre'
                        ? 'Start Pre-Test'
                        : survey.next_attempt === 'post'
                          ? 'Take Post-Test'
                          : 'Start Assessment'}
                  </Button>

                  {survey.post_test_lock && (
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                      <p
                        id={`lock-reason-${survey.id}`}
                        className="m-0 text-sm font-semibold text-amber-700 dark:text-amber-300"
                      >
                        {survey.post_test_lock}
                      </p>
                      {survey.program_id != null && (
                        <button
                          type="button"
                          onClick={() => navigate(`/student/programs?program=${survey.program_id}`)}
                          className="min-h-[44px] px-1 text-sm font-bold text-indigo-700 dark:text-indigo-300 hover:underline rounded-lg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC] text-left"
                        >
                          Open the materials
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        /*
         * ---------------------------------------------------
         * ACTIVE SURVEY
         * ---------------------------------------------------
         */
        <Card
          className="
            w-full
            border border-slate-100 dark:border-slate-800
            shadow-sm
            rounded-3xl
            bg-white dark:bg-slate-900
            overflow-hidden
          "
        >
          {/* Scroll target for question navigation — offset clears the fixed top nav */}
          <div ref={assessmentTopRef} className="scroll-mt-24" />

          {/* TOP BAR */}
          <div className="p-4 sm:p-6 lg:p-8 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                  Assessment
                </p>

                <h2 className="mt-1 text-lg sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white truncate">
                  {activeSurvey.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={handleCloseSurvey}
                disabled={submitting}
                className="
                  w-9 h-9 sm:w-10 sm:h-10
                  rounded-full
                  bg-slate-50 dark:bg-slate-800
                  flex items-center justify-center
                  text-slate-400
                  hover:text-rose-500
                  hover:bg-rose-50
                  transition-colors
                  shrink-0
                "
                aria-label="Close assessment"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PROGRESS */}
            {!showInstructions && !showReview && !scoreSummary && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Question {currentQuestionIndex + 1} of{' '}
                    {totalQuestions}
                  </span>

                  <span className="text-[10px] sm:text-xs font-black text-indigo-600">
                    {Math.round(progressPercentage)}%
                  </span>
                </div>

                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{
                      width: `${progressPercentage}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* BODY */}
          <div className="p-5 sm:p-8 lg:p-12">
            {/* -------------------------------------------
                INSTRUCTIONS
            ------------------------------------------- */}
            {showInstructions && !scoreSummary && (
              <div className="max-w-3xl mx-auto">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6">
                  <ClipboardList className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600" />
                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 mb-2">
                  {activeSurvey?.next_attempt
                    ? `${ATTEMPT_LABEL[activeSurvey.next_attempt]} · Before You Begin`
                    : 'Before You Begin'}
                </p>

                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-tight">
                  Please answer carefully.
                </h3>

                <p className="mt-4 text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
                  Answer each question based on your own knowledge,
                  understanding, and experience. Take a moment to review
                  your response before moving to the next question.
                </p>

                <div className="mt-6 space-y-3">
                  <InstructionItem>
                    Read each question carefully before answering.
                  </InstructionItem>

                  <InstructionItem>
                    Choose the response that best represents your
                    understanding or experience.
                  </InstructionItem>

                  <InstructionItem>
                    Review your answer before continuing.
                  </InstructionItem>

                  <InstructionItem>
                    You will have an opportunity to review all your
                    answers before final submission.
                  </InstructionItem>
                </div>

                <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-100">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />

                    <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
                      <strong>Reminder:</strong> Please provide your
                      honest response. For knowledge-based questions,
                      select the answer that you believe is correct.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => setShowInstructions(false)}
                  className="
                    mt-8 w-full h-12 sm:h-14
                    rounded-2xl
                    bg-indigo-600 hover:bg-indigo-700
                    text-white
                    font-black uppercase
                    text-[10px] sm:text-xs
                    tracking-widest
                  "
                >
                  Begin Assessment
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}

            {/* -------------------------------------------
                QUESTION
            ------------------------------------------- */}
            {!showInstructions && !showReview && !scoreSummary && currentQuestion && (
              <div className="max-w-3xl mx-auto">
                <div className="flex items-start gap-3 sm:gap-5">
                  <div
                    className="
                      w-9 h-9 sm:w-11 sm:h-11
                      rounded-xl sm:rounded-2xl
                      bg-indigo-600
                      text-white
                      flex items-center justify-center
                      font-black
                      text-sm
                      shrink-0
                    "
                  >
                    {currentQuestionIndex + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Question {currentQuestionIndex + 1}
                    </p>

                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-tight">
                      {currentQuestion.text}
                    </h3>
                  </div>
                </div>

                <div className="mt-8 sm:mt-10">
                  {renderQuestionInput(currentQuestion)}
                </div>

                <div className="mt-5 flex items-center gap-2 text-xs text-slate-400">
                  <Eye className="w-4 h-4" />

                  <span>
                    Review your answer before moving to the next
                    question.
                  </span>
                </div>

                {/* NAVIGATION */}
                <div className="mt-8 sm:mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row gap-3">
                  <Button
                    variant="ghost"
                    onClick={handlePreviousQuestion}
                    disabled={currentQuestionIndex === 0}
                    className="
                      h-12 sm:h-14
                      px-5 sm:px-7
                      rounded-2xl
                      font-black uppercase
                      text-[10px]
                      tracking-wider
                      disabled:opacity-40
                    "
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>

                  <Button
                    onClick={handleNextQuestion}
                    className="
                      flex-1
                      h-12 sm:h-14
                      rounded-2xl
                      bg-slate-900
                      hover:bg-indigo-600
                      text-white
                      font-black uppercase
                      text-[10px] sm:text-xs
                      tracking-widest
                    "
                  >
                    {currentQuestionIndex === totalQuestions - 1
                      ? 'Review Answers'
                      : 'Next Question'}

                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* -------------------------------------------
                REVIEW
            ------------------------------------------- */}
            {!showInstructions && showReview && !scoreSummary && (
              <div className="max-w-4xl mx-auto">
                <div className="text-center max-w-2xl mx-auto">
                  <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
                    <Eye className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600" />
                  </div>

                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                    Final Review
                  </p>

                  <h3 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white">
                    Review Your Answers
                  </h3>

                  <p className="mt-3 text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
                    Please review your responses carefully before
                    submitting. You can still edit any answer.
                  </p>
                </div>

                <div className="mt-8 space-y-4">
                  {questions.map((question, index) => {
                    const answer = answers[String(question.id)];

                    return (
                      <div
                        key={question.id}
                        className="
                          p-4 sm:p-6
                          rounded-2xl
                          border border-slate-200 dark:border-slate-700
                          bg-white dark:bg-slate-900
                        "
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="
                              w-8 h-8
                              rounded-xl
                              bg-slate-100 dark:bg-slate-800
                              text-slate-600 dark:text-slate-300
                              flex items-center justify-center
                              text-xs font-black
                              shrink-0
                            "
                          >
                            {index + 1}
                          </span>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 leading-relaxed">
                              {question.text}
                            </p>

                            <div className="mt-3 p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
                              <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                                {(() => {
                                  if (Array.isArray(answer)) {
                                    return answer.length > 0
                                      ? answer.join(', ')
                                      : 'No answer provided';
                                  }
                                  return answer !== undefined &&
                                    answer !== null &&
                                    String(answer).trim() !== ''
                                    ? String(answer)
                                    : 'No answer provided';
                                })()}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleEditQuestion(index)}
                            className="
                              text-[9px] sm:text-[10px]
                              font-black uppercase
                              tracking-wider
                              text-indigo-600
                              hover:text-indigo-800
                              shrink-0
                            "
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-100">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />

                    <div>
                      <p className="text-sm font-black text-amber-900">
                        Before you submit
                      </p>

                      <p className="mt-1 text-xs sm:text-sm text-amber-800 leading-relaxed">
                        Make sure your answers accurately represent your
                        own understanding or experience. Once submitted,
                        your answers cannot be changed.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowReview(false);
                      setCurrentQuestionIndex(totalQuestions - 1);
                      scrollToAssessmentTop();
                    }}
                    className="
                      h-12 sm:h-14
                      rounded-2xl
                      font-black uppercase
                      text-[10px]
                      tracking-wider
                    "
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back to Questions
                  </Button>

                  <Button
                    onClick={() => setShowSubmitConfirmation(true)}
                    disabled={unansweredQuestions.length > 0}
                    className="
                      flex-1
                      h-12 sm:h-14
                      rounded-2xl
                      bg-indigo-600
                      hover:bg-indigo-700
                      text-white
                      font-black uppercase
                      text-[10px] sm:text-xs
                      tracking-widest
                      disabled:bg-slate-200 dark:bg-slate-700
                      disabled:text-slate-400
                    "
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Submit Assessment
                  </Button>
                </div>
              </div>
            )}

            {/* -------------------------------------------
                RESULTS (knowledge assessments only)
            ------------------------------------------- */}
            {scoreSummary && (
              <div className="max-w-3xl mx-auto">
                {submittedAttempt === 'pre' ? (
                // Pre-test: no score, percentage, or correct/incorrect
                // detail until the post-test exists.
                <div className="text-center max-w-xl mx-auto">
                  <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center mb-6 bg-indigo-50 dark:bg-indigo-500/10">
                    <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-600" />
                  </div>

                  <h3 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                    Pre-test done
                  </h3>

                  <p className="mt-2 text-base font-semibold text-slate-500 dark:text-slate-400">
                    Submitted {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>

                  <p className="mt-4 text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
                    Your score is shown after the post-test.
                  </p>
                </div>
                ) : (
                <div className="text-center max-w-xl mx-auto">
                  <div
                    className={`mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center mb-6 ${
                      (scoreSummary.percentage ?? 0) >= 70
                        ? 'bg-emerald-50'
                        : 'bg-amber-50'
                    }`}
                  >
                    <Trophy
                      className={`w-8 h-8 sm:w-10 sm:h-10 ${
                        (scoreSummary.percentage ?? 0) >= 70
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                      }`}
                    />
                  </div>

                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 mb-2">
                    {submittedAttempt ? `${ATTEMPT_LABEL[submittedAttempt]} Complete` : 'Assessment Complete'}
                  </p>

                  <h3 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                    {scoreSummary.correct} / {scoreSummary.total} Correct
                  </h3>

                  <p className="mt-2 text-lg sm:text-xl font-black text-indigo-600">
                    {scoreSummary.percentage}% Score
                  </p>

                  {submittedAttempt === 'post' && activeSurvey && preTestComparison(activeSurvey.id) && (
                    <p className="mt-2 text-sm sm:text-base font-semibold text-slate-600 dark:text-slate-300">
                      {preTestComparison(activeSurvey.id)}
                    </p>
                  )}

                  <p className="mt-4 text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
                    {scoreSummary.missed.length === 0
                      ? 'Perfect score! You answered every knowledge question correctly.'
                      : "Here's what to review — each item below links to where you can learn more."}
                  </p>
                </div>
                )}

                {/* Pre-test: no answer key — point the student to the
                    materials, then back here for the post-test. */}
                {submittedAttempt === 'pre' && (
                  <div className="mt-8 p-5 sm:p-6 rounded-2xl bg-indigo-50 border border-indigo-100">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                      Next Step
                    </p>
                    <p className="mt-2 text-sm sm:text-base font-semibold text-slate-700 leading-relaxed">
                      Read the program's IEC materials, then return to Assessment to take the Post-Test.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        onClick={() => navigate('/student/materials')}
                        variant="outline"
                        className="h-9 rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        IEC Materials
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        onClick={() => navigate('/student/programs')}
                        variant="outline"
                        className="h-9 rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Programs
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {submittedAttempt !== 'pre' && scoreSummary.missed.length > 0 && renderMissedList(scoreSummary.missed)}

                <Button
                  onClick={handleCloseSurvey}
                  className="mt-8 w-full h-12 sm:h-14 rounded-2xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] sm:text-xs tracking-widest"
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        </Card>
      ))}

      {/* -----------------------------------------------
          SUBMISSION CONFIRMATION MODAL
      ------------------------------------------------ */}
      {showSubmitConfirmation && (
        <div
          className="
            fixed inset-0 z-50
            bg-slate-950/50
            backdrop-blur-sm
            flex items-center justify-center
            p-4
          "
        >
          <div
            className="
              w-full max-w-md
              bg-white dark:bg-slate-900
              rounded-3xl
              shadow-2xl
              p-6 sm:p-8
              animate-in fade-in zoom-in-95 duration-200
            "
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-indigo-600" />
            </div>

            <h3 className="mt-5 text-xl sm:text-2xl font-black text-slate-900 dark:text-white text-center">
              Submit Your Response?
            </h3>

            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              You have reviewed your answers. Are you sure you want to
              submit this assessment?
            </p>

            <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                <strong className="text-slate-700 dark:text-slate-200">
                  Please note:
                </strong>{' '}
                After submission, your responses can no longer be
                changed.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowSubmitConfirmation(false)}
                disabled={submitting}
                className="
                  h-12
                  rounded-2xl
                  bg-slate-50 dark:bg-slate-800
                  font-black uppercase
                  text-[10px]
                  tracking-wider
                "
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Review Again
              </Button>

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="
                  h-12
                  rounded-2xl
                  bg-indigo-600
                  hover:bg-indigo-700
                  text-white
                  font-black uppercase
                  text-[10px]
                  tracking-wider
                "
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Yes, Submit
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * ---------------------------------------------------------
 * SMALL INSTRUCTION ITEM
 * ---------------------------------------------------------
 */
function InstructionItem({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        {children}
      </p>
    </div>
  );
}