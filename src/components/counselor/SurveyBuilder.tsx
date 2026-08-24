import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Plus,
  Edit,
  Trash2,
  Save,
  Loader2,
  ChevronLeft,
  ClipboardList,
  X,
  Copy,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  FileText,
  Users,
  BarChart3,
  CalendarDays,
  GripVertical,
  Settings2,
} from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

type QuestionType = "mcq" | "scale" | "text";

type Question = {
  id: string | number;
  text: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
};

type Survey = {
  id: number;
  title: string;
  description?: string | null;
  category?: string | null;
  status: "draft" | "active" | "closed";
  questions_data: Question[];
  created_at?: string;
  updated_at?: string;
  start_date?: string | null;
  end_date?: string | null;
};

const CATEGORIES = [
  "Counseling Services",
  "Career Guidance",
  "Student Development",
  "Guidance Program Evaluation",
  "Counseling Evaluation",
  "Student Satisfaction",
  "Other",
];

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "mcq", label: "Multiple Choice" },
  { value: "scale", label: "Rating Scale 1–5" },
  { value: "text", label: "Text Response" },
];

function createQuestion(): Question {
  return {
    id: `${Date.now()}-${Math.random()}`,
    text: "",
    type: "mcq",
    options: ["Option 1", "Option 2"],
    required: true,
  };
}

export default function SurveyBuilder() {
  const { toast } = useToast();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [viewingResponses, setViewingResponses] =
    useState<Survey | null>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteTargetTitle, setDeleteTargetTitle] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchSurveys();
  }, []);

  async function fetchSurveys() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("surveys")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setSurveys((data || []) as Survey[]);
    } catch (err: any) {
      toast({
        title: "Database Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredSurveys = useMemo(() => {
    return surveys.filter((survey) => {
      const matchesSearch =
        survey.title?.toLowerCase().includes(search.toLowerCase()) ||
        survey.description?.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === "All" ||
        survey.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [surveys, search, categoryFilter]);

  const activeCount = surveys.filter((s) => s.status === "active").length;
  const draftCount = surveys.filter((s) => s.status === "draft").length;
  const closedCount = surveys.filter((s) => s.status === "closed").length;

  async function createSurvey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setCreating(true);

      const formData = new FormData(e.currentTarget);

      const title = String(formData.get("title") || "").trim();
      const description = String(formData.get("description") || "").trim();
      const category = String(formData.get("category") || "");

      if (!title) {
        toast({
          title: "Survey title required",
          description: "Please provide a title.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("surveys").insert([
        {
          title,
          description,
          category,
          status: "draft",
          questions_data: [],
        },
      ]);

      if (error) throw error;

      toast({
        title: "Survey Created",
        description: "The survey was created as a draft.",
      });

      setIsCreateOpen(false);
      await fetchSurveys();
    } catch (err: any) {
      toast({
        title: "Creation Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  function openEditor(survey: Survey) {
    setEditingSurvey(survey);

    setQuestions(
      Array.isArray(survey.questions_data)
        ? survey.questions_data
        : []
    );
  }

  async function saveSurveyContent() {
    if (!editingSurvey) return;

    try {
      setIsSaving(true);

      const cleanQuestions = questions.filter(
        (q) => q.text.trim().length > 0
      );

      const { error } = await supabase
        .from("surveys")
        .update({
          questions_data: cleanQuestions,
        })
        .eq("id", editingSurvey.id);

      if (error) throw error;

      toast({
        title: "Survey Updated",
        description: "Your survey questions were saved successfully.",
      });

      setEditingSurvey(null);
      await fetchSurveys();
    } catch (err: any) {
      toast({
        title: "Save Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSurveyInfo(
    field: "title" | "description" | "category",
    value: string
  ) {
    if (!editingSurvey) return;

    setEditingSurvey({
      ...editingSurvey,
      [field]: value,
    });

    await supabase
      .from("surveys")
      .update({ [field]: value })
      .eq("id", editingSurvey.id);
  }

  async function toggleSurveyStatus(survey: Survey) {
    try {
      let newStatus: Survey["status"];

      if (survey.status === "draft") {
        newStatus = "active";
      } else if (survey.status === "active") {
        newStatus = "closed";
      } else {
        newStatus = "active";
      }

      const { error } = await supabase
        .from("surveys")
        .update({ status: newStatus })
        .eq("id", survey.id);

      if (error) throw error;

      await fetchSurveys();

      toast({
        title:
          newStatus === "active"
            ? "Survey Published"
            : newStatus === "closed"
            ? "Survey Closed"
            : "Survey Updated",
        description:
          newStatus === "active"
            ? "Students can now submit responses."
            : "The survey is no longer accepting submissions.",
      });
    } catch (err: any) {
      toast({
        title: "Status Error",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function duplicateSurvey(survey: Survey) {
    try {
      const { error } = await supabase.from("surveys").insert([
        {
          title: `${survey.title} - Copy`,
          description: survey.description || "",
          category: survey.category || "Other",
          status: "draft",
          questions_data: survey.questions_data || [],
        },
      ]);

      if (error) throw error;

      await fetchSurveys();

      toast({
        title: "Survey Duplicated",
        description: "A new draft copy was created.",
      });
    } catch (err: any) {
      toast({
        title: "Duplicate Error",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  function triggerDeleteConfirm(id: number, title: string) {
    setDeleteTargetId(id);
    setDeleteTargetTitle(title);
    setIsDeleteOpen(true);
  }

  async function handleExecuteDelete() {
    if (!deleteTargetId) return;

    try {
      const { error } = await supabase
        .from("surveys")
        .delete()
        .eq("id", deleteTargetId);

      if (error) throw error;

      toast({
        title: "Survey Deleted",
        description: "The survey has been removed.",
      });

      setIsDeleteOpen(false);
      await fetchSurveys();
    } catch (err: any) {
      toast({
        title: "Delete Error",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function fetchResponses(survey: Survey) {
    try {
      setLoadingResponses(true);
      setViewingResponses(survey);

      const { data: responseData, error: responseError } = await supabase
        .from("survey_responses")
        .select("*")
        .eq("survey_id", survey.id)
        .order("created_at", { ascending: false });

      if (responseError) throw responseError;

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name");

      const merged = (responseData || []).map((response: any) => {
        const student = profilesData?.find(
          (profile: any) =>
            String(profile.id) === String(response.user_id)
        );

        return {
          ...response,
          studentName:
            student?.full_name ||
            `Student ID: ${String(response.user_id || "")}`,
        };
      });

      setResponses(merged);
    } catch (err: any) {
      toast({
        title: "Response Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoadingResponses(false);
    }
  }

  function updateQuestion(
    questionIndex: number,
    updates: Partial<Question>
  ) {
    setQuestions((previous) =>
      previous.map((question, index) =>
        index === questionIndex
          ? { ...question, ...updates }
          : question
      )
    );
  }

  function changeQuestionType(
    questionIndex: number,
    type: QuestionType
  ) {
    const question = questions[questionIndex];

    const updated: Question = {
      ...question,
      type,
    };

    if (type === "mcq") {
      updated.options =
        question.options?.length
          ? question.options
          : ["Option 1", "Option 2"];
    } else {
      delete updated.options;
    }

    updateQuestion(questionIndex, updated);
  }

  function addOption(questionIndex: number) {
    const question = questions[questionIndex];

    updateQuestion(questionIndex, {
      options: [...(question.options || []), "New Option"],
    });
  }

  function updateOption(
    questionIndex: number,
    optionIndex: number,
    value: string
  ) {
    const question = questions[questionIndex];
    const options = [...(question.options || [])];

    options[optionIndex] = value;

    updateQuestion(questionIndex, { options });
  }

  function removeOption(
    questionIndex: number,
    optionIndex: number
  ) {
    const question = questions[questionIndex];

    const options = (question.options || []).filter(
      (_, index) => index !== optionIndex
    );

    updateQuestion(questionIndex, { options });
  }

  function removeQuestion(questionId: string | number) {
    setQuestions((previous) =>
      previous.filter((question) => question.id !== questionId)
    );
  }

  function getStatusLabel(status: Survey["status"]) {
    if (status === "active") return "Published";
    if (status === "closed") return "Closed";
    return "Draft";
  }

  function getStatusClass(status: Survey["status"]) {
    if (status === "active") {
      return "bg-emerald-50 text-emerald-600";
    }

    if (status === "closed") {
      return "bg-slate-100 text-slate-500";
    }

    return "bg-amber-50 text-amber-600";
  }

  /* =========================================================
     EDITOR
  ========================================================= */

  if (editingSurvey) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* HEADER */}
          <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-900 rounded-3xl shadow-xl p-6 md:p-10 text-white">
            <Button
              variant="ghost"
              onClick={() => setEditingSurvey(null)}
              className="text-indigo-100 hover:text-white hover:bg-white/10 mb-5"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Survey Hub
            </Button>

            <div className="grid lg:grid-cols-[1fr_280px] gap-8">

              <div>
                <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest mb-2">
                  Counselor / Admin Survey Editor
                </p>

                <Input
                  value={editingSurvey.title}
                  onChange={(e) =>
                    setEditingSurvey({
                      ...editingSurvey,
                      title: e.target.value,
                    })
                  }
                  onBlur={() =>
                    updateSurveyInfo(
                      "title",
                      editingSurvey.title
                    )
                  }
                  className="bg-white/10 border-white/20 text-white text-2xl md:text-4xl font-black h-auto py-3 rounded-xl"
                />

                <textarea
                  value={editingSurvey.description || ""}
                  onChange={(e) =>
                    setEditingSurvey({
                      ...editingSurvey,
                      description: e.target.value,
                    })
                  }
                  onBlur={() =>
                    updateSurveyInfo(
                      "description",
                      editingSurvey.description || ""
                    )
                  }
                  placeholder="Add instructions or description for students..."
                  className="mt-4 w-full min-h-[90px] bg-white/10 border border-white/20 rounded-xl p-4 text-sm text-white placeholder:text-indigo-200 outline-none resize-none"
                />
              </div>

              <div className="bg-white/10 rounded-2xl p-5">
                <label className="text-[9px] font-black uppercase text-indigo-200">
                  Survey Category
                </label>

                <select
                  value={editingSurvey.category || "Other"}
                  onChange={(e) =>
                    updateSurveyInfo(
                      "category",
                      e.target.value
                    )
                  }
                  className="mt-2 w-full h-11 rounded-xl bg-white text-slate-800 px-3 font-bold text-xs outline-none"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <div className="mt-5">
                  <p className="text-[9px] uppercase font-black text-indigo-200">
                    Current Status
                  </p>

                  <p className="mt-1 font-black text-lg">
                    {getStatusLabel(editingSurvey.status)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col md:flex-row gap-3">
              <Button
                onClick={saveSurveyContent}
                disabled={isSaving}
                className="bg-white text-indigo-900 hover:bg-indigo-50 h-12 px-7 rounded-xl font-black uppercase text-xs"
              >
                {isSaving ? (
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Survey
              </Button>

              <Button
                onClick={() => toggleSurveyStatus(editingSurvey)}
                className="bg-indigo-500 hover:bg-indigo-400 h-12 px-7 rounded-xl font-black uppercase text-xs"
              >
                {editingSurvey.status === "active" ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" />
                    Close Survey
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Publish Survey
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* QUESTIONS */}
          <div className="space-y-5 pb-20">

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Survey Questions
                </h2>
                <p className="text-xs font-medium text-slate-400">
                  Create the questionnaire students will answer.
                </p>
              </div>

              <div className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-black">
                {questions.length} Questions
              </div>
            </div>

            {questions.map((question, index) => (
              <Card
                key={question.id}
                className="p-5 md:p-7 rounded-3xl border-none shadow-sm bg-white"
              >
                <div className="flex gap-4">

                  <div className="hidden md:flex pt-3 text-slate-300">
                    <GripVertical className="w-5 h-5" />
                  </div>

                  <div className="flex-1 space-y-5">

                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                          {index + 1}
                        </div>

                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Question {index + 1}
                        </span>
                      </div>

                      <Button
                        variant="ghost"
                        onClick={() =>
                          removeQuestion(question.id)
                        }
                        className="text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <Input
                      value={question.text}
                      onChange={(e) =>
                        updateQuestion(index, {
                          text: e.target.value,
                        })
                      }
                      placeholder="Enter your question..."
                      className="h-14 rounded-xl bg-slate-50 border-none font-bold text-slate-800"
                    />

                    <div className="flex flex-wrap gap-2">
                      {QUESTION_TYPES.map((type) => (
                        <Button
                          key={type.value}
                          variant="outline"
                          onClick={() =>
                            changeQuestionType(
                              index,
                              type.value
                            )
                          }
                          className={
                            question.type === type.value
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : ""
                          }
                        >
                          {type.label}
                        </Button>
                      ))}
                    </div>

                    {question.type === "mcq" && (
                      <div className="space-y-3 border-l-4 border-indigo-100 pl-4">
                        {(question.options || []).map(
                          (option, optionIndex) => (
                            <div
                              key={optionIndex}
                              className="flex gap-2"
                            >
                              <Input
                                value={option}
                                onChange={(e) =>
                                  updateOption(
                                    index,
                                    optionIndex,
                                    e.target.value
                                  )
                                }
                                className="bg-slate-50 border-none rounded-xl"
                              />

                              <Button
                                variant="ghost"
                                onClick={() =>
                                  removeOption(
                                    index,
                                    optionIndex
                                  )
                                }
                                className="text-slate-300 hover:text-rose-500"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )
                        )}

                        <Button
                          variant="ghost"
                          onClick={() => addOption(index)}
                          className="text-indigo-600 font-black uppercase text-[9px]"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Option
                        </Button>
                      </div>
                    )}

                    {question.type === "scale" && (
                      <div className="bg-indigo-50 rounded-xl p-5">
                        <div className="flex justify-between text-xs font-black text-indigo-700">
                          <span>1 — Strongly Disagree</span>
                          <span>5 — Strongly Agree</span>
                        </div>

                        <div className="grid grid-cols-5 gap-2 mt-4">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <div
                              key={value}
                              className="h-10 bg-white rounded-lg flex items-center justify-center font-black text-indigo-600"
                            >
                              {value}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {question.type === "text" && (
                      <div className="h-24 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-xs font-bold">
                        Student text response field
                      </div>
                    )}

                    <label className="flex items-center gap-3 cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={question.required !== false}
                        onChange={(e) =>
                          updateQuestion(index, {
                            required: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-indigo-600"
                      />

                      <span className="text-xs font-bold text-slate-500">
                        Required question
                      </span>
                    </label>

                  </div>
                </div>
              </Card>
            ))}

            <Button
              variant="outline"
              onClick={() =>
                setQuestions([
                  ...questions,
                  createQuestion(),
                ])
              }
              className="w-full h-16 rounded-2xl border-dashed border-2 font-black uppercase text-xs text-indigo-600 hover:bg-indigo-50"
            >
              <Plus className="mr-2 h-5 w-5" />
              Add Question
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     MAIN SURVEY HUB
  ========================================================= */

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-slate-100">
          <div className="flex flex-col lg:flex-row justify-between gap-6">

            <div>
              <div className="flex items-center gap-2 text-indigo-600 mb-2">
                <ClipboardList className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  OMSC Guidance & Testing Center
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
                Survey <span className="text-indigo-600">Hub</span>
              </h1>

              <p className="mt-2 text-sm text-slate-400 font-medium">
                Create, manage, publish, and review student surveys.
              </p>
            </div>

            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 h-14 px-7 rounded-2xl font-black uppercase text-xs"
            >
              <Plus className="mr-2 w-4 h-4" />
              Create New Survey
            </Button>
          </div>
        </div>

        {/* STATISTICS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          <Card className="p-5 rounded-2xl border-none shadow-sm">
            <div className="flex justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400">
                  Total Surveys
                </p>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {surveys.length}
                </p>
              </div>
              <FileText className="text-indigo-500" />
            </div>
          </Card>

          <Card className="p-5 rounded-2xl border-none shadow-sm">
            <div className="flex justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400">
                  Published
                </p>
                <p className="text-3xl font-black text-emerald-600 mt-1">
                  {activeCount}
                </p>
              </div>
              <Eye className="text-emerald-500" />
            </div>
          </Card>

          <Card className="p-5 rounded-2xl border-none shadow-sm">
            <div className="flex justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400">
                  Drafts
                </p>
                <p className="text-3xl font-black text-amber-500 mt-1">
                  {draftCount}
                </p>
              </div>
              <Edit className="text-amber-500" />
            </div>
          </Card>

          <Card className="p-5 rounded-2xl border-none shadow-sm">
            <div className="flex justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400">
                  Closed
                </p>
                <p className="text-3xl font-black text-slate-500 mt-1">
                  {closedCount}
                </p>
              </div>
              <EyeOff className="text-slate-400" />
            </div>
          </Card>
        </div>

        {/* FILTER */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-3">

          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search surveys..."
              className="pl-11 h-12 bg-slate-50 border-none rounded-xl"
            />
          </div>

          <div className="relative md:w-64">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />

            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value)
              }
              className="w-full h-12 bg-slate-50 rounded-xl pl-11 pr-4 text-xs font-bold text-slate-600 outline-none"
            >
              <option>All</option>
              {CATEGORIES.map((category) => (
                <option key={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* SURVEYS */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : filteredSurveys.length === 0 ? (
          <Card className="rounded-3xl border-dashed border-2 p-16 text-center">
            <ClipboardList className="mx-auto w-10 h-10 text-slate-300" />
            <h3 className="mt-4 font-black text-slate-700">
              No Surveys Found
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Create your first Guidance & Counseling survey.
            </p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">

            {filteredSurveys.map((survey) => (
              <Card
                key={survey.id}
                className="p-6 rounded-3xl border-none shadow-sm hover:shadow-xl transition-all bg-white"
              >

                <div className="flex justify-between items-start gap-3">

                  <span
                    className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase ${getStatusClass(
                      survey.status
                    )}`}
                  >
                    {getStatusLabel(survey.status)}
                  </span>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        fetchResponses(survey)
                      }
                      className="h-9 w-9 p-0 rounded-xl"
                      title="View Responses"
                    >
                      <ClipboardList className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() =>
                        openEditor(survey)
                      }
                      className="h-9 w-9 p-0 rounded-xl"
                      title="Edit Survey"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-5">

                  <h3 className="font-black text-xl text-slate-800 leading-tight">
                    {survey.title}
                  </h3>

                  <p className="mt-2 text-[10px] font-black uppercase text-indigo-500">
                    {survey.category || "Other"}
                  </p>

                  {survey.description && (
                    <p className="mt-3 text-xs text-slate-400 line-clamp-3">
                      {survey.description}
                    </p>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2">

                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[8px] uppercase font-black text-slate-400">
                      Questions
                    </p>
                    <p className="font-black text-slate-700 mt-1">
                      {survey.questions_data?.length || 0}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[8px] uppercase font-black text-slate-400">
                      Created
                    </p>
                    <p className="font-black text-slate-700 mt-1">
                      {survey.created_at
                        ? new Date(
                            survey.created_at
                          ).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>

                </div>

                <div className="mt-5 flex gap-2">

                  <Button
                    onClick={() =>
                      toggleSurveyStatus(survey)
                    }
                    className={`flex-1 rounded-xl font-black uppercase text-[9px] ${
                      survey.status === "active"
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {survey.status === "active"
                      ? "Close Survey"
                      : "Publish"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      duplicateSurvey(survey)
                    }
                    className="rounded-xl"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      triggerDeleteConfirm(
                        survey.id,
                        survey.title
                      )
                    }
                    className="rounded-xl text-rose-500 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>

                </div>

              </Card>
            ))}
          </div>
        )}

        {/* CREATE SURVEY */}
        <Dialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        >
          <DialogContent className="max-w-lg rounded-3xl p-7">

            <DialogHeader>
              <DialogTitle className="text-2xl font-black">
                Create New Survey
              </DialogTitle>
            </DialogHeader>

            <form
              onSubmit={createSurvey}
              className="space-y-5 mt-3"
            >

              <div>
                <label className="text-xs font-black text-slate-600">
                  Survey Title
                </label>

                <Input
                  name="title"
                  required
                  placeholder="e.g. Student Counseling Evaluation"
                  className="mt-2 h-12 rounded-xl bg-slate-50 border-none"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600">
                  Category
                </label>

                <select
                  name="category"
                  defaultValue="Counseling Services"
                  className="mt-2 w-full h-12 rounded-xl bg-slate-50 px-4 text-sm font-bold outline-none"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600">
                  Description / Instructions
                </label>

                <textarea
                  name="description"
                  placeholder="Explain the purpose of this survey..."
                  className="mt-2 w-full min-h-[110px] rounded-xl bg-slate-50 border-none p-4 text-sm outline-none resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={creating}
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-black uppercase text-xs"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Create Draft Survey
              </Button>

            </form>
          </DialogContent>
        </Dialog>

        {/* RESPONSES */}
        <Dialog
          open={!!viewingResponses}
          onOpenChange={(open) => {
            if (!open) setViewingResponses(null);
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl p-0 flex flex-col">

            <div className="p-6 bg-slate-900 text-white">
              <div className="flex justify-between gap-4">

                <div>
                  <p className="text-[9px] uppercase font-black text-indigo-300 tracking-widest">
                    Survey Responses
                  </p>

                  <h2 className="text-xl md:text-2xl font-black mt-1">
                    {viewingResponses?.title}
                  </h2>
                </div>

                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center">
                  <span className="text-xl font-black">
                    {responses.length}
                  </span>
                </div>

              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">

              {loadingResponses ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : responses.length === 0 ? (
                <div className="bg-white rounded-2xl p-16 text-center">
                  <Users className="mx-auto w-10 h-10 text-slate-300" />
                  <p className="mt-3 text-xs font-black uppercase text-slate-400">
                    No student responses yet.
                  </p>
                </div>
              ) : (
                responses.map((response: any) => (
                  <Card
                    key={response.id}
                    className="rounded-2xl border-none overflow-hidden"
                  >

                    <div className="bg-slate-900 text-white p-4 flex justify-between">

                      <div>
                        <h3 className="font-black">
                          {response.studentName}
                        </h3>

                        <p className="text-[9px] text-slate-400 uppercase mt-1">
                          {response.created_at
                            ? new Date(
                                response.created_at
                              ).toLocaleString()
                            : ""}
                        </p>
                      </div>

                      <CheckCircle2 className="text-emerald-400" />
                    </div>

                    <div className="p-5 grid md:grid-cols-2 gap-4">

                      {viewingResponses?.questions_data?.map(
                        (question) => (
                          <div
                            key={question.id}
                            className="bg-slate-50 rounded-xl p-4"
                          >
                            <p className="text-[9px] font-black uppercase text-slate-400">
                              {question.text}
                            </p>

                            <p className="mt-2 font-bold text-slate-800 text-sm">
                              {response.answers?.[
                                question.id
                              ] !== undefined
                                ? String(
                                    response.answers[
                                      question.id
                                    ]
                                  )
                                : "No response"}
                            </p>
                          </div>
                        )
                      )}

                    </div>
                  </Card>
                ))
              )}

            </div>
          </DialogContent>
        </Dialog>

        {/* DELETE */}
        <Dialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
        >
          <DialogContent className="max-w-md rounded-3xl p-7 text-center">

            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
              <AlertCircle />
            </div>

            <DialogHeader className="mt-4">
              <DialogTitle className="text-xl font-black text-center">
                Delete Survey?
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-slate-500 mt-2">
              Are you sure you want to delete{" "}
              <strong>{deleteTargetTitle}</strong>?
            </p>

            <div className="grid grid-cols-2 gap-3 mt-6">

              <Button
                variant="ghost"
                onClick={() =>
                  setIsDeleteOpen(false)
                }
                className="rounded-xl font-black"
              >
                Cancel
              </Button>

              <Button
                onClick={handleExecuteDelete}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black"
              >
                Delete
              </Button>

            </div>

          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}