import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

import {
  ClipboardList,
  CheckCircle2,
  PlayCircle,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  Send,
  RotateCcw,
} from 'lucide-react';

interface Question {
  id: string | number;
  text: string;
  type: 'mcq' | 'scale' | 'text' | string;
  options?: string[];
  required?: boolean;
}

interface Survey {
  id: string | number;
  title: string;
  description?: string | null;
  questions_data?: Question[];
  status?: string;
  created_at?: string;
  is_completed?: boolean;
}

export default function QuizzesSurveys() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSurveyId, setActiveSurveyId] = useState<string | number | null>(
    null
  );

  const [answers, setAnswers] = useState<Record<string, any>>({});

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [showInstructions, setShowInstructions] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const { toast } = useToast();

  /*
   * MANUAL USER ID
   * Keep this consistent with your existing database structure.
   */
  const CURRENT_USER_ID = '3';

  useEffect(() => {
    fetchActiveSurveys();
  }, []);

  /*
   * ---------------------------------------------------------
   * FETCH ACTIVE SURVEYS
   * ---------------------------------------------------------
   */
  async function fetchActiveSurveys() {
    try {
      setLoading(true);

      const { data: surveysData, error: surveyError } = await supabase
        .from('surveys')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (surveyError) throw surveyError;

      const { data: responsesData, error: responsesError } = await supabase
        .from('survey_responses')
        .select('survey_id')
        .eq('user_id', CURRENT_USER_ID);

      if (responsesError) {
        console.warn('Unable to fetch completed surveys:', responsesError);
      }

      const completedIds =
        responsesData?.map((response) => String(response.survey_id)) || [];

      const formattedSurveys: Survey[] =
        (surveysData || []).map((survey: any) => ({
          ...survey,
          is_completed: completedIds.includes(String(survey.id)),
        })) || [];

      setSurveys(formattedSurveys);
    } catch (error: any) {
      console.error('Fetch Error:', error);

      toast({
        title: 'Unable to Load Surveys',
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
  const activeSurvey = useMemo(() => {
    if (activeSurveyId === null) return null;

    return (
      surveys.find(
        (survey) => String(survey.id) === String(activeSurveyId)
      ) || null
    );
  }, [activeSurveyId, surveys]);

  const questions: Question[] = useMemo(() => {
    if (!activeSurvey?.questions_data) return [];

    return activeSurvey.questions_data;
  }, [activeSurvey]);

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
  const handleStartSurvey = (survey: Survey) => {
    if (survey.is_completed) return;

    setActiveSurveyId(survey.id);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowInstructions(true);
    setShowReview(false);
    setShowSubmitConfirmation(false);
  };

  /*
   * ---------------------------------------------------------
   * CLOSE SURVEY
   * ---------------------------------------------------------
   */
  const handleCloseSurvey = () => {
    if (submitting) return;

    setActiveSurveyId(null);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowInstructions(false);
    setShowReview(false);
    setShowSubmitConfirmation(false);
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    /*
     * Last question:
     * Go to review screen instead of submitting immediately.
     */
    setShowReview(true);
  };

  /*
   * ---------------------------------------------------------
   * PREVIOUS QUESTION
   * ---------------------------------------------------------
   */
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex <= 0) return;

    setCurrentQuestionIndex((previous) => previous - 1);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  /*
   * ---------------------------------------------------------
   * REVIEW ANSWERS
   * ---------------------------------------------------------
   */
  const handleOpenReview = () => {
    if (unansweredQuestions.length > 0) {
      toast({
        title: 'Incomplete Assessment',
        description: `Please answer ${unansweredQuestions.length} unanswered question${
          unansweredQuestions.length > 1 ? 's' : ''
        } before reviewing your responses.`,
        variant: 'destructive',
      });

      const firstUnansweredIndex = questions.findIndex(
        (question) => !hasAnswer(question)
      );

      if (firstUnansweredIndex >= 0) {
        setCurrentQuestionIndex(firstUnansweredIndex);
        setShowReview(false);
      }

      return;
    }

    setShowReview(true);
  };

  /*
   * ---------------------------------------------------------
   * EDIT ANSWER FROM REVIEW
   * ---------------------------------------------------------
   */
  const handleEditQuestion = (index: number) => {
    setCurrentQuestionIndex(index);
    setShowReview(false);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
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

    try {
      setSubmitting(true);

      const responsePayload = {
        survey_id: activeSurvey.id,
        user_id: CURRENT_USER_ID,
        answers: answers,
      };

      const { error } = await supabase
        .from('survey_responses')
        .insert([responsePayload]);

      if (error) throw error;

      toast({
        title: 'Assessment Submitted',
        description:
          'Your response has been successfully recorded. Thank you for participating!',
      });

      setShowSubmitConfirmation(false);
      setShowReview(false);
      setActiveSurveyId(null);
      setAnswers({});
      setCurrentQuestionIndex(0);

      await fetchActiveSurveys();
    } catch (error: any) {
      console.error('Submission Error:', error);

      toast({
        title: 'Submission Failed',
        description:
          error?.message ||
          'We were unable to submit your response. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

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
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
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
                        : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
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
            rounded-2xl bg-slate-50
            border border-slate-200
            p-4 sm:p-6
            text-sm sm:text-base
            font-medium text-slate-700
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
          rounded-2xl bg-slate-50
          border border-slate-200
          p-5
          text-sm sm:text-base
          font-medium text-slate-700
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

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Assessments <span className="text-indigo-600">&</span> Surveys
          </h1>

          <p className="text-sm sm:text-base text-slate-500 max-w-2xl leading-relaxed">
            Take part in guidance assessments and surveys to help us
            understand student awareness and experiences.
          </p>
        </div>
      </div>

      {/* SURVEY LIST */}
      {!activeSurvey ? (
        <>
          {surveys.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 sm:py-28 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 px-6">
              <ClipboardList className="w-12 h-12 text-slate-300 mb-4" />

              <h2 className="text-lg sm:text-xl font-black text-slate-700">
                No Active Assessments
              </h2>

              <p className="text-sm text-slate-400 mt-2 max-w-md">
                There are currently no active surveys available.
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
                    border border-slate-100
                    shadow-sm
                    bg-white
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

                      {survey.is_completed ? 'Completed' : 'Available'}
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
                    {survey.title}
                  </h2>

                  <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                    {survey.description ||
                      'Please complete this assessment based on your own knowledge and experience.'}
                  </p>

                  <div className="mt-6 flex items-center gap-2 text-xs text-slate-400 font-semibold">
                    <ClipboardList className="w-4 h-4" />

                    <span>
                      {survey.questions_data?.length || 0} question
                      {(survey.questions_data?.length || 0) !== 1
                        ? 's'
                        : ''}
                    </span>
                  </div>

                  <Button
                    onClick={() => handleStartSurvey(survey)}
                    disabled={survey.is_completed}
                    className={`
                      mt-7 w-full h-12 sm:h-14
                      rounded-2xl
                      font-black uppercase
                      text-[10px] sm:text-xs
                      tracking-widest
                      ${
                        survey.is_completed
                          ? 'bg-slate-100 text-slate-400'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }
                    `}
                  >
                    {survey.is_completed
                      ? 'Already Submitted'
                      : 'Start Assessment'}
                  </Button>
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
            border border-slate-100
            shadow-sm
            rounded-3xl
            bg-white
            overflow-hidden
          "
        >
          {/* TOP BAR */}
          <div className="p-4 sm:p-6 lg:p-8 border-b border-slate-100">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                  Assessment
                </p>

                <h2 className="mt-1 text-lg sm:text-xl lg:text-2xl font-black text-slate-900 truncate">
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
                  bg-slate-50
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
            {!showInstructions && !showReview && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500">
                    Question {currentQuestionIndex + 1} of{' '}
                    {totalQuestions}
                  </span>

                  <span className="text-[10px] sm:text-xs font-black text-indigo-600">
                    {Math.round(progressPercentage)}%
                  </span>
                </div>

                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
            {showInstructions && (
              <div className="max-w-3xl mx-auto">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6">
                  <ClipboardList className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600" />
                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 mb-2">
                  Before You Begin
                </p>

                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 leading-tight">
                  Please answer carefully.
                </h3>

                <p className="mt-4 text-sm sm:text-base text-slate-500 leading-relaxed">
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
            {!showInstructions && !showReview && currentQuestion && (
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

                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
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
                <div className="mt-8 sm:mt-10 pt-6 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-3">
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
            {!showInstructions && showReview && (
              <div className="max-w-4xl mx-auto">
                <div className="text-center max-w-2xl mx-auto">
                  <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
                    <Eye className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600" />
                  </div>

                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                    Final Review
                  </p>

                  <h3 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900">
                    Review Your Answers
                  </h3>

                  <p className="mt-3 text-sm sm:text-base text-slate-500 leading-relaxed">
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
                          border border-slate-200
                          bg-white
                        "
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="
                              w-8 h-8
                              rounded-xl
                              bg-slate-100
                              text-slate-600
                              flex items-center justify-center
                              text-xs font-black
                              shrink-0
                            "
                          >
                            {index + 1}
                          </span>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm sm:text-base font-black text-slate-800 leading-relaxed">
                              {question.text}
                            </p>

                            <div className="mt-3 p-3 sm:p-4 rounded-xl bg-slate-50">
                              <p className="text-xs sm:text-sm font-semibold text-slate-600 whitespace-pre-wrap break-words">
                                {answer !== undefined &&
                                answer !== null &&
                                String(answer).trim() !== ''
                                  ? String(answer)
                                  : 'No answer provided'}
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
                      disabled:bg-slate-200
                      disabled:text-slate-400
                    "
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Submit Assessment
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

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
              bg-white
              rounded-3xl
              shadow-2xl
              p-6 sm:p-8
              animate-in fade-in zoom-in-95 duration-200
            "
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-indigo-600" />
            </div>

            <h3 className="mt-5 text-xl sm:text-2xl font-black text-slate-900 text-center">
              Submit Your Response?
            </h3>

            <p className="mt-3 text-sm text-slate-500 text-center leading-relaxed">
              You have reviewed your answers. Are you sure you want to
              submit this assessment?
            </p>

            <div className="mt-4 p-4 rounded-2xl bg-slate-50">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                <strong className="text-slate-700">
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
                  bg-slate-50
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

      <p className="text-sm text-slate-600 leading-relaxed">
        {children}
      </p>
    </div>
  );
}