import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { logActivity } from "../../lib/activityLog";
import { notifyStudents } from "../../lib/notifyStudents";
import { useAuth } from "../../hooks/useAuth";
import { IEC_CATEGORIES } from "../../lib/iecCategories";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Plus,
  Edit,
  Trash2,
  Save,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  X,
  Copy,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Users,
  Check,
} from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

type QuestionType = "mcq" | "scale" | "text" | "checkbox";
type SurveyType = "knowledge" | "opinion";

type Question = {
  id: string | number;
  text: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  // Only meaningful for mcq questions on a "knowledge" survey.
  correct_option?: string;
  related_program_id?: number | null;
  related_material_id?: number | null;
  // checkbox only: shows a write-in "Other, please specify" option
  // alongside the fixed choices.
  allow_other?: boolean;
  // checkbox only, optional: option text -> program id, for a "which of
  // these programs have you participated in" style question. Powers the
  // Program Participation by Course analytics — an option left
  // unmapped (e.g. "None of the above", "Other") is treated as "did not
  // reach this program" rather than ignored.
  option_program_ids?: Record<string, number> | null;
  // Form B (post-test) items only: the id of the Form A item this one is
  // the parallel of. Pairs follow ids, not positions (PHASE 27).
  pairs_with?: string | number | null;
};

type Survey = {
  id: number;
  title: string;
  description?: string | null;
  category?: string | null;
  // Separate from `category` (the 6 Guidance Services, kept aligned with
  // programs.guidance_service — see the CATEGORIES comment below).
  // iec_category uses the 8-value IEC Categories scheme instead, the
  // same one materials.category uses, so a survey can be tied to the
  // materials covering the same topic. Optional — PHASE 13 migration.
  iec_category?: string | null;
  // Knowledge assessments only: the one program this assessment is the
  // pre-test/post-test for (PHASE 22). At most one active knowledge
  // assessment per program, enforced by a unique index.
  program_id?: number | null;
  type: SurveyType;
  status: "draft" | "active" | "closed";
  questions_data: Question[];
  // Knowledge assessments only: Form B, the parallel post-test form
  // (PHASE 27). Empty/null means the post-test reuses Form A.
  questions_data_post?: Question[] | null;
  created_at?: string;
  updated_at?: string;
  start_date?: string | null;
  end_date?: string | null;
};

type ProgramOption = { id: number; title: string };
type MaterialOption = { id: number; title: string };

// Matches the 6 official guidance_service categories enforced on
// `programs` (see supabase/migrations.sql) and GUIDANCE_SERVICES in
// AnalyticsDashboard.tsx, so a survey's category always lines up with
// the program it can be linked to via related_program_id.
const CATEGORIES = [
  "Information Services",
  "Individual Inventory",
  "Research and Evaluation",
  "Career Orientation",
  "Testing Services",
  "Counseling Services",
  "Other",
];

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "mcq", label: "Multiple Choice" },
  { value: "checkbox", label: "Checkbox (Multiple Answers)" },
  { value: "scale", label: "Rating Scale 1–5" },
  { value: "text", label: "Text Response" },
];

function newQuestionId(): string {
  return `${Date.now()}-${Math.random()}`;
}

function createQuestion(): Question {
  return {
    id: newQuestionId(),
    text: "",
    type: "mcq",
    options: ["Option 1", "Option 2"],
    required: true,
  };
}

type FormKey = "A" | "B";

// Same rule as the surveys_post_form_paired constraint (PHASE 27): a
// knowledge assessment with a Form B can only be published when both
// forms have the same number of items, every Form B item pairs with an
// existing Form A item, and every Form A item has exactly one pair.
// Returns why it isn't ready, or null when it is (or Form B is empty).
function formPairingProblem(formA: Question[] | null | undefined, formB: Question[] | null | undefined): string | null {
  const a = Array.isArray(formA) ? formA : [];
  const b = Array.isArray(formB) ? formB : [];
  if (b.length === 0) return null;

  if (a.length !== b.length) {
    return `Form A has ${a.length} item${a.length === 1 ? "" : "s"} and Form B has ${b.length}. Both forms need the same number.`;
  }

  const aIds = new Set(a.map((q) => String(q.id)));
  const unpairedB = b.findIndex((q) => q.pairs_with == null || !aIds.has(String(q.pairs_with)));
  if (unpairedB >= 0) {
    return `Form B item ${unpairedB + 1} isn't paired with a Form A item.`;
  }

  for (let index = 0; index < a.length; index++) {
    const pairs = b.filter((q) => String(q.pairs_with) === String(a[index].id)).length;
    if (pairs !== 1) {
      return pairs === 0
        ? `Form A item ${index + 1} has no pair in Form B.`
        : `Form A item ${index + 1} is paired with ${pairs} Form B items; it needs exactly one.`;
    }
  }

  return null;
}

// A request from the Content page ("Needs attention" opens one draft).
type OpenRequest = { n: number; id?: number };

export default function SurveyBuilder({ openRequest, onChanged }: { openRequest?: OpenRequest | null; onChanged?: () => void } = {}) {
  const { toast } = useToast();
  const { user, userName } = useAuth();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Form B (post-test) of a knowledge assessment, and which form the
  // editor is showing. The question editing functions below act on the
  // form in view.
  const [questionsPost, setQuestionsPost] = useState<Question[]>([]);
  const [activeForm, setActiveForm] = useState<FormKey>("A");
  // Editor: the item shown side by side, and side-by-side vs full list.
  const [selectedItem, setSelectedItem] = useState(0);
  const [viewMode, setViewMode] = useState<"pairs" | "list">("pairs");
  // Opening an assessment brings its editor into view (it sits below the
  // Content page header and stats).
  const editorTopRef = useRef<HTMLElement>(null);
  const editingSurveyId = editingSurvey?.id;
  useEffect(() => {
    if (editingSurveyId != null) editorTopRef.current?.scrollIntoView({ block: "start" });
  }, [editingSurveyId]);
  const [pendingRemoveA, setPendingRemoveA] = useState<Question | null>(null);
  const [confirmCopyToB, setConfirmCopyToB] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const activeQuestions = activeForm === "B" ? questionsPost : questions;

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [viewingResponses, setViewingResponses] =
    useState<Survey | null>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<string | number | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteTargetTitle, setDeleteTargetTitle] = useState("");

  const [deleteResponseTarget, setDeleteResponseTarget] =
    useState<{ id: string | number; studentName: string } | null>(null);
  const [deletingResponse, setDeletingResponse] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [creating, setCreating] = useState(false);

  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  // program id -> how many IEC materials are linked to it (PHASE 29). A
  // knowledge check can't go live while its program has none.
  const [linkedCountByProgram, setLinkedCountByProgram] = useState<Record<number, number>>({});

  useEffect(() => {
    fetchSurveys();
    fetchLinkOptions();
  }, []);

  async function fetchLinkOptions() {
    const [programsRes, materialsRes] = await Promise.all([
      supabase.from("programs").select("id, title").is("archived_at", null).order("title"),
      supabase.from("materials").select("id, title").is("archived_at", null).order("title"),
    ]);

    if (programsRes.data) setProgramOptions(programsRes.data as ProgramOption[]);
    if (materialsRes.data) setMaterialOptions(materialsRes.data as MaterialOption[]);
    try {
      setLinkedCountByProgram(await fetchLinkedMaterialCounts());
    } catch (err) {
      console.warn("Unable to load linked materials:", err);
    }
  }

  // Linked IEC materials per program, counted the way students see them:
  // not archived, and never handouts (src/lib/materialProgress.ts).
  async function fetchLinkedMaterialCounts(programId?: number): Promise<Record<number, number>> {
    let query = supabase.from("program_materials").select("program_id, materials(id, archived_at, program_id)");
    if (programId != null) query = query.eq("program_id", programId);
    const { data, error } = await query;
    if (error) throw error;
    const counts: Record<number, number> = {};
    (data || []).forEach((row: any) => {
      const material = row.materials;
      if (!material || material.archived_at || material.program_id !== null) return;
      counts[row.program_id] = (counts[row.program_id] || 0) + 1;
    });
    return counts;
  }

  async function fetchSurveys() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("surveys")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setSurveys((data || []) as Survey[]);
      onChanged?.();
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

  // Flat, most-recent-first was fine at a handful of surveys — once a
  // guidance service has its own Pre-Test, Post-Test, and Opinion survey
  // (times six services), that ordering scatters a category's surveys
  // across the whole list instead of keeping them scannable together.
  // Grouped by guidance service (in the same order as the CATEGORIES
  // filter above), and within each group: Knowledge Assessments before
  // Opinion surveys, Pre-Test before Post-Test, so a matched pair always
  // sits side by side.
  const groupedSurveys = useMemo(() => {
    const stageRank = (title: string | undefined) => {
      const t = (title || "").toLowerCase();
      if (t.includes("pre-test")) return 0;
      if (t.includes("post-test")) return 1;
      return 2;
    };
    const typeRank = (type: string | undefined) =>
      type === "knowledge" ? 0 : type === "opinion" ? 1 : 2;

    const byCategory = new Map<string, Survey[]>();
    for (const survey of filteredSurveys) {
      const key = survey.category || "Other";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(survey);
    }

    for (const group of byCategory.values()) {
      group.sort((a, b) => {
        const type = typeRank(a.type) - typeRank(b.type);
        if (type !== 0) return type;
        const stage = stageRank(a.title) - stageRank(b.title);
        if (stage !== 0) return stage;
        return (a.title || "").localeCompare(b.title || "");
      });
    }

    // CATEGORIES order first, then anything unexpected (a legacy or
    // custom category value) appended alphabetically at the end.
    const orderedKeys = [
      ...CATEGORIES.filter((c) => c !== "Other" && byCategory.has(c)),
      ...[...byCategory.keys()]
        .filter((k) => !CATEGORIES.includes(k) || k === "Other")
        .sort(),
    ];

    return orderedKeys.map((category) => ({
      category,
      surveys: byCategory.get(category)!,
    }));
  }, [filteredSurveys]);

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
      // "" from the "No IEC Category" option must be null, not an empty
      // string — the CHECK constraint only allows NULL or one of the 8
      // IEC Categories.
      const iecCategoryRaw = String(formData.get("iec_category") || "");
      const iecCategory = iecCategoryRaw === "" ? null : iecCategoryRaw;
      const type = String(formData.get("type") || "opinion") as SurveyType;

      if (!title) {
        toast({
          title: "Survey title required",
          description: "Please provide a title.",
          variant: "destructive",
        });
        return;
      }

      const { data: created, error } = await supabase.from("surveys").insert([
        {
          title,
          description,
          category,
          iec_category: iecCategory,
          type,
          status: "draft",
          questions_data: [],
        },
      ]).select();

      if (error) throw error;
      logActivity({ actorEmail: user?.email, actorName: userName, action: "create", entityType: "survey", entityId: created?.[0]?.id, entityLabel: title });

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

  // "Needs attention" on the Content page opens one assessment here,
  // once the list has loaded.
  const handledOpenRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!openRequest || handledOpenRequest.current === openRequest.n) return;
    const survey = surveys.find((s) => s.id === openRequest.id);
    if (!survey) return;
    handledOpenRequest.current = openRequest.n;
    openEditor(survey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest, surveys]);

  function openEditor(survey: Survey) {
    setEditingSurvey(survey);

    setQuestions(
      Array.isArray(survey.questions_data)
        ? survey.questions_data
        : []
    );
    setQuestionsPost(
      Array.isArray(survey.questions_data_post)
        ? survey.questions_data_post
        : []
    );
    setActiveForm("A");
    setSelectedItem(0);
  }

  async function saveSurveyContent() {
    if (!editingSurvey) return;

    try {
      setIsSaving(true);

      const cleanQuestions = questions.filter(
        (q) => q.text.trim().length > 0
      );
      const cleanPost = questionsPost.filter(
        (q) => q.text.trim().length > 0
      );

      const { error } = await supabase
        .from("surveys")
        .update({
          questions_data: cleanQuestions,
          // Empty Form B is stored as null: the post-test reuses Form A.
          questions_data_post: cleanPost.length > 0 ? cleanPost : null,
        })
        .eq("id", editingSurvey.id);

      if (error) {
        // 23514 = check violation: an active assessment whose forms no
        // longer pair up (surveys_post_form_paired).
        if (error.code === "23514") {
          throw new Error(
            formPairingProblem(cleanQuestions, cleanPost) ||
              "Form A and Form B must pair up one to one while the assessment is published."
          );
        }
        throw error;
      }
      logActivity({ actorEmail: user?.email, actorName: userName, action: "update", entityType: "survey", entityId: editingSurvey.id, entityLabel: editingSurvey.title, details: cleanPost.length > 0 ? `Form A: ${cleanQuestions.length}, Form B: ${cleanPost.length} question(s) saved` : `${cleanQuestions.length} question(s) saved` });

      const pairingProblem =
        editingSurvey.type === "knowledge" ? formPairingProblem(cleanQuestions, cleanPost) : null;

      toast({
        title: "Survey Updated",
        description: pairingProblem
          ? `Saved. Before publishing: ${pairingProblem}`
          : "Your survey questions were saved successfully.",
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
    field: "title" | "description" | "category" | "iec_category" | "type" | "program_id",
    value: string
  ) {
    if (!editingSurvey) return;

    // iec_category is optional — its CHECK constraint only allows NULL
    // or one of the 8 IEC Categories, not an empty string, so "No IEC
    // Category" (value === "") has to be stored as null. program_id is
    // likewise optional, and numeric.
    const storedValue: string | number | null =
      (field === "iec_category" || field === "program_id") && value === ""
        ? null
        : field === "program_id"
          ? Number(value)
          : value;

    const previous = editingSurvey;

    setEditingSurvey({
      ...editingSurvey,
      [field]: storedValue,
    });

    const { error } = await supabase
      .from("surveys")
      .update({ [field]: storedValue })
      .eq("id", editingSurvey.id);

    if (error) {
      setEditingSurvey(previous);
      toast({
        variant: "destructive",
        title: "Not Saved",
        // 23505 = unique violation: surveys_one_knowledge_per_program
        description:
          error.code === "23505"
            ? "That program already has a knowledge assessment. Each program can only have one pre-test/post-test."
            : error.message,
      });
    }
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

      // A knowledge assessment with a Form B publishes only when the two
      // forms pair up one to one (the database enforces the same rule).
      if (newStatus === "active" && survey.type === "knowledge") {
        const problem = formPairingProblem(survey.questions_data, survey.questions_data_post);
        if (problem) {
          toast({ title: "Can't Publish Yet", description: problem, variant: "destructive" });
          return;
        }

        // Students view the program's linked IEC materials between the
        // pre-test and the post-test, so a program without any would
        // leave the post-test locked for good. Checked live, not from the
        // cached counts, in case links changed in Programs meanwhile.
        if (survey.program_id == null) {
          toast({
            title: "Can't Publish Yet",
            description: "Choose the program this knowledge check belongs to, then link IEC materials to that program.",
            variant: "destructive",
          });
          return;
        }
        const counts = await fetchLinkedMaterialCounts(survey.program_id);
        setLinkedCountByProgram((prev) => ({ ...prev, [survey.program_id as number]: counts[survey.program_id as number] || 0 }));
        if (!counts[survey.program_id]) {
          const programTitle = programOptions.find((p) => p.id === survey.program_id)?.title || "this program";
          toast({
            title: "Can't Publish Yet",
            description: `"${programTitle}" has no linked IEC materials. Link at least one in Programs (Edit program, Linked IEC materials), then publish.`,
            variant: "destructive",
          });
          return;
        }
      }

      const { error } = await supabase
        .from("surveys")
        .update({ status: newStatus })
        .eq("id", survey.id);

      if (error) {
        if (error.code === "23514") {
          throw new Error("Form A and Form B must pair up one to one before this assessment can be published.");
        }
        throw error;
      }
      logActivity({ actorEmail: user?.email, actorName: userName, action: "update", entityType: "survey", entityId: survey.id, entityLabel: survey.title, details: `status changed to "${newStatus}"` });

      // Only on the moment a survey actually goes live for students —
      // not draft creation, and not re-closing/re-opening later.
      if (newStatus === "active") {
        notifyStudents("survey", survey.title, survey.description);
      }

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
      const { data: copy, error } = await supabase.from("surveys").insert([
        {
          title: `${survey.title} - Copy`,
          description: survey.description || "",
          category: survey.category || "Other",
          type: survey.type || "opinion",
          status: "draft",
          questions_data: survey.questions_data || [],
          questions_data_post: survey.questions_data_post || null,
        },
      ]).select();

      if (error) throw error;
      logActivity({ actorEmail: user?.email, actorName: userName, action: "create", entityType: "survey", entityId: copy?.[0]?.id, entityLabel: `${survey.title} - Copy`, details: `duplicated from "${survey.title}"` });

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
      // Archive, not delete — only the Archive screen can permanently
      // remove a survey now.
      const { error } = await supabase
        .from("surveys")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", deleteTargetId);

      if (error) throw error;
      logActivity({ actorEmail: user?.email, actorName: userName, action: "delete", entityType: "survey", entityId: deleteTargetId, entityLabel: deleteTargetTitle, details: "Archived" });

      toast({
        title: "Archived",
        description: "Moved to Archive. Restore or permanently delete it from there.",
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
      setExpandedResponseId(null);

      const { data: responseData, error: responseError } = await supabase
        .from("survey_responses")
        .select("*")
        .eq("survey_id", survey.id)
        .order("created_at", { ascending: false });

      if (responseError) throw responseError;

      // survey_responses.user_id is users.id (a bigint), NOT profiles.id
      // (the auth uuid) — matching it against profiles.id never hit, which
      // is why every row fell back to showing the raw id. Join on users.
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name, student_id");

      const merged = (responseData || []).map((response: any) => {
        const student = usersData?.find(
          (user: any) =>
            String(user.id) === String(response.user_id)
        );

        return {
          ...response,
          studentName:
            student?.name ||
            `Student ID: ${String(response.user_id || "")}`,
          studentNumber: student?.student_id || null,
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

  async function handleDeleteResponse() {
    if (!deleteResponseTarget) return;

    try {
      setDeletingResponse(true);

      const { error } = await supabase
        .from("survey_responses")
        .delete()
        .eq("id", deleteResponseTarget.id);

      if (error) throw error;

      logActivity({
        actorEmail: user?.email,
        actorName: userName,
        action: "delete",
        entityType: "survey",
        entityId: viewingResponses?.id,
        entityLabel: viewingResponses?.title,
        details: `removed ${deleteResponseTarget.studentName}'s response`,
      });

      setResponses((previous) =>
        previous.filter((response) => response.id !== deleteResponseTarget.id)
      );

      toast({
        title: "Response Deleted",
        description: `${deleteResponseTarget.studentName}'s response has been removed.`,
      });

      setDeleteResponseTarget(null);
    } catch (err: any) {
      toast({
        title: "Delete Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDeletingResponse(false);
    }
  }

  // The editing helpers act on one form: the form in view by default, or
  // the one passed (the side-by-side view edits Form A and Form B at once).
  const listFor = (form: FormKey) => (form === "B" ? questionsPost : questions);
  const setterFor = (form: FormKey) => (form === "B" ? setQuestionsPost : setQuestions);

  function updateQuestion(
    questionIndex: number,
    updates: Partial<Question>,
    form: FormKey = activeForm
  ) {
    setterFor(form)((previous) =>
      previous.map((question, index) =>
        index === questionIndex
          ? { ...question, ...updates }
          : question
      )
    );
  }

  function changeQuestionType(
    questionIndex: number,
    type: QuestionType,
    form: FormKey = activeForm
  ) {
    const question = listFor(form)[questionIndex];

    const updated: Question = {
      ...question,
      type,
    };

    if (type === "mcq" || type === "checkbox") {
      updated.options =
        question.options?.length
          ? question.options
          : ["Option 1", "Option 2"];
    } else {
      delete updated.options;
      delete updated.allow_other;
      delete updated.option_program_ids;
    }

    updateQuestion(questionIndex, updated, form);
  }

  function addOption(questionIndex: number, form: FormKey = activeForm) {
    const question = listFor(form)[questionIndex];

    updateQuestion(questionIndex, {
      options: [...(question.options || []), "New Option"],
    }, form);
  }

  function updateOption(
    questionIndex: number,
    optionIndex: number,
    value: string,
    form: FormKey = activeForm
  ) {
    const question = listFor(form)[questionIndex];
    const options = [...(question.options || [])];

    options[optionIndex] = value;

    updateQuestion(questionIndex, { options }, form);
  }

  function removeOption(
    questionIndex: number,
    optionIndex: number,
    form: FormKey = activeForm
  ) {
    const question = listFor(form)[questionIndex];

    const options = (question.options || []).filter(
      (_, index) => index !== optionIndex
    );

    updateQuestion(questionIndex, { options }, form);
  }

  // checkbox questions only — maps one option's text to a program id (or
  // clears the mapping when programId is null), for the Program
  // Participation by Course report.
  function setOptionProgram(
    questionIndex: number,
    option: string,
    programId: number | null,
    form: FormKey = activeForm
  ) {
    const question = listFor(form)[questionIndex];
    const nextMap = { ...(question.option_program_ids || {}) };

    if (programId === null) {
      delete nextMap[option];
    } else {
      nextMap[option] = programId;
    }

    updateQuestion(questionIndex, { option_program_ids: nextMap }, form);
  }

  // Removing a Form A item that has a Form B pair asks first, then
  // removes both, so no Form B item is left pointing at nothing.
  function removeQuestion(questionId: string | number, form: FormKey = activeForm) {
    if (form === "A") {
      const question = questions.find((q) => q.id === questionId);
      const hasPair = questionsPost.some((q) => String(q.pairs_with) === String(questionId));
      if (question && hasPair) {
        setPendingRemoveA(question);
        return;
      }
    }

    setterFor(form)((previous) =>
      previous.filter((question) => question.id !== questionId)
    );
  }

  // Side-by-side view: a Form B item for one Form A item that has none.
  function addFormBPairFor(formAItem: Question) {
    setQuestionsPost((previous) => [...previous, { ...createQuestion(), pairs_with: formAItem.id }]);
  }

  function confirmRemoveFormAItem() {
    if (!pendingRemoveA) return;
    const id = pendingRemoveA.id;
    setQuestions((previous) => previous.filter((q) => q.id !== id));
    setQuestionsPost((previous) => previous.filter((q) => String(q.pairs_with) !== String(id)));
    setPendingRemoveA(null);
  }

  // Form B starts as a copy of Form A: new ids, each copy paired with
  // the Form A item it came from. The admin then rewrites each copy.
  function copyFormAToFormB() {
    setQuestionsPost(
      questions
        .filter((q) => q.text.trim().length > 0)
        .map((q) => ({ ...q, id: newQuestionId(), pairs_with: q.id }))
    );
    setConfirmCopyToB(false);
    setActiveForm("B");
  }

  // A new Form B item pairs with the first Form A item that has no pair.
  function addQuestionToActiveForm() {
    if (activeForm === "B") {
      const paired = new Set(questionsPost.map((q) => String(q.pairs_with)));
      const firstUnpaired = questions.find((q) => q.text.trim() && !paired.has(String(q.id)));
      setQuestionsPost([...questionsPost, { ...createQuestion(), pairs_with: firstUnpaired?.id ?? null }]);
      return;
    }
    setQuestions([...questions, createQuestion()]);
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
    const isKnowledge = editingSurvey.type === "knowledge";
    const filledA = questions.filter((q) => q.text.trim());
    const filledB = questionsPost.filter((q) => q.text.trim());
    const pairingProblem = isKnowledge ? formPairingProblem(filledA, filledB) : null;
    const pairOf = (a: Question) => questionsPost.find((b) => String(b.pairs_with) === String(a.id)) || null;
    const pairIndexOf = (a: Question) => questionsPost.findIndex((b) => String(b.pairs_with) === String(a.id));
    const isComplete = (q: Question | null) =>
      !!q && !!q.text.trim() && (!isKnowledge || q.type !== "mcq" || !!q.correct_option);
    const selectedIndex = Math.min(selectedItem, Math.max(questions.length - 1, 0));
    const selectedA = questions[selectedIndex] || null;
    const selectedBIndex = selectedA ? pairIndexOf(selectedA) : -1;
    const selectedB = selectedBIndex >= 0 ? questionsPost[selectedBIndex] : null;
    const missingAnswers = [...filledA, ...filledB].filter((q) => q.type === "mcq" && !q.correct_option).length;
    const unpairedB = questionsPost.filter(
      (b) => b.pairs_with == null || !questions.some((a) => String(a.id) === String(b.pairs_with))
    ).length;
    const showPairs = isKnowledge && viewMode === "pairs";

    // The same checks the builder runs before publishing, shown as a
    // list (formPairingProblem, linked IEC materials), plus whether every
    // item has an answer marked.
    const linkedCount = editingSurvey.program_id != null ? linkedCountByProgram[editingSurvey.program_id] || 0 : 0;
    const checklist = isKnowledge
      ? [
          {
            ok: linkedCount > 0,
            label:
              editingSurvey.program_id == null
                ? "No program chosen, so no linked IEC materials"
                : linkedCount > 0
                  ? `The program has ${linkedCount} linked IEC ${linkedCount === 1 ? "material" : "materials"}`
                  : "The program has no linked IEC materials",
            detail:
              linkedCount > 0
                ? null
                : "Link them in Programs (Edit program, Linked IEC materials). Publishing is blocked until then.",
          },
          {
            ok: filledB.length === 0 || filledA.length === filledB.length,
            label:
              filledB.length === 0
                ? "No Form B yet: the post-test reuses Form A"
                : `Same number of items (Form A ${filledA.length}, Form B ${filledB.length})`,
          },
          {
            ok: filledB.length === 0 || !pairingProblem,
            label: "Every Form B item pairs with exactly one Form A item",
            detail: filledB.length > 0 ? pairingProblem : null,
          },
          {
            ok: missingAnswers === 0,
            label:
              missingAnswers === 0
                ? "Every item has a correct answer"
                : `${missingAnswers} ${missingAnswers === 1 ? "item has" : "items have"} no correct answer`,
          },
        ]
      : [];

    const shortLabel = (text: string) => {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return "Untitled item";
      return words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : "");
    };

    const fieldClass =
      "w-full h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] px-3.5 text-sm text-[#1E293B] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";
    const labelClass = "text-[13px] font-semibold text-[#334155]";
    const ring =
      "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

    // One question's editor. `form` says which form it belongs to, so the
    // same card serves the list view and the side-by-side view.
    const renderQuestionCard = (
      question: Question,
      index: number,
      form: FormKey,
      options: { heading?: ReactNode } = {}
    ) => {
      const prefix = isKnowledge ? `${form}${index + 1}` : `${index + 1}`;
      const textId = `q-${form}-${String(question.id)}`;
      return (
        <div key={`${form}-${question.id}`} className="p-5 md:p-6 rounded-[32px] bg-white flex flex-col gap-4 min-w-0">
          <div className="flex justify-between items-center gap-3">
            {options.heading ?? (
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-[#EEF0FA] text-[#1E1B4B] flex items-center justify-center font-extrabold text-sm">
                  {prefix}
                </span>
                <span className="text-sm font-semibold text-[#5B6477]">Question {index + 1}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => removeQuestion(question.id, form)}
              aria-label={`Remove ${isKnowledge ? `item ${prefix}` : `question ${index + 1}`}`}
              className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-50 ${ring}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Form B: which Form A item this one is the parallel of. */}
          {isKnowledge && form === "B" && (() => {
            const pairIndex = questions.findIndex((q) => String(q.id) === String(question.pairs_with));
            const takenByOthers = new Set(
              questionsPost.filter((q) => q.id !== question.id).map((q) => String(q.pairs_with))
            );
            const selectId = `pair-${String(question.id)}`;
            return (
              <div className={`rounded-2xl p-3.5 flex flex-col gap-1.5 ${pairIndex >= 0 ? "bg-[#EEF0FA]" : "bg-[#FFFBEB]"}`}>
                <label htmlFor={selectId} className={labelClass}>Pairs with</label>
                <select
                  id={selectId}
                  value={pairIndex >= 0 ? String(question.pairs_with) : ""}
                  onChange={(e) => {
                    const target = questions.find((q) => String(q.id) === e.target.value);
                    updateQuestion(index, { pairs_with: target ? target.id : null }, form);
                  }}
                  className={`${fieldClass} bg-white`}
                >
                  <option value="">Choose the Form A item...</option>
                  {questions.map((q, aIndex) => (
                    <option key={String(q.id)} value={String(q.id)}>
                      A{aIndex + 1}: {q.text || "(empty)"}{takenByOthers.has(String(q.id)) ? " (already paired)" : ""}
                    </option>
                  ))}
                </select>
                <p className={`m-0 text-[13px] font-semibold ${pairIndex >= 0 ? "text-[#4338CA]" : "text-[#92400E]"}`}>
                  {pairIndex >= 0 ? `Pairs with item ${pairIndex + 1} of Form A` : "Not paired yet"}
                </p>
              </div>
            );
          })()}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={textId} className={labelClass}>Question</label>
            <textarea
              id={textId}
              value={question.text}
              onChange={(e) => updateQuestion(index, { text: e.target.value }, form)}
              placeholder="Enter your question..."
              rows={2}
              className={`w-full px-3.5 py-3 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-[15px] leading-normal text-[#1E293B] resize-y ${ring}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Question type</span>
            <div className="flex flex-wrap gap-2">
              {QUESTION_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  aria-pressed={question.type === type.value}
                  onClick={() => changeQuestionType(index, type.value, form)}
                  className={`h-11 px-3.5 rounded-xl border-[1.5px] text-[13px] transition-colors ${ring} ${
                    question.type === type.value
                      ? "bg-[#1E1B4B] border-[#1E1B4B] text-white font-bold"
                      : "bg-white border-[#DDE1EE] text-[#334155] font-semibold hover:border-[#A5B4FC]"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {(question.type === "mcq" || question.type === "checkbox") && (
            <div className="flex flex-col gap-2">
              <span className={labelClass}>
                {isKnowledge && question.type === "mcq" ? "Choices (the correct one is marked green)" : "Choices"}
              </span>
              {(question.options || []).map((option, optionIndex) => {
                const letter = String.fromCharCode(65 + optionIndex);
                const correct =
                  isKnowledge && question.type === "mcq" && !!question.correct_option && option === question.correct_option;
                return (
                  <div
                    key={optionIndex}
                    className={`min-h-[52px] pl-3.5 pr-1 rounded-[14px] border-[1.5px] flex items-center gap-2.5 ${
                      correct ? "border-[#10B981] bg-[#ECFDF5]" : "border-[#DDE1EE] bg-white"
                    }`}
                  >
                    <span className="font-bold text-sm text-[#5B6477] shrink-0 w-4">{letter}</span>
                    <input
                      value={option}
                      aria-label={`Choice ${letter}`}
                      onChange={(e) => updateOption(index, optionIndex, e.target.value, form)}
                      className={`flex-1 min-w-0 h-11 bg-transparent text-sm text-[#1E293B] rounded-lg px-1 ${ring}`}
                    />
                    {correct && (
                      <span className="shrink-0 px-2 py-1 rounded-full bg-[#10B981] text-white font-bold text-[11px]">Correct</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeOption(index, optionIndex, form)}
                      aria-label={`Remove choice ${letter}`}
                      className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[#8A91A6] hover:text-rose-500 ${ring}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => addOption(index, form)}
                className={`self-start h-11 px-3.5 rounded-xl text-sm font-bold text-[#4338CA] hover:bg-[#EEF0FA] flex items-center gap-1.5 ${ring}`}
              >
                <Plus className="w-4 h-4" /> Add choice
              </button>
            </div>
          )}

          {question.type === "mcq" && isKnowledge && (
            <div className="flex flex-col gap-3 pt-3 border-t border-[#EEF0FA]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`correct-${form}-${String(question.id)}`} className={labelClass}>Correct answer</label>
                <select
                  id={`correct-${form}-${String(question.id)}`}
                  value={question.correct_option || ""}
                  onChange={(e) => updateQuestion(index, { correct_option: e.target.value || undefined }, form)}
                  className={fieldClass}
                >
                  <option value="">Select the correct choice...</option>
                  {(question.options || []).map((option, optionIndex) => (
                    <option key={optionIndex} value={option}>
                      {String.fromCharCode(65 + optionIndex)}. {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor={`program-${form}-${String(question.id)}`} className={labelClass}>Related program (optional)</label>
                  <select
                    id={`program-${form}-${String(question.id)}`}
                    value={question.related_program_id ?? ""}
                    onChange={(e) =>
                      updateQuestion(index, { related_program_id: e.target.value ? Number(e.target.value) : null }, form)
                    }
                    className={fieldClass}
                  >
                    <option value="">None</option>
                    {programOptions.map((program) => (
                      <option key={program.id} value={program.id}>{program.title}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 min-w-0">
                  <label htmlFor={`material-${form}-${String(question.id)}`} className={labelClass}>Related material (optional)</label>
                  <select
                    id={`material-${form}-${String(question.id)}`}
                    value={question.related_material_id ?? ""}
                    onChange={(e) =>
                      updateQuestion(index, { related_material_id: e.target.value ? Number(e.target.value) : null }, form)
                    }
                    className={fieldClass}
                  >
                    <option value="">None</option>
                    {materialOptions.map((material) => (
                      <option key={material.id} value={material.id}>{material.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="m-0 text-[13px] text-[#5B6477] leading-relaxed">
                Shown to a student if they miss this question, so the assessment doubles as an awareness intervention.
              </p>
            </div>
          )}

          {question.type === "checkbox" && (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer w-fit min-h-[44px]">
                <input
                  type="checkbox"
                  checked={question.allow_other === true}
                  onChange={(e) => updateQuestion(index, { allow_other: e.target.checked }, form)}
                  className="w-5 h-5 accent-[#4F46E5]"
                />
                <span className="text-sm font-semibold text-[#334155]">Allow "Other, please specify"</span>
              </label>

              {(question.options || []).length > 0 && (
                <div className="flex flex-col gap-2 pt-3 border-t border-[#EEF0FA]">
                  <span className={labelClass}>Link choices to programs (optional)</span>
                  <p className="m-0 text-[13px] text-[#5B6477] leading-relaxed">
                    Powers the Program Participation by Course report. Leave a choice unmapped (e.g. "None of the above")
                    to count it as "did not participate."
                  </p>
                  {(question.options || []).map((option, optionIndex) => (
                    <div key={optionIndex} className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-sm font-semibold text-[#334155] flex-1 truncate">{option}</span>
                      <select
                        aria-label={`Program for ${option}`}
                        value={question.option_program_ids?.[option] ?? ""}
                        onChange={(e) => setOptionProgram(index, option, e.target.value ? Number(e.target.value) : null, form)}
                        className={`${fieldClass} sm:w-56`}
                      >
                        <option value="">Not a program</option>
                        {programOptions.map((program) => (
                          <option key={program.id} value={program.id}>{program.title}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {question.type === "scale" && (
            <div className="bg-[#EEF0FA] rounded-2xl p-4">
              <div className="flex justify-between text-[13px] font-semibold text-[#3730A3]">
                <span>1 — Strongly disagree</span>
                <span>5 — Strongly agree</span>
              </div>
              <div className="grid grid-cols-5 gap-2 mt-3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <div key={value} className="h-10 bg-white rounded-lg flex items-center justify-center font-bold text-[#4338CA]">
                    {value}
                  </div>
                ))}
              </div>
            </div>
          )}

          {question.type === "text" && (
            <div className="h-20 rounded-2xl bg-[#F5F6FB] border-2 border-dashed border-[#DDE1EE] flex items-center justify-center text-[#5B6477] text-sm">
              Student text response field
            </div>
          )}

          <label className="flex items-center gap-3 cursor-pointer w-fit min-h-[44px]">
            <input
              type="checkbox"
              checked={question.required !== false}
              onChange={(e) => updateQuestion(index, { required: e.target.checked }, form)}
              className="w-5 h-5 accent-[#4F46E5]"
            />
            <span className="text-sm font-semibold text-[#334155]">Required question</span>
          </label>
        </div>
      );
    };

    const statusBadge =
      editingSurvey.status === "active"
        ? "bg-[#D1FAE5] text-[#065F46]"
        : editingSurvey.status === "closed"
          ? "bg-[#E2E8F0] text-[#1E293B]"
          : "bg-[#E0E7FF] text-[#3730A3]";

    return (
      <div className="font-figtree text-[#1E293B]">
        <div className="flex flex-col gap-5 pb-16">

          {/* BREADCRUMB */}
          <nav aria-label="Breadcrumb" ref={editorTopRef} className="scroll-mt-24 lg:scroll-mt-6">
            <ol className="m-0 p-0 list-none flex flex-wrap items-center gap-1 text-sm text-[#5B6477]">
              <li>
                <button
                  type="button"
                  onClick={() => setEditingSurvey(null)}
                  className={`min-h-[44px] px-1 rounded-lg font-semibold text-[#4338CA] hover:underline ${ring}`}
                >
                  Assessments
                </button>
              </li>
              <li aria-hidden="true"><ChevronRight className="w-4 h-4" /></li>
              <li aria-current="page" className="truncate max-w-[60vw]">{editingSurvey.title}</li>
            </ol>
          </nav>

          {/* HEADER: title, status, Save, Publish/Close */}
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <div className="flex items-start gap-2.5">
                <label htmlFor="survey-title" className="sr-only">Title</label>
                <input
                  id="survey-title"
                  value={editingSurvey.title}
                  onChange={(e) => setEditingSurvey({ ...editingSurvey, title: e.target.value })}
                  onBlur={() => updateSurveyInfo("title", editingSurvey.title)}
                  className={`flex-1 min-w-0 min-h-[44px] bg-transparent font-bricolage font-extrabold text-[28px] md:text-[34px] leading-tight tracking-[-0.02em] text-[#1E1B4B] rounded-xl px-1 -mx-1 hover:bg-white/60 ${ring}`}
                />
                <span className={`shrink-0 mt-2 px-3 py-1.5 rounded-full font-extrabold text-xs ${statusBadge}`}>
                  {getStatusLabel(editingSurvey.status)}
                </span>
              </div>
              <label htmlFor="survey-description" className="sr-only">Description</label>
              <textarea
                id="survey-description"
                value={editingSurvey.description || ""}
                onChange={(e) => setEditingSurvey({ ...editingSurvey, description: e.target.value })}
                onBlur={() => updateSurveyInfo("description", editingSurvey.description || "")}
                placeholder="Add instructions or a description for students..."
                rows={2}
                className={`w-full px-3.5 py-3 rounded-2xl bg-white border-[1.5px] border-[#DDE1EE] text-[15px] text-[#334155] placeholder:text-[#8A91A6] resize-y ${ring}`}
              />
              {isKnowledge && (
                <p className="m-0 text-sm text-[#5B6477]">
                  Form A is the pre-test. Form B is the post-test. Each Form B item measures the same point as its paired Form A item.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5 shrink-0">
              <button
                type="button"
                onClick={saveSurveyContent}
                disabled={isSaving}
                className={`h-12 px-5 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[15px] flex items-center gap-2 hover:border-[#A5B4FC] disabled:opacity-60 ${ring}`}
              >
                {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => toggleSurveyStatus(editingSurvey)}
                className={`h-12 px-[22px] rounded-2xl font-bold text-[15px] flex items-center gap-2 ${ring} ${
                  editingSurvey.status === "active"
                    ? "bg-[#1E1B4B] hover:bg-[#2B2F55] text-white"
                    : "bg-[#4F46E5] hover:bg-[#4338CA] text-white"
                }`}
              >
                {editingSurvey.status === "active" ? (
                  <><EyeOff className="h-4 w-4" /> Close</>
                ) : (
                  <><Eye className="h-4 w-4" /> Publish</>
                )}
              </button>
            </div>
          </div>

          {/* View switch: side by side (wide screens) or the full list. */}
          {isKnowledge && (
            <div className="hidden xl:flex items-center gap-3">
              <div role="tablist" aria-label="Editor view" className="flex gap-1 p-[5px] rounded-full bg-white">
                {([
                  { key: "pairs" as const, label: "Side by side" },
                  { key: "list" as const, label: "Full list" },
                ]).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === v.key}
                    onClick={() => setViewMode(v.key)}
                    className={`h-11 px-[18px] rounded-full text-sm whitespace-nowrap ${ring} ${
                      viewMode === v.key ? "bg-[#1E1B4B] text-white font-bold" : "text-[#334155] font-semibold hover:bg-[#EEF0FA]"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {showPairs && unpairedB > 0 && (
                <p className="m-0 text-sm text-[#92400E]">
                  {unpairedB} Form B {unpairedB === 1 ? "item isn't" : "items aren't"} paired. Pair {unpairedB === 1 ? "it" : "them"} in the full list.
                </p>
              )}
            </div>
          )}

          <div
            className={`grid grid-cols-1 gap-5 items-start ${
              showPairs ? "xl:grid-cols-[260px_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)_300px]"
            }`}
          >
            {/* LEFT: item list (side-by-side view, wide screens only) */}
            {showPairs && (
              <nav aria-label="Items" className="hidden xl:flex xl:col-start-1 xl:row-start-1 flex-col gap-1.5 p-[18px] rounded-[32px] bg-white">
                <h2 className="m-0 mx-1.5 mb-1.5 font-bold text-base text-[#1E1B4B]">Items</h2>
                {questions.map((q, i) => {
                  const b = pairOf(q);
                  const selected = i === selectedIndex;
                  const aOk = isComplete(q);
                  const bState = !b ? "missing" : isComplete(b) ? "ok" : "partial";
                  return (
                    <button
                      key={String(q.id)}
                      type="button"
                      onClick={() => setSelectedItem(i)}
                      aria-current={selected ? "true" : undefined}
                      aria-label={`Item ${i + 1}: ${shortLabel(q.text)}. Form A ${aOk ? "complete" : "incomplete"}, Form B ${bState === "ok" ? "complete" : bState === "partial" ? "incomplete" : "missing"}.`}
                      className={`min-h-[50px] px-3 py-2 rounded-2xl flex items-center gap-2.5 text-left transition-colors ${ring} ${
                        selected ? "bg-[#1E1B4B] text-white" : "text-[#1E293B] hover:bg-[#F5F6FB]"
                      }`}
                    >
                      <span className="w-7 h-7 shrink-0 rounded-[10px] bg-[#EEF0FA] text-[#1E1B4B] font-extrabold text-[13px] flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-semibold truncate">{shortLabel(q.text)}</span>
                      <span className="flex gap-[3px] shrink-0" aria-hidden="true">
                        <span className={`w-2 h-2 rounded-full ${aOk ? "bg-[#10B981]" : selected ? "bg-white/30" : "bg-[#DDE1EE]"}`} />
                        <span
                          className={`w-2 h-2 rounded-full ${
                            bState === "ok" ? "bg-[#10B981]" : bState === "partial" ? "bg-[#FBBF24]" : selected ? "bg-white/30" : "bg-[#DDE1EE]"
                          }`}
                        />
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setActiveForm("A");
                    setQuestions([...questions, createQuestion()]);
                    setSelectedItem(questions.length);
                  }}
                  className={`mt-1.5 h-[46px] rounded-2xl border-[1.5px] border-dashed border-[#C5CAE0] text-[#4338CA] font-bold text-sm hover:bg-[#F5F6FB] ${ring}`}
                >
                  Add item
                </button>
                <p className="m-0 mx-1.5 mt-1 text-xs text-[#5B6477]">Dots: Form A, Form B (green = filled in).</p>
              </nav>
            )}

            {/* CENTER */}
            <div className={`order-2 min-w-0 flex flex-col gap-4 ${showPairs ? "xl:col-start-2 xl:row-start-1 xl:row-span-2" : "xl:col-start-1 xl:row-start-1"}`}>
              {/* Side by side: the selected item's Form A and Form B. */}
              {showPairs && (
                <div className="hidden xl:flex flex-col gap-4">
                  {selectedA ? (
                    <div className="grid grid-cols-2 gap-4 items-start">
                      {renderQuestionCard(selectedA, selectedIndex, "A", {
                        heading: (
                          <div className="flex items-center gap-2.5">
                            <h2 className="m-0 font-bold text-[17px] text-[#1E1B4B]">Form A · item {selectedIndex + 1}</h2>
                            <span className="px-[11px] py-[5px] rounded-full bg-[#EEF0FA] text-[#3730A3] font-bold text-xs">Pre-test</span>
                          </div>
                        ),
                      })}
                      {selectedB ? (
                        renderQuestionCard(selectedB, selectedBIndex, "B", {
                          heading: (
                            <div className="flex items-center gap-2.5">
                              <h2 className="m-0 font-bold text-[17px] text-[#1E1B4B]">Form B</h2>
                              <span className="px-[11px] py-[5px] rounded-full bg-[#FEF3C7] text-[#92400E] font-bold text-xs">Post-test</span>
                            </div>
                          ),
                        })
                      ) : (
                        <div className="p-6 rounded-[32px] bg-white border-2 border-dashed border-[#DDE1EE] flex flex-col items-start gap-3">
                          <div className="flex items-center gap-2.5">
                            <h2 className="m-0 font-bold text-[17px] text-[#1E1B4B]">Form B</h2>
                            <span className="px-[11px] py-[5px] rounded-full bg-[#FEF3C7] text-[#92400E] font-bold text-xs">Post-test</span>
                          </div>
                          <p className="m-0 text-sm text-[#5B6477]">
                            Item {selectedIndex + 1} has no Form B item yet.
                            {questionsPost.length === 0 && " Without a Form B, the post-test reuses Form A."}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => addFormBPairFor(selectedA)}
                              className={`h-11 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm flex items-center gap-1.5 ${ring}`}
                            >
                              <Plus className="w-4 h-4" /> Add Form B item
                            </button>
                            <button
                              type="button"
                              onClick={() => (questionsPost.length > 0 ? setConfirmCopyToB(true) : copyFormAToFormB())}
                              className={`h-11 px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-sm flex items-center gap-1.5 hover:border-[#A5B4FC] ${ring}`}
                            >
                              <Copy className="w-4 h-4" /> Copy Form A to Form B
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 rounded-[32px] bg-white text-center flex flex-col items-center gap-3">
                      <p className="m-0 font-bold text-[#1E1B4B]">No items yet</p>
                      <button
                        type="button"
                        onClick={() => setQuestions([...questions, createQuestion()])}
                        className={`h-11 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm ${ring}`}
                      >
                        Add the first item
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Full list with Form A / Form B tabs: always below 1280px,
                  and on wide screens when "Full list" is chosen. */}
              <div className={`flex flex-col gap-4 ${showPairs ? "xl:hidden" : ""}`}>
                {isKnowledge && (
                  <div className="bg-white rounded-[28px] p-4 md:p-5 flex flex-col gap-3">
                    <div role="tablist" aria-label="Assessment forms" className="grid grid-cols-2 gap-1 p-[5px] rounded-full bg-[#F5F6FB]">
                      {([
                        { key: "A" as FormKey, label: "Form A", sub: "Pre-test", count: questions.length },
                        { key: "B" as FormKey, label: "Form B", sub: "Post-test", count: questionsPost.length },
                      ]).map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={activeForm === tab.key}
                          onClick={() => setActiveForm(tab.key)}
                          className={`min-h-[44px] px-3 rounded-full text-sm transition-colors ${ring} ${
                            activeForm === tab.key ? "bg-[#1E1B4B] text-white font-bold" : "text-[#334155] font-semibold hover:bg-white"
                          }`}
                        >
                          {tab.label} <span className="font-medium opacity-75">· {tab.sub} · {tab.count}</span>
                        </button>
                      ))}
                    </div>
                    <p className={`m-0 text-sm font-semibold ${questionsPost.length === 0 ? "text-[#5B6477]" : pairingProblem ? "text-[#92400E]" : "text-[#065F46]"}`}>
                      {questionsPost.length === 0
                        ? "No Form B yet: the post-test will reuse Form A."
                        : pairingProblem
                          ? `Not ready to publish: ${pairingProblem}`
                          : `Forms are paired: ${filledA.length} items each.`}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="m-0 font-bold text-lg text-[#1E1B4B]">
                      {isKnowledge
                        ? activeForm === "A"
                          ? "Form A (pre-test) questions"
                          : "Form B (post-test) questions"
                        : "Questions"}
                    </h2>
                    <p className="m-0 text-sm text-[#5B6477]">
                      {isKnowledge && activeForm === "B"
                        ? "Each item measures the same point as its paired Form A item, with its own text, choices, and answer."
                        : "Create the questionnaire students will answer."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isKnowledge && activeForm === "B" && questionsPost.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setConfirmCopyToB(true)}
                        className={`h-11 px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-sm flex items-center gap-1.5 hover:border-[#A5B4FC] ${ring}`}
                      >
                        <Copy className="w-4 h-4" /> Copy Form A to Form B
                      </button>
                    )}
                    <span className="px-3.5 py-2 rounded-full bg-[#EEF0FA] text-[#3730A3] text-sm font-bold">
                      {activeQuestions.length} {activeQuestions.length === 1 ? "question" : "questions"}
                    </span>
                  </div>
                </div>

                {isKnowledge && activeForm === "B" && questionsPost.length === 0 && (
                  <div className="rounded-[32px] border-2 border-dashed border-[#DDE1EE] bg-white p-8 text-center flex flex-col items-center gap-2">
                    <p className="m-0 font-bold text-[#1E1B4B]">Form B is empty</p>
                    <p className="m-0 text-sm text-[#5B6477]">
                      Start from a copy of Form A and rewrite each item, or add items one by one.
                    </p>
                    <button
                      type="button"
                      onClick={copyFormAToFormB}
                      className={`mt-2 h-11 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm flex items-center gap-1.5 ${ring}`}
                    >
                      <Copy className="w-4 h-4" /> Copy Form A to Form B
                    </button>
                  </div>
                )}

                {activeQuestions.map((question, index) => renderQuestionCard(question, index, activeForm))}

                <button
                  type="button"
                  onClick={addQuestionToActiveForm}
                  className={`w-full h-14 rounded-[24px] border-2 border-dashed border-[#C5CAE0] font-bold text-sm text-[#4338CA] hover:bg-white flex items-center justify-center gap-2 ${ring}`}
                >
                  <Plus className="h-5 w-5" />
                  {isKnowledge ? `Add question to Form ${activeForm}` : "Add question"}
                </button>
              </div>
            </div>

            {/* RIGHT: settings and the pre-activation checklist */}
            <aside className={`order-1 flex flex-col gap-4 min-w-0 ${showPairs ? "xl:col-start-1 xl:row-start-2" : "xl:col-start-2 xl:row-start-1"}`}>
              <section aria-labelledby="settings-heading" className="p-[22px] rounded-[32px] bg-white flex flex-col gap-3">
                <h2 id="settings-heading" className="m-0 font-bold text-base text-[#1E1B4B]">Settings</h2>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="survey-type" className={labelClass}>Survey type</label>
                  <select
                    id="survey-type"
                    value={editingSurvey.type || "opinion"}
                    onChange={(e) => updateSurveyInfo("type", e.target.value)}
                    className={fieldClass}
                  >
                    <option value="knowledge">Knowledge assessment (scored)</option>
                    <option value="opinion">Opinion survey (unscored)</option>
                  </select>
                </div>

                {/* Pre-test/post-test link. Students answer a knowledge
                    assessment twice — once before reading the program's
                    IEC materials, once after — and Learning Gain in
                    Analytics pairs the two per program. */}
                {isKnowledge && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="survey-program" className={labelClass}>Program</label>
                    <select
                      id="survey-program"
                      value={editingSurvey.program_id ?? ""}
                      onChange={(e) => updateSurveyInfo("program_id", e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Not linked to a program</option>
                      {programOptions.map((program) => (
                        <option key={program.id} value={program.id}>{program.title}</option>
                      ))}
                    </select>
                    <p className="m-0 text-xs text-[#5B6477] leading-normal">
                      Students take this twice: a pre-test, then a post-test after the program's IEC materials.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="survey-category" className={labelClass}>Category</label>
                  <select
                    id="survey-category"
                    value={editingSurvey.category || "Other"}
                    onChange={(e) => updateSurveyInfo("category", e.target.value)}
                    className={fieldClass}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </div>

                {/* Separate from Category above (the 6 Guidance Services,
                    tied to programs) — this uses the same 8-value scheme
                    as materials.category, so a survey can be tied to the
                    IEC materials on the same topic. Optional. */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="survey-iec-category" className={labelClass}>IEC category</label>
                  <select
                    id="survey-iec-category"
                    value={editingSurvey.iec_category || ""}
                    onChange={(e) => updateSurveyInfo("iec_category", e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">No IEC category</option>
                    {IEC_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </section>

              {isKnowledge && (
                <section aria-labelledby="checklist-heading" className="p-[22px] rounded-[32px] bg-[#1E1B4B] text-white flex flex-col gap-3">
                  <h2 id="checklist-heading" className="m-0 font-bold text-base">Before activating</h2>
                  <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
                    {checklist.map((item) => (
                      <li key={item.label} className="flex gap-2.5 items-start text-sm leading-snug">
                        {item.ok ? (
                          <span className="w-[22px] h-[22px] shrink-0 rounded-full bg-[#10B981] flex items-center justify-center" aria-hidden="true">
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="w-[22px] h-[22px] shrink-0 rounded-full border-2 border-[#FBBF24]" aria-hidden="true" />
                        )}
                        <span className="flex flex-col gap-0.5">
                          <span>
                            <span className="sr-only">{item.ok ? "Done: " : "Not yet: "}</span>
                            {item.label}
                          </span>
                          {"detail" in item && item.detail && <span className="text-xs text-[#FBBF24]">{item.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="m-0 text-xs leading-normal text-[#A5A8E0]">
                    Publish checks the program has linked IEC materials and the forms pair up before an assessment goes live.
                  </p>
                </section>
              )}
            </aside>
          </div>
        </div>

        {/* Removing a Form A item also removes its Form B pair. */}
        <Dialog open={!!pendingRemoveA} onOpenChange={(open) => !open && setPendingRemoveA(null)}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-black">Remove this item and its pair?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              Form A item {questions.findIndex((q) => q.id === pendingRemoveA?.id) + 1} has a paired item in Form B. Removing it
              will remove its Form B pair too. Changes apply when you save.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Button variant="ghost" onClick={() => setPendingRemoveA(null)} className="rounded-xl font-black">
                Cancel
              </Button>
              <Button onClick={confirmRemoveFormAItem} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black">
                Remove both
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Copying over a non-empty Form B replaces it. */}
        <Dialog open={confirmCopyToB} onOpenChange={setConfirmCopyToB}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-black">Replace Form B?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              Form B already has {questionsPost.length} item{questionsPost.length === 1 ? "" : "s"}. Copying Form A replaces
              them with fresh copies of the Form A items. Changes apply when you save.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Button variant="ghost" onClick={() => setConfirmCopyToB(false)} className="rounded-xl font-black">
                Cancel
              </Button>
              <Button onClick={copyFormAToFormB} className="rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-black">
                Replace Form B
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  /* =========================================================
     MAIN SURVEY HUB
  ========================================================= */

  return (
    <div className="font-figtree text-[#1E293B]">
      <div className="flex flex-col gap-5">

        {/* SUMMARY + NEW (the page header is the Content page's) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="m-0 text-[15px] text-[#5B6477]">
            <strong className="text-[#1E1B4B]">{surveys.length}</strong> {surveys.length === 1 ? 'survey' : 'surveys'} ·{' '}
            <strong className="text-[#065F46]">{activeCount}</strong> published ·{' '}
            <strong className="text-[#92400E]">{draftCount}</strong> {draftCount === 1 ? 'draft' : 'drafts'} ·{' '}
            <strong className="text-[#334155]">{closedCount}</strong> closed
          </p>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="h-12 px-[22px] rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] flex items-center justify-center gap-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New survey
          </button>
        </div>

        {/* FILTER */}
        <div className="bg-white p-4 md:p-5 rounded-[28px] flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
            <label htmlFor="survey-search" className="sr-only">Search surveys</label>
            <input
              id="survey-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search surveys"
              className="w-full h-12 pl-11 pr-4 rounded-2xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B] placeholder:text-[#8A91A6] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
            />
          </div>

          <div className="md:w-64">
            <label htmlFor="survey-category-filter" className="sr-only">Category</label>
            <select
              id="survey-category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full h-12 rounded-2xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] px-4 text-sm font-semibold text-[#1E293B] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
            >
              <option value="All">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
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
          <div className="space-y-10">
            {groupedSurveys.map(({ category, surveys: categorySurveys }) => (
              <div key={category}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-xs font-semibold text-slate-500 shrink-0">
                    {category}
                  </h2>
                  <span className="text-[13px] font-semibold text-slate-300 shrink-0">
                    {categorySurveys.length}
                  </span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">

                  {categorySurveys.map((survey) => (
                    <Card
                      key={survey.id}
                      className="p-6 rounded-[28px] border-none shadow-none hover:shadow-xl transition-all bg-white"
                    >

                <div className="flex justify-between items-start gap-3">

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${getStatusClass( survey.status )}`}
                    >
                      {getStatusLabel(survey.status)}
                    </span>

                    <span
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${ survey.type ==="knowledge"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-purple-50 text-purple-600"
                      }`}
                    >
                      {survey.type === "knowledge" ? "Scored" : "Opinion"}
                    </span>
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        fetchResponses(survey)
                      }
                      className="h-11 w-11 p-0 rounded-xl"
                      title="View responses"
                      aria-label={`View responses to ${survey.title}`}
                    >
                      <ClipboardList className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() =>
                        openEditor(survey)
                      }
                      className="h-11 w-11 p-0 rounded-xl"
                      title="Edit Survey"
                      aria-label={`Edit ${survey.title}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-5">

                  <h3 className="font-bold text-lg text-[#1E1B4B] leading-snug">
                    {survey.title}
                  </h3>

                  <p className="mt-2 text-[13px] font-semibold text-indigo-500">
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
                    <p className="text-[13px] font-semibold text-slate-400">
                      Questions
                    </p>
                    <p className="font-black text-slate-700 mt-1">
                      {survey.questions_data?.length || 0}
                      {(survey.questions_data_post?.length || 0) > 0 && (
                        <span title="Form A + Form B"> + {survey.questions_data_post!.length}</span>
                      )}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[13px] font-semibold text-slate-400">
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
                    className={`flex-1 h-11 rounded-xl font-bold text-sm ${ survey.status ==="active"
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
                    className="h-11 w-11 rounded-xl"
                    title="Duplicate"
                    aria-label={`Duplicate ${survey.title}`}
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
                    className="h-11 w-11 rounded-xl text-rose-500 hover:bg-rose-50"
                    title="Archive"
                    aria-label={`Archive ${survey.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>

                </div>

                    </Card>
                  ))}
                </div>
              </div>
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
                  className="mt-2 h-12 rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE]"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-600">
                  Survey type
                </label>

                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 rounded-xl border-2 border-slate-100 p-3 cursor-pointer has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="type"
                        value="knowledge"
                        defaultChecked
                        className="accent-indigo-600"
                      />
                      <span className="text-xs font-black text-slate-800">
                        Knowledge Assessment
                      </span>
                    </span>
                    <span className="text-[13px] text-slate-400 font-medium pl-6">
                      Scored — has correct answers
                    </span>
                  </label>

                  <label className="flex flex-col gap-1 rounded-xl border-2 border-slate-100 p-3 cursor-pointer has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="type"
                        value="opinion"
                        className="accent-indigo-600"
                      />
                      <span className="text-xs font-black text-slate-800">
                        Opinion Survey
                      </span>
                    </span>
                    <span className="text-[13px] text-slate-400 font-medium pl-6">
                      Unscored — no correct answer
                    </span>
                  </label>
                </div>
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
                  IEC category
                </label>

                {/* Optional, unlike Category above — no defaultValue, so
                    "No IEC Category" is the default and createSurvey()
                    stores null rather than an empty string. */}
                <select
                  name="iec_category"
                  defaultValue=""
                  className="mt-2 w-full h-12 rounded-xl bg-slate-50 px-4 text-sm font-bold outline-none"
                >
                  <option value="">No IEC Category</option>
                  {IEC_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
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
                  className="mt-2 w-full min-h-[110px] rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] p-4 text-sm outline-none resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={creating}
                className="w-full h-12 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] font-semibold text-xs"
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
          {/* The default DialogClose (absolute top-4 right-4, dark icon)
              was landing right on top of this dialog's own dark header
              and count badge, unstyled for a dark background — hidden
              here in favor of the header's own close button below. */}
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl p-0 flex flex-col [&>button:last-child]:hidden">

            <div className="p-6 bg-slate-900 text-white shrink-0">
              <div className="flex justify-between items-start gap-4">

                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-indigo-300">
                    Survey responses
                  </p>

                  <h2 className="text-xl md:text-2xl font-black mt-1 truncate">
                    {viewingResponses?.title}
                  </h2>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center">
                    <span className="text-xl font-black">
                      {responses.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewingResponses(null)}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
                  <p className="mt-3 text-xs font-semibold text-slate-400">
                    No student responses yet.
                  </p>
                </div>
              ) : (
                responses.map((response: any) => {
                  const isExpanded = expandedResponseId === response.id;
                  return (
                  <Card
                    key={response.id}
                    className="rounded-2xl border-none overflow-hidden"
                  >

                    <div
                      className="bg-slate-900 text-white p-4 flex justify-between items-center gap-3 cursor-pointer"
                      onClick={() =>
                        setExpandedResponseId(isExpanded ? null : response.id)
                      }
                    >

                      <div className="min-w-0">
                        <h3 className="font-black truncate">
                          {response.studentName}
                        </h3>

                        <p className="text-[13px] text-slate-400 mt-1">
                          {response.studentNumber
                            ? `${response.studentNumber} · `
                            : ""}
                          {response.created_at
                            ? new Date(
                                response.created_at
                              ).toLocaleString()
                            : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <CheckCircle2 className="text-emerald-400 w-5 h-5" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteResponseTarget({
                              id: response.id,
                              studentName: response.studentName,
                            });
                          }}
                          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/80 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                          title="Delete this response"
                          aria-label="Delete this response"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-white/60" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-white/60" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-5 grid md:grid-cols-2 gap-4">

                        {(() => {
                          // A post-test answered on Form B is shown against
                          // Form B, each item labelled with its Form A pair.
                          const formA = viewingResponses?.questions_data || [];
                          const formB = viewingResponses?.questions_data_post || [];
                          const onFormB = response.attempt_type === "post" && formB.length > 0;
                          return (onFormB ? formB : formA).map((question, qIndex) => ({
                            question,
                            label: onFormB
                              ? (() => {
                                  const pairIndex = formA.findIndex((a) => String(a.id) === String(question.pairs_with));
                                  return `B${qIndex + 1}${pairIndex >= 0 ? ` · pairs with A${pairIndex + 1}` : ""}`;
                                })()
                              : response.attempt_type
                                ? `A${qIndex + 1}`
                                : null,
                          }));
                        })().map(
                          ({ question, label }) => (
                            <div
                              key={question.id}
                              className="bg-slate-50 rounded-xl p-4"
                            >
                              {label && (
                                <p className="text-[13px] font-semibold text-indigo-500 mb-1">{label}</p>
                              )}
                              <p className="text-[13px] font-semibold text-slate-400">
                                {question.text}
                              </p>

                              <p className="mt-2 font-bold text-slate-800 text-sm">
                                {(() => {
                                  const given = response.answers?.[question.id];
                                  if (given === undefined || given === null) {
                                    return "No response";
                                  }
                                  // checkbox answers are stored as an array of
                                  // the selected option strings.
                                  return Array.isArray(given)
                                    ? given.join(", ") || "No response"
                                    : String(given);
                                })()}
                              </p>
                            </div>
                          )
                        )}

                      </div>
                    )}
                  </Card>
                  );
                })
              )}

            </div>
          </DialogContent>
        </Dialog>

        {/* DELETE RESPONSE CONFIRMATION */}
        <Dialog
          open={!!deleteResponseTarget}
          onOpenChange={(open) => {
            if (!open && !deletingResponse) setDeleteResponseTarget(null);
          }}
        >
          <DialogContent className="max-w-md rounded-3xl p-7 text-center">

            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
              <AlertCircle />
            </div>

            <DialogHeader className="mt-4">
              <DialogTitle className="text-xl font-black text-center">
                Delete This Response?
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-slate-500 mt-2">
              This removes <strong>{deleteResponseTarget?.studentName}</strong>'s
              submitted answers permanently. This can't be undone.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-6">

              <Button
                variant="ghost"
                disabled={deletingResponse}
                onClick={() => setDeleteResponseTarget(null)}
                className="rounded-xl font-black"
              >
                Cancel
              </Button>

              <Button
                onClick={handleDeleteResponse}
                disabled={deletingResponse}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black"
              >
                {deletingResponse ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </Button>

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
                Move to Archive?
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-slate-500 mt-2">
              <strong>{deleteTargetTitle}</strong> will disappear from this list, but
              you can restore it or delete it permanently from the Archive screen.
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
                Move to Archive
              </Button>

            </div>

          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}