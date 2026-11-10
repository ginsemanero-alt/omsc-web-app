import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import StatTile from "./StatTile";
import { supabase } from "../../lib/supabase";
import { SURVEY_COLUMNS, withAdminForms } from "../../lib/surveyForms";

import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

import {
  Download,
  Users,
  GraduationCap,
  BarChart3,
  ClipboardList,
  Loader2,
  FileText,
  RefreshCw,
  Accessibility,
  Globe2,
  ShieldCheck,
  BookOpen,
  Layers,
  FileStack,
  CalendarDays,
  TrendingUp,
  Image as ImageIcon,
  Video,
  File,
  Trophy,
  Target,
  Sparkles,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchAnalyticsInsight, type AnalyticsInsightResult } from "../../lib/analyticsInsight";
import { campusLabel } from "../../lib/campuses";
import LearningGainSection from "./LearningGainSection";
import {
  ALL as ALL_FILTER,
  DEFAULT_FILTERS,
  NO_MATCH_TEXT,
  PARTICIPANTS_DEFINITION,
  describeFilters,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters as anyFilterActive,
  isSmallGroup,
  smallGroupNote,
  withSmallGroupNote,
  type AnalyticsFilters,
} from "../../lib/analyticsFilters";
import { drawEmptyLine, drawNoMatchBanner, drawWrappedCaption } from "../../lib/analyticsPdf";
import { downloadReportXlsx, type ReportModel, type ReportSection } from "../../lib/analyticsExcel";
import MaterialReachSection from "./MaterialReachSection";
import {
  fetchMaterialReach,
  UNFILTERED_REACH,
  type MaterialReachSummary,
} from "../../lib/materialReach";
import {
  AGE_BRACKETS,
  SMALL_SAMPLE_N,
  T_TEST_CAUTION_N,
  pairedTTest,
  yearLevelLabel,
  buildLearningGainParams,
} from "../../lib/learningGain";

/* =========================================================
   TYPES
========================================================= */

interface Profile {
  id: string;
  student_id?: string | null;
  full_name?: string | null;
  user_role?: string | null;
  course_year_section?: string | null;
  created_at?: string | null;
  campus?: string | null;
  program?: string | null;
  year_level?: string | number | null;
  age?: number | null;
  gender?: string | null;
  contact_no?: string | null;
  is_ip?: boolean | null;
  is_pwd?: boolean | null;
}

interface GuidanceProgram {
  id: string | number;
  title?: string | null;
  name?: string | null;
  category?: string | null;
  status?: string | null;
  created_at?: string | null;
  guidance_service?: string | null;
}

const GUIDANCE_SERVICES = [
  "Information Services",
  "Individual Inventory",
  "Research and Evaluation",
  "Career Orientation",
  "Testing Services",
  "Counseling Services",
];

interface Survey {
  id: string | number;
  title: string;
  status?: string | null;
  type?: string | null;
  // The program a knowledge assessment is the pre-test / post-test for.
  program_id?: string | number | null;
  iec_category?: string | null;
  questions_data?: any[];
  // Form B, the parallel post-test form (PHASE 27).
  questions_data_post?: any[] | null;
  created_at?: string | null;
}

interface SurveyResponse {
  id: string | number;
  survey_id?: string | number | null;
  user_id?: string | null;
  student_id?: string | null;
  answers?: Record<string, any> | null;
  created_at?: string | null;
  score?: number | null;
  total_scored?: number | null;
  percentage?: number | null;
  attempt_type?: "pre" | "post" | null;
}

// Bridges survey_responses.user_id (a bigint FK to users.id) to
// profiles (keyed on the auth uuid): users.id -> users.student_id ->
// profiles.student_id. Neither users.id nor profiles.id can be
// compared directly to each other. `email` and `is_test_account` are
// here for the Material Exposure panel below: activity_logs rows are
// keyed by actor_email (not user_id), and seeded/load-test accounts
// must never count toward that comparison.
interface UserBridge {
  id: string | number;
  student_id?: string | null;
  email?: string | null;
  is_test_account?: boolean | null;
}

// One row per material-view event (see IECMaterials.tsx's logMaterialView).
// entity_id is text and shared across every entity_type activity_logs
// tracks — for entity_type='material' rows it's always a stringified
// numeric material id, but the column itself carries UUIDs for other
// rows (surveys), so it's never assumed numeric without checking first.
interface MaterialViewLog {
  actor_email: string | null;
  entity_id: string | null;
}

/* =========================================================
   MATERIALS TABLE
========================================================= */

interface Material {
  id: string | number;
  created_at?: string | null;

  file_url?: string | null;

  type?: string | null;
  format?: string | null;
  size?: string | null;

  campus?: string | null;
  title?: string | null;

  downloads?: number | null;

  material_type?: string | null;
  video_url?: string | null;

  category?: string | null;
  description?: string | null;

  program_id?: string | number | null;

  tags?: string[] | null;
}

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  className?: string;
  to?: string;
  ariaLabel?: string;
  noteTo?: string;
  noteAriaLabel?: string;
  info?: string;
}

/* =========================================================
   COLORS
========================================================= */

const COLORS = [
  "#4f46e5",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#059669",
  "#0284c7",
  "#ca8a04",
  "#dc2626",
];

/* =========================================================
   STAT CARD
========================================================= */

/* =========================================================
   TABS
========================================================= */

type AnalyticsTab = "overview" | "learning" | "awareness" | "iec" | "students";

const ANALYTICS_TABS: { id: AnalyticsTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "learning", label: "Learning gain", icon: TrendingUp },
  { id: "awareness", label: "Knowledge awareness", icon: Trophy },
  { id: "iec", label: "IEC materials", icon: BookOpen },
  { id: "students", label: "Students and inclusion", icon: Users },
];

// "Awareness by material exposure" is switched off. It compares scores by whether a student opened an
// IEC material of the SURVEY'S category, which relies on surveys.iec_category; no survey has that field set
// (knowledge checks are linked to materials through program_materials instead), so the block was always
// empty ("No responses have been recorded yet"). The code is kept; flip this to bring it back once it is
// rebuilt on program_materials + material_views.
const SHOW_MATERIAL_EXPOSURE = false;

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

// White pill tab bar (same as the Content page).
const AnalyticsTabBar: React.FC<{
  activeTab: AnalyticsTab;
  onChange: (tab: AnalyticsTab) => void;
}> = ({ activeTab, onChange }) => (
  <div
    role="tablist"
    aria-label="Analytics sections"
    className="self-start max-w-full flex gap-1 overflow-x-auto p-[5px] rounded-full bg-white"
  >
    {ANALYTICS_TABS.map(({ id, label }) => {
      const active = activeTab === id;
      return (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(id)}
          className={`shrink-0 h-11 px-[18px] rounded-full text-sm whitespace-nowrap transition-colors ${focusRing} ${
            active ? "bg-[#1E1B4B] text-white font-bold" : "text-[#334155] font-semibold hover:bg-[#EEF0FA]"
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

// A number is a link ONLY when the list it opens shows that same count.
// Otherwise it stays plain text with an "i" button saying what it counts.
const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  className = "",
  to,
  ariaLabel,
  noteTo,
  noteAriaLabel,
  info,
}) => (
  <StatTile
    variant="analytics"
    label={title}
    value={value}
    note={description}
    className={className}
    to={to}
    ariaLabel={ariaLabel}
    noteTo={noteTo}
    noteAriaLabel={noteAriaLabel}
    info={info}
  />
);

/* =========================================================
   INCLUSION BREAKDOWN LIST

   Counts-only list (campus / program / year level) for the PWD and
   IP cards — never names, per the privacy notice shown at
   registration.
========================================================= */

interface BreakdownRow {
  label: string;
  count: number;
}

const InclusionBreakdownList: React.FC<{
  title: string;
  rows: BreakdownRow[];
  accentClassName: string;
}> = ({ title, rows, accentClassName }) => (
  <div>
    <p className="text-[13px] font-semibold text-slate-400 mb-2">
      {title}
    </p>

    {rows.length === 0 ? (
      <p className="text-[13px] font-bold text-slate-300">None</p>
    ) : (
      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="text-slate-600 font-bold truncate">
              {row.label}
            </span>
            <span
              className={`shrink-0 font-semibold px-2 py-0.5 rounded-full text-[13px] ${accentClassName}`}
            >
              {row.count}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

/* =========================================================
   HELPERS
========================================================= */

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalize(value: unknown): string {
  return safeString(value).toLowerCase().trim();
}

function getProgramName(program: GuidanceProgram): string {
  return (
    safeString(program.title) ||
    safeString(program.name) ||
    "Unnamed Guidance Program"
  );
}

function getYearLevel(value: unknown): string {
  const year = safeString(value);

  if (!year) return "Not Specified";

  if (year === "1") return "1st Year";
  if (year === "2") return "2nd Year";
  if (year === "3") return "3rd Year";
  if (year === "4") return "4th Year";
  if (year === "5") return "5th Year";

  return year;
}

function getAgeGroup(age: unknown): string {
  const n = Number(age);

  if (!Number.isFinite(n)) return "Not Specified";
  if (n < 18) return "Below 18";
  if (n <= 20) return "18–20";
  if (n <= 22) return "21–22";
  if (n <= 24) return "23–24";
  if (n <= 26) return "25–26";

  return "27+";
}

function escapeCSV(value: unknown): string {
  const text = safeString(value).replace(/"/g, '""');
  return `"${text}"`;
}

function isSameMonth(dateValue?: string | null): boolean {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function isSameYear(dateValue?: string | null): boolean {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  const now = new Date();

  return date.getFullYear() === now.getFullYear();
}

// Ported from the retired ReportsCenter screen — the "Export Report"
// action reproduces its exact output, so its own date-range filtering
// and averaging logic (independent of this dashboard's Campus/Program/
// Year/Gender/Academic Year dropdown filters) comes along unchanged.
function isWithinRange(dateStr: string | null | undefined, start: string, end: string): boolean {
  if (!start && !end) return true;
  if (!dateStr) return false;

  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return false;

  if (start && d < new Date(start).getTime()) return false;
  if (end && d > new Date(`${end}T23:59:59`).getTime()) return false;

  return true;
}

// The form a response was answered on: Form B for a post-test when the
// assessment has one (PHASE 27), otherwise Form A. Answers are keyed by
// question id, so a Form B answer only matches Form B questions.
function questionsForResponse(
  survey: Survey | undefined,
  response: { attempt_type?: "pre" | "post" | null }
): any[] {
  const formB = Array.isArray(survey?.questions_data_post) ? survey!.questions_data_post! : [];
  if (response.attempt_type === "post" && formB.length > 0) return formB;
  return Array.isArray(survey?.questions_data) ? survey!.questions_data : [];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [programs, setPrograms] = useState<GuidanceProgram[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<
    SurveyResponse[]
  >([]);
  const [userBridge, setUserBridge] = useState<UserBridge[]>([]);
  const [materialViewLogs, setMaterialViewLogs] = useState<MaterialViewLog[]>([]);

  /* MATERIALS */

  const [materials, setMaterials] = useState<Material[]>([]);
  // PHASE 41: program_materials, so the Program filter can narrow the materials sections too.
  const [programMaterialLinks, setProgramMaterialLinks] = useState<{ program_id: number | string; material_id: number | string }[]>([]);

  /* FILTERS */

  // Every filter (and the tab) lives in the URL, like the Activity Log, so a
  // filtered view survives a reload and can be shared with another admin.
  const [searchParams, setSearchParams] = useSearchParams();
  const paramsKey = searchParams.toString();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(paramsKey)), [paramsKey]);
  const tabParam = searchParams.get("tab");
  const activeTab: AnalyticsTab = ANALYTICS_TABS.some((t) => t.id === tabParam) ? (tabParam as AnalyticsTab) : "overview";

  const setActiveTab = (tab: AnalyticsTab) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (tab === "overview") next.delete("tab");
      else next.set("tab", tab);
      return next;
    });

  // Picking a filter replaces the history entry (like the Activity Log), so
  // the Back button is not filled with every dropdown change.
  const updateFilters = (patch: Partial<AnalyticsFilters>) =>
    setSearchParams((previous) => filtersToParams({ ...filtersFromParams(previous), ...patch }, previous), { replace: true });
  const clearFilters = () => updateFilters(DEFAULT_FILTERS);

  const selectedCampus = filters.campus;
  // NOTE: "selectedProgram" is the student's degree COURSE (its old name,
  // kept so the code below stays recognisable). The new Program filter is a
  // GUIDANCE program: selectedGuidanceProgram.
  const selectedProgram = filters.course;
  const selectedYearLevel = filters.yearLevel;
  const selectedGender = filters.gender;
  const selectedAge = filters.age;
  const selectedAcademicYear = filters.academicYear;
  const selectedGuidanceProgram = filters.program;
  const selectedPwd = filters.pwd;
  const selectedIp = filters.ip;

  const setSelectedProgram = (value: string) => updateFilters({ course: value });
  const setSelectedYearLevel = (value: string) => updateFilters({ yearLevel: value });
  const setSelectedGender = (value: string) => updateFilters({ gender: value });
  const setSelectedAge = (value: string) => updateFilters({ age: value });
  const setSelectedAcademicYear = (value: string) => updateFilters({ academicYear: value });

  // Changing campus resets the course filter — a previously-selected
  // course almost certainly doesn't belong to the newly-picked campus,
  // and silently keeping an invisible/mismatched filter active would be
  // more confusing than just clearing it. Same behavior as
  // UserManagement.tsx's handleCampusFilterChange.
  const handleCampusFilterChange = (value: string) => updateFilters({ campus: value, course: ALL_FILTER });

  useEffect(() => {
    if (
      !loading &&
      selectedGuidanceProgram !== ALL_FILTER &&
      programs.length > 0 &&
      !programs.some((p) => safeString(p.id) === selectedGuidanceProgram)
    ) {
      updateFilters({ program: ALL_FILTER });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, programs, selectedGuidanceProgram]);

  /* MATERIAL REACH BY COURSE (PHASE 32) — the aggregation is the
     material_reach_summary RPC; it follows the filters above plus its own
     IEC program selector and test-accounts switch (this section only). */

  const [reachIecProgramId, setReachIecProgramId] = useState("all");
  const [reachIncludeTest, setReachIncludeTest] = useState(false);
  const [materialReach, setMaterialReach] = useState<MaterialReachSummary | null>(null);
  const [reachLoading, setReachLoading] = useState(false);
  const [reachError, setReachError] = useState<string | null>(null);

  const reachFilters = useMemo(
    () => ({
      campus: selectedCampus,
      course: selectedProgram,
      yearLevel: selectedYearLevel,
      gender: selectedGender,
      age: selectedAge,
      academicYear: selectedAcademicYear,
      // With a guidance program on the shared bar, "reached" means that program's own materials.
      iecProgramId: selectedGuidanceProgram !== ALL_FILTER ? selectedGuidanceProgram : reachIecProgramId,
      includeTest: reachIncludeTest,
      guidanceProgramId: selectedGuidanceProgram,
      pwd: selectedPwd,
      ip: selectedIp,
    }),
    [
      selectedCampus,
      selectedProgram,
      selectedYearLevel,
      selectedGender,
      selectedAge,
      selectedAcademicYear,
      selectedGuidanceProgram,
      selectedPwd,
      selectedIp,
      reachIecProgramId,
      reachIncludeTest,
    ]
  );

  const onLearningTab = activeTab === "learning";

  useEffect(() => {
    // The Learning gain tab has its own data and filters.
    if (onLearningTab) return;

    let stale = false;
    setReachLoading(true);
    setReachError(null);

    fetchMaterialReach(reachFilters)
      .then((result) => {
        if (!stale) setMaterialReach(result);
      })
      .catch((err) => {
        console.error("Material reach:", err);
        if (!stale) setReachError(err?.message || "Unknown error");
      })
      .finally(() => {
        if (!stale) setReachLoading(false);
      });

    return () => {
      stale = true;
    };
  }, [onLearningTab, reachFilters]);

  /* EXPORT REPORT — ported from the retired ReportsCenter screen; its
     own date-range filter, independent of the dropdowns above. */

  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);

  /* AI INSIGHT — one plain-language explanation of the whole dashboard,
     via /api/analytics-insight (OpenRouter, server-side only). */

  const [insight, setInsight] = useState<AnalyticsInsightResult | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  /* =======================================================
     FETCH DATA
  ======================================================= */

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    try {
      setLoading(true);

      const [
        profilesResult,
        programsResult,
        surveysResult,
        responsesResult,
        materialsResult,
        userBridgeResult,
        materialViewLogsResult,
        programMaterialsResult,
        profileLinksResult,
      ] = await Promise.all([
        supabase.from("profiles").select("*"),

        supabase
          .from("programs")
          .select("*")
          .is("archived_at", null)
          .order("created_at", { ascending: false }),

        supabase
          .from("surveys")
          .select(SURVEY_COLUMNS)
          .is("archived_at", null)
          .order("created_at", { ascending: false }),

        supabase
          .from("survey_responses")
          .select("*")
          .order("created_at", { ascending: false }),

        /* ================================================
           IEC MATERIALS
        ================================================ */

        supabase
          .from("materials")
          .select("*")
          .is("archived_at", null)
          .order("created_at", { ascending: false }),

        // Bridges survey_responses.user_id to profiles via student_id
        // (see UserBridge above). email is also needed here: the
        // Material Exposure panel joins activity_logs, which is keyed
        // by actor_email, not user_id. Archived users are excluded —
        // their historical responses still count (that table isn't
        // touched by archiving), but they shouldn't resolve to a live
        // student identity here.
        // Anonymized students are archived too, but their answers and
        // demographics must keep counting (PHASE 50), so they stay in.
        supabase.from("users").select("id, student_id, email, is_test_account").or("archived_at.is.null,anonymized_at.not.is.null"),

        // Material Exposure panel — every recorded "opened a material"
        // event. Scoped to action='view'/entity_type='material' only
        // (not the whole table) since that's all this needs.
        supabase
          .from("activity_logs")
          .select("actor_email, entity_id")
          .eq("action", "view")
          .eq("entity_type", "material"),

        // PHASE 41: which IEC materials are linked to which program.
        supabase.from("program_materials").select("program_id, material_id"),

        // PHASE 52: which profile each users row belongs to, found by the
        // sign-in (auth) id, not the student ID. If this fails (the SQL not
        // run yet, a network error) the page falls back to the old matching.
        supabase.rpc("admin_user_profile_links"),
      ]);

      if (profilesResult.error) {
        console.error("Profiles:", profilesResult.error);
      }

      if (programsResult.error) {
        console.error("Programs:", programsResult.error);
      }

      if (surveysResult.error) {
        console.error("Surveys:", surveysResult.error);
      }

      if (responsesResult.error) {
        console.error("Survey responses:", responsesResult.error);
      }

      if (materialsResult.error) {
        console.error("Materials:", materialsResult.error);
      }

      if (userBridgeResult.error) {
        console.error("Users bridge:", userBridgeResult.error);
      }

      if (materialViewLogsResult.error) {
        console.error("Material view logs:", materialViewLogsResult.error);
      }

      // PHASE 52: one student, one identity. Every panel below keys students
      // by profiles.student_id, but nine students have a different student ID
      // in `users`, so they were counted twice and fell out of the filters.
      // Where the sign-in id links a users row to a profile, that profile's
      // student ID is used for the row. A profile no users row points to
      // (it is not on the Users page) is left out of the counts.
      const profileLinks = profileLinksResult.error
        ? null
        : ((profileLinksResult.data || []) as {
            link_user_id: number | string;
            link_profile_id: string | null;
            link_student_id: string | null;
          }[]);
      if (profileLinksResult.error) {
        console.error("Profile links:", profileLinksResult.error);
      }
      const studentIdByUserId = new Map<string, string>();
      const linkedProfileIds = new Set<string>();
      // The bridge already holds only live accounts (archived ones left out,
      // anonymized ones kept), so an archived student's profile drops out
      // here too, matching the Users page.
      const liveUserIds = new Set(
        ((userBridgeResult.data || []) as UserBridge[]).map((user) => String(user.id))
      );
      (profileLinks || []).forEach((link) => {
        if (link.link_profile_id && liveUserIds.has(String(link.link_user_id))) {
          linkedProfileIds.add(link.link_profile_id);
        }
        if (link.link_student_id) {
          studentIdByUserId.set(String(link.link_user_id), link.link_student_id);
        }
      });
      const allProfiles = (profilesResult.data || []) as Profile[];

      setProfiles(
        profileLinks
          ? allProfiles.filter((profile) => linkedProfileIds.has(String(profile.id)))
          : allProfiles
      );
      setPrograms((programsResult.data || []) as GuidanceProgram[]);
      // The forms (item analysis needs the answer keys) come from
      // admin_survey_forms(): the columns aren't readable directly.
      let surveyRows = (surveysResult.data || []) as any[];
      try {
        surveyRows = await withAdminForms(surveyRows);
      } catch (formsError) {
        console.error("Survey forms:", formsError);
      }
      setSurveys(surveyRows as Survey[]);
      // Knowledge assessments are now taken twice (pre-test + post-test,
      // PHASE 22). Every section below predates that and treats one row
      // as one student's answer, so keep only each student's latest
      // attempt here: a pre-test drops out once its post-test exists.
      // Pre vs post is compared separately, in the Learning Gain section.
      const allResponses = (responsesResult.data || []) as (SurveyResponse & {
        attempt_type?: "pre" | "post" | null;
      })[];
      const hasPost = new Set(
        allResponses
          .filter((r) => r.attempt_type === "post")
          .map((r) => `${r.user_id}|${r.survey_id}`)
      );
      setSurveyResponses(
        allResponses.filter(
          (r) =>
            r.attempt_type !== "pre" ||
            !hasPost.has(`${r.user_id}|${r.survey_id}`)
        ) as SurveyResponse[]
      );

      setMaterials((materialsResult.data || []) as Material[]);
      setUserBridge(
        ((userBridgeResult.data || []) as UserBridge[]).map((user) => ({
          ...user,
          student_id: studentIdByUserId.get(String(user.id)) || user.student_id,
        }))
      );
      setMaterialViewLogs((materialViewLogsResult.data || []) as MaterialViewLog[]);
      setProgramMaterialLinks((programMaterialsResult.data || []) as { program_id: number | string; material_id: number | string }[]);
    } catch (error) {
      console.error("Analytics loading error:", error);
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     FILTER OPTIONS
  ======================================================= */

  const campusOptions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .map((p) => safeString(p.campus))
          .filter(Boolean)
      )
    ).sort();
  }, [profiles]);

  // Scoped to the selected campus — same reasoning as UserManagement.tsx's
  // own programOptions: San Jose's course list has no reason to show a
  // Labangan-only program. "All Campuses" falls back to every course
  // across all campuses.
  const programOptions = useMemo(() => {
    const scoped =
      selectedCampus === "all"
        ? profiles
        : profiles.filter(
            (p) => normalize(p.campus) === normalize(selectedCampus)
          );

    return Array.from(
      new Set(
        scoped
          .map((p) => safeString(p.program))
          .filter(Boolean)
      )
    ).sort();
  }, [profiles, selectedCampus]);

  const yearLevelOptions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .map((p) => getYearLevel(p.year_level))
          .filter((x) => x !== "Not Specified")
      )
    ).sort();
  }, [profiles]);

  const genderOptions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .map((p) => safeString(p.gender))
          .filter(Boolean)
      )
    ).sort();
  }, [profiles]);

  // Fixed bucket order (not sorted alphabetically) so "Below 18" and
  // "27+" land at the ends instead of wherever they'd fall as strings —
  // same buckets ageAnalytics charts, minus "Not Specified" since that
  // isn't something you can filter down to meaningfully.
  const ageGroupOptions = useMemo(() => {
    const order = ["Below 18", "18–20", "21–22", "23–24", "25–26", "27+"];
    const present = new Set(profiles.map((p) => getAgeGroup(p.age)));
    return order.filter((group) => present.has(group));
  }, [profiles]);

  const academicYearOptions = useMemo(() => {
    const years = new Set<string>();

    profiles.forEach((p) => {
      if (!p.created_at) return;

      const year = new Date(p.created_at).getFullYear();

      if (Number.isFinite(year)) {
        years.add(String(year));
      }
    });

    surveyResponses.forEach((r) => {
      if (!r.created_at) return;

      const year = new Date(r.created_at).getFullYear();

      if (Number.isFinite(year)) {
        years.add(String(year));
      }
    });

    materials.forEach((m) => {
      if (!m.created_at) return;

      const year = new Date(m.created_at).getFullYear();

      if (Number.isFinite(year)) {
        years.add(String(year));
      }
    });

    return Array.from(years).sort().reverse();
  }, [
    profiles,
    surveyResponses,
    materials,
  ]);

  /* =======================================================
     FILTER STATE
  ======================================================= */

  const hasActiveFilters = anyFilterActive(filters);

  // PHASE 41. "Participants" of a program = students who answered (pre-test
  // or post-test) that program's awareness check.
  const programParticipantStudentIds = useMemo(() => {
    if (selectedGuidanceProgram === ALL_FILTER) return null;
    const programSurveyIds = new Set(
      surveys
        .filter((survey) => survey.type === "knowledge" && safeString(survey.program_id) === selectedGuidanceProgram)
        .map((survey) => safeString(survey.id))
    );
    const studentByUserId: Record<string, string> = {};
    userBridge.forEach((user) => {
      const studentId = safeString(user.student_id);
      if (studentId) studentByUserId[safeString(user.id)] = studentId;
    });
    const ids = new Set<string>();
    surveyResponses.forEach((response) => {
      if (!programSurveyIds.has(safeString(response.survey_id))) return;
      const studentId = studentByUserId[safeString(response.user_id)] || safeString(response.student_id);
      if (studentId) ids.add(studentId);
    });
    return ids;
  }, [selectedGuidanceProgram, surveys, surveyResponses, userBridge]);

  // The program, its surveys and its materials, when one is chosen.
  const scopedPrograms = useMemo(
    () => (selectedGuidanceProgram === ALL_FILTER ? programs : programs.filter((p) => safeString(p.id) === selectedGuidanceProgram)),
    [programs, selectedGuidanceProgram]
  );
  const scopedSurveys = useMemo(
    () => (selectedGuidanceProgram === ALL_FILTER ? surveys : surveys.filter((s) => safeString(s.program_id) === selectedGuidanceProgram)),
    [surveys, selectedGuidanceProgram]
  );
  const programMaterialIds = useMemo(() => {
    if (selectedGuidanceProgram === ALL_FILTER) return null;
    return new Set(
      programMaterialLinks
        .filter((link) => safeString(link.program_id) === selectedGuidanceProgram)
        .map((link) => safeString(link.material_id))
    );
  }, [programMaterialLinks, selectedGuidanceProgram]);

  // The Program filter's options: every program, grouped by guidance service.
  const programFilterGroups = useMemo(() => {
    const byService = new Map<string, { id: string; label: string }[]>();
    programs.forEach((program) => {
      const service = safeString(program.guidance_service) || "Not categorized";
      if (!byService.has(service)) byService.set(service, []);
      byService.get(service)!.push({ id: safeString(program.id), label: getProgramName(program).trim() });
    });
    const order = [...GUIDANCE_SERVICES, "Not categorized"];
    return order
      .filter((service) => byService.has(service))
      .map((service) => ({
        service,
        items: byService.get(service)!.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [programs]);

  // The program name as the exports print it.
  const selectedProgramName = useMemo(() => {
    const program = programs.find((p) => safeString(p.id) === selectedGuidanceProgram);
    return program ? getProgramName(program).trim() : undefined;
  }, [programs, selectedGuidanceProgram]);

  /* =======================================================
     FILTERED PROFILES
  ======================================================= */

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      const campusMatch =
        selectedCampus === "all" ||
        normalize(profile.campus) ===
          normalize(selectedCampus);

      const programMatch =
        selectedProgram === "all" ||
        normalize(profile.program) ===
          normalize(selectedProgram);

      const yearMatch =
        selectedYearLevel === "all" ||
        normalize(getYearLevel(profile.year_level)) ===
          normalize(selectedYearLevel);

      const genderMatch =
        selectedGender === "all" ||
        normalize(profile.gender) ===
          normalize(selectedGender);

      const ageMatch =
        selectedAge === "all" ||
        getAgeGroup(profile.age) === selectedAge;

      const academicYearMatch =
        selectedAcademicYear === "all" ||
        (profile.created_at &&
          String(
            new Date(profile.created_at).getFullYear()
          ) === selectedAcademicYear);

      const guidanceProgramMatch =
        programParticipantStudentIds === null ||
        programParticipantStudentIds.has(safeString(profile.student_id));

      // PWD / IP only narrow the group; nothing here lists or names a student.
      const pwdMatch =
        selectedPwd === ALL_FILTER || (selectedPwd === "pwd") === (profile.is_pwd === true);

      const ipMatch =
        selectedIp === ALL_FILTER || (selectedIp === "ip") === (profile.is_ip === true);

      return (
        campusMatch &&
        programMatch &&
        yearMatch &&
        genderMatch &&
        ageMatch &&
        academicYearMatch &&
        guidanceProgramMatch &&
        pwdMatch &&
        ipMatch
      );
    });
  }, [
    profiles,
    selectedCampus,
    selectedProgram,
    selectedYearLevel,
    selectedGender,
    selectedAge,
    selectedAcademicYear,
    programParticipantStudentIds,
    selectedPwd,
    selectedIp,
  ]);

  /* =======================================================
     FILTERED STUDENT IDS
  ======================================================= */

  const filteredStudentIds = useMemo(() => {
    return new Set(
      filteredProfiles
        .map((p) => safeString(p.student_id))
        .filter(Boolean)
    );
  }, [filteredProfiles]);

  /* =======================================================
     SURVEY RESPONSES
  ======================================================= */

  // survey_responses.user_id is a bigint FK to users.id, which has no
  // direct relationship to profiles.id (a uuid) or profiles.student_id.
  // Bridge it via users.student_id, which matches profiles.student_id.
  const userIdToStudentId = useMemo(() => {
    const map: Record<string, string> = {};

    userBridge.forEach((user) => {
      const studentId = safeString(user.student_id);
      if (studentId) {
        map[safeString(user.id)] = studentId;
      }
    });

    return map;
  }, [userBridge]);

  const filteredSurveyResponses = useMemo(() => {
    const surveyById = new Map(surveys.map((survey) => [safeString(survey.id), survey]));

    return surveyResponses.filter((response) => {
      // With a program chosen, only answers to THAT program's awareness check count.
      if (selectedGuidanceProgram !== ALL_FILTER) {
        const survey = surveyById.get(safeString(response.survey_id));
        if (!survey || survey.type !== "knowledge" || safeString(survey.program_id) !== selectedGuidanceProgram) {
          return false;
        }
      }

      if (!hasActiveFilters) {
        return true;
      }

      const studentId =
        userIdToStudentId[safeString(response.user_id)] ||
        safeString(response.student_id);

      return !!studentId && filteredStudentIds.has(studentId);
    });
  }, [
    surveyResponses,
    userIdToStudentId,
    filteredStudentIds,
    hasActiveFilters,
    selectedGuidanceProgram,
    surveys,
  ]);

  /* =======================================================
     MATERIAL FILTERING
     
     Materials do not have student/user IDs.
     
     Therefore:
     - Campus filter applies to materials.
     - Academic year filter applies to created_at.
     - A Program filter keeps only that program's linked materials.
     - Year/gender/PWD/IP filters do not alter materials.
  ======================================================= */

  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => {
      // Program handouts live in this same table (materials.program_id
      // set) but belong to that program's own details panel, not the
      // general IEC Materials library — same exclusion the public
      // MaterialsPage applies. Left in, they swamp this section's counts
      // (handouts far outnumber curated IEC uploads) and, since handouts
      // are never given a `type`/`format`, drag every format/recent-list
      // stat here down to "Unknown".
      if (material.program_id) return false;

      const campus = normalize(material.campus);

      // No campus = university-wide, so it counts under every campus.
      const campusMatch =
        selectedCampus === "all" ||
        !campus ||
        campus === normalize(selectedCampus) ||
        campus === "universal";

      const academicYearMatch =
        selectedAcademicYear === "all" ||
        (material.created_at &&
          String(
            new Date(material.created_at).getFullYear()
          ) === selectedAcademicYear);

      const programMatch =
        programMaterialIds === null || programMaterialIds.has(safeString(material.id));

      return campusMatch && academicYearMatch && programMatch;
    });
  }, [
    materials,
    selectedCampus,
    selectedAcademicYear,
    programMaterialIds,
  ]);

  /* =======================================================
     PARTICIPANTS
  ======================================================= */

  const participantCount = useMemo(() => {
    const profileIdentityMap = new Map<
      string,
      string
    >();

    filteredProfiles.forEach((profile) => {
      const userId = safeString(profile.id);
      const studentId = safeString(
        profile.student_id
      );

      const canonicalKey = studentId
        ? `student:${normalize(studentId)}`
        : `user:${normalize(userId)}`;

      if (userId) {
        profileIdentityMap.set(
          `user:${normalize(userId)}`,
          canonicalKey
        );
      }

      if (studentId) {
        profileIdentityMap.set(
          `student:${normalize(studentId)}`,
          canonicalKey
        );
      }
    });

    const participants = new Set<string>();

    const addParticipant = (
      userId?: string | null,
      studentId?: string | null
    ) => {
      const normalizedUserId = normalize(userId);
      const normalizedStudentId = normalize(
        studentId
      );

      if (
        !normalizedUserId &&
        !normalizedStudentId
      ) {
        return;
      }

      if (normalizedStudentId) {
        const profileKey =
          profileIdentityMap.get(
            `student:${normalizedStudentId}`
          );

        participants.add(
          profileKey ||
            `student:${normalizedStudentId}`
        );

        return;
      }

      if (normalizedUserId) {
        const profileKey =
          profileIdentityMap.get(
            `user:${normalizedUserId}`
          );

        participants.add(
          profileKey || `user:${normalizedUserId}`
        );
      }
    };

    filteredProfiles.forEach((profile) => {
      addParticipant(
        profile.id,
        profile.student_id
      );
    });

    filteredSurveyResponses.forEach(
      (response) => {
        // A response carries the users.id, not the student ID: resolve it so
        // the same student is not counted once as a profile and again as a
        // responder (that double-counted every student who had a profile).
        addParticipant(
          response.user_id,
          response.student_id ||
            userIdToStudentId[safeString(response.user_id)]
        );
      }
    );

    return participants.size;
  }, [
    filteredProfiles,
    filteredSurveyResponses,
    userIdToStudentId,
  ]);

  /* =======================================================
     SURVEY PARTICIPANTS
  ======================================================= */

  const surveyParticipants = useMemo(() => {
    const participants = new Set<string>();

    filteredSurveyResponses.forEach(
      (response) => {
        const userId = normalize(response.user_id);

        const studentId = normalize(
          response.student_id
        );

        if (studentId) {
          participants.add(
            `student:${studentId}`
          );
        } else if (userId) {
          participants.add(`user:${userId}`);
        }
      }
    );

    return participants.size;
  }, [filteredSurveyResponses]);

  /* =======================================================
     COURSE ANALYTICS
  ======================================================= */

  const courseAnalytics = useMemo(() => {
    const counts: Record<
      string,
      number
    > = {};

    filteredProfiles.forEach((profile) => {
      const course =
        safeString(profile.program) ||
        "Not Specified";

      counts[course] =
        (counts[course] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([course, count]) => ({
        course,
        count,
      }))
      .sort(
        (a, b) => b.count - a.count
      )
      .slice(0, 12);
  }, [filteredProfiles]);

  /* =======================================================
     YEAR LEVEL
  ======================================================= */

  const yearLevelAnalytics = useMemo(() => {
    const counts: Record<
      string,
      number
    > = {};

    filteredProfiles.forEach((profile) => {
      const year = getYearLevel(
        profile.year_level
      );

      counts[year] =
        (counts[year] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([year, count]) => ({
        year,
        count,
      }))
      .sort((a, b) =>
        a.year.localeCompare(b.year)
      );
  }, [filteredProfiles]);

  /* =======================================================
     GENDER
  ======================================================= */

  const genderAnalytics = useMemo(() => {
    const counts: Record<
      string,
      number
    > = {};

    filteredProfiles.forEach((profile) => {
      const gender =
        safeString(profile.gender) ||
        "Not Specified";

      counts[gender] =
        (counts[gender] || 0) + 1;
    });

    return Object.entries(counts).map(
      ([name, value]) => ({
        name,
        value,
      })
    );
  }, [filteredProfiles]);

  /* =======================================================
     AGE
  ======================================================= */

  const ageAnalytics = useMemo(() => {
    const groups = [
      "Below 18",
      "18–20",
      "21–22",
      "23–24",
      "25–26",
      "27+",
      "Not Specified",
    ];

    const counts: Record<
      string,
      number
    > = {};

    groups.forEach((group) => {
      counts[group] = 0;
    });

    filteredProfiles.forEach((profile) => {
      const group = getAgeGroup(
        profile.age
      );

      counts[group] =
        (counts[group] || 0) + 1;
    });

    return groups.map((group) => ({
      group,
      count: counts[group],
    }));
  }, [filteredProfiles]);

  /* =======================================================
     PWD / IP
  ======================================================= */

  const inclusionAnalytics = useMemo(() => {
    const pwd = filteredProfiles.filter(
      (p) => p.is_pwd === true
    ).length;

    const ip = filteredProfiles.filter(
      (p) => p.is_ip === true
    ).length;

    const nonPwd =
      filteredProfiles.length - pwd;

    const nonIp =
      filteredProfiles.length - ip;

    return {
      pwd,
      nonPwd,
      ip,
      nonIp,
    };
  }, [filteredProfiles]);

  /* =======================================================
     PWD / IP BREAKDOWN

     Registration's privacy notice promises students that PWD/IP
     status won't be displayed at the individual level — only
     aggregated. So this breaks representation down by campus,
     program, and year level (counts only, never names) instead of
     listing which specific students are PWD/IP.
  ======================================================= */

  const inclusionBreakdown = useMemo(() => {
    const buildBreakdown = (filterFn: (p: Profile) => boolean) => {
      const byCampus: Record<string, number> = {};
      const byProgram: Record<string, number> = {};
      const byYearLevel: Record<string, number> = {};

      filteredProfiles.filter(filterFn).forEach((profile) => {
        const campus = safeString(profile.campus) || "Not Specified";
        const program = safeString(profile.program) || "Not Specified";
        const year = getYearLevel(profile.year_level);

        byCampus[campus] = (byCampus[campus] || 0) + 1;
        byProgram[program] = (byProgram[program] || 0) + 1;
        byYearLevel[year] = (byYearLevel[year] || 0) + 1;
      });

      const toSortedArray = (counts: Record<string, number>) =>
        Object.entries(counts)
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count);

      return {
        byCampus: toSortedArray(byCampus),
        byProgram: toSortedArray(byProgram),
        byYearLevel: toSortedArray(byYearLevel),
      };
    };

    return {
      pwd: buildBreakdown((p) => p.is_pwd === true),
      ip: buildBreakdown((p) => p.is_ip === true),
    };
  }, [filteredProfiles]);

  /* =======================================================
     KNOWLEDGE AWARENESS

     Pelayo/Usita asked for average knowledge score overall, per
     program, and broken down by year level, gender, PWD, and IP.
     Only survey_responses belonging to a "knowledge" (scored)
     survey and carrying a computed percentage count here — opinion
     surveys have no correct answer, so they contribute nothing.
  ======================================================= */

  const profileByStudentId = useMemo(() => {
    const map: Record<string, Profile> = {};

    filteredProfiles.forEach((profile) => {
      const studentId = safeString(profile.student_id);
      if (studentId) map[studentId] = profile;
    });

    return map;
  }, [filteredProfiles]);

  const scoredSurveyResponses = useMemo(() => {
    const surveysById: Record<string, Survey> = {};
    surveys.forEach((survey) => {
      surveysById[safeString(survey.id)] = survey;
    });

    return filteredSurveyResponses.filter((response) => {
      const survey = surveysById[safeString(response.survey_id)];
      return (
        survey?.type === "knowledge" &&
        response.percentage !== null &&
        response.percentage !== undefined
      );
    });
  }, [filteredSurveyResponses, surveys]);

  // Small groups (PHASE 57): scores are always shown; a group of fewer than 5 DISTINCT
  // students carries the note "n = X — small group, interpret with caution".
  const studentOfResponse = (response: SurveyResponse) =>
    userIdToStudentId[safeString(response.user_id)] ||
    safeString(response.student_id) ||
    `user:${safeString(response.user_id)}`;

  const awarenessAnalytics = useMemo(() => {
    const average = (values: number[]) =>
      values.length > 0
        ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
        : null;

    const overallStudents = new Set(scoredSurveyResponses.map(studentOfResponse)).size;
    const overallSmall = isSmallGroup(overallStudents);
    const overall = average(scoredSurveyResponses.map((r) => r.percentage || 0));

    const groupBy = (
      keyFn: (profile: Profile | undefined) => string
    ) => {
      const buckets: Record<string, { values: number[]; students: Set<string> }> = {};

      scoredSurveyResponses.forEach((response) => {
        const studentId = userIdToStudentId[safeString(response.user_id)];
        const profile = studentId ? profileByStudentId[studentId] : undefined;
        const key = keyFn(profile);

        if (!buckets[key]) buckets[key] = { values: [], students: new Set() };
        buckets[key].values.push(response.percentage || 0);
        buckets[key].students.add(studentOfResponse(response));
      });

      return Object.entries(buckets)
        .map(([label, { values, students }]) => {
          return {
            label,
            average: average(values) ?? 0,
            count: values.length,
            students: students.size,
            small: isSmallGroup(students.size),
          };
        })
        .sort((a, b) => b.count - a.count);
    };

    return {
      overall,
      overallSmall,
      overallStudents,
      totalResponses: scoredSurveyResponses.length,
      byYearLevel: groupBy((p) => getYearLevel(p?.year_level)),
      byGender: groupBy((p) => safeString(p?.gender) || "Not Specified"),
      byPwd: groupBy((p) => (p?.is_pwd ? "PWD" : "Non-PWD")),
      byIp: groupBy((p) => (p?.is_ip ? "IP" : "Non-IP")),
    };
  }, [scoredSurveyResponses, userIdToStudentId, profileByStudentId]);

  const programAwarenessAnalytics = useMemo(() => {
    const buckets: Record<string, { values: number[]; students: Set<string> }> = {};

    scoredSurveyResponses.forEach((response) => {
      const survey = surveys.find(
        (s) => safeString(s.id) === safeString(response.survey_id)
      );

      const questions = questionsForResponse(survey, response);
      const studentId = studentOfResponse(response);

      questions.forEach((question: any) => {
        if (
          question?.type !== "mcq" ||
          !question?.correct_option ||
          !question?.related_program_id
        ) {
          return;
        }

        const programId = safeString(question.related_program_id);
        // With a program chosen on the shared bar, only that program.
        if (selectedGuidanceProgram !== ALL_FILTER && programId !== selectedGuidanceProgram) return;

        const given = response.answers?.[String(question.id)];
        const isCorrect = given === question.correct_option ? 1 : 0;

        if (!buckets[programId]) buckets[programId] = { values: [], students: new Set() };
        buckets[programId].values.push(isCorrect * 100);
        buckets[programId].students.add(studentId);
      });
    });

    return Object.entries(buckets)
      .map(([programId, { values, students }]) => {
        const program = programs.find(
          (p) => safeString(p.id) === programId
        );
        return {
          programId,
          name: program ? getProgramName(program) : `Program #${programId}`,
          average: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
          count: values.length,
          students: students.size,
          small: isSmallGroup(students.size),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [scoredSurveyResponses, surveys, programs, userIdToStudentId, selectedGuidanceProgram]);

  /* =======================================================
     GUIDANCE SERVICE COVERAGE

     Usita asked to "include all the Programs of Guidance" — this
     shows program count and average awareness score per guidance
     service, across the fixed 6-category list, including
     categories with zero programs so gaps are visible too.
  ======================================================= */

  const guidanceServiceCoverage = useMemo(() => {
    const programCounts: Record<string, number> = {};

    scopedPrograms.forEach((program) => {
      const service = safeString(program.guidance_service);
      if (service) programCounts[service] = (programCounts[service] || 0) + 1;
    });

    const serviceByProgramId: Record<string, string> = {};
    scopedPrograms.forEach((program) => {
      const service = safeString(program.guidance_service);
      if (service) serviceByProgramId[safeString(program.id)] = service;
    });

    const scoreBuckets: Record<string, { values: number[]; students: Set<string> }> = {};

    scoredSurveyResponses.forEach((response) => {
      const survey = surveys.find(
        (s) => safeString(s.id) === safeString(response.survey_id)
      );

      const questions = questionsForResponse(survey, response);
      const studentId = studentOfResponse(response);

      questions.forEach((question: any) => {
        if (
          question?.type !== "mcq" ||
          !question?.correct_option ||
          !question?.related_program_id
        ) {
          return;
        }

        const service = serviceByProgramId[safeString(question.related_program_id)];
        if (!service) return;

        const given = response.answers?.[String(question.id)];
        const isCorrect = given === question.correct_option ? 1 : 0;

        if (!scoreBuckets[service]) scoreBuckets[service] = { values: [], students: new Set() };
        scoreBuckets[service].values.push(isCorrect * 100);
        scoreBuckets[service].students.add(studentId);
      });
    });

    return GUIDANCE_SERVICES.map((service) => {
      const bucket = scoreBuckets[service];

      return {
        service,
        programCount: programCounts[service] || 0,
        averageScore:
          bucket && bucket.values.length > 0
            ? Math.round(bucket.values.reduce((sum, v) => sum + v, 0) / bucket.values.length)
            : null,
        students: bucket ? bucket.students.size : 0,
        small: bucket ? isSmallGroup(bucket.students.size) : false,
      };
    });
  }, [scopedPrograms, scoredSurveyResponses, surveys, userIdToStudentId]);

  /* =======================================================
     PROGRAM PARTICIPATION BY COURSE

     Answers the "which academic course hasn't been reached by
     guidance?" question — something Guidance Service Coverage above
     can't, since that only measures gaps between the 6 service
     *categories*, not academic courses. Reads a checkbox question
     whose options are mapped to programs via option_program_ids (e.g.
     "Which of these programs have you participated in?" with a
     "None of the above" option left deliberately unmapped). A
     respondent who picked zero mapped options counts as "not reached,"
     grouped by their own academic program from `profiles.program`.
  ======================================================= */

  const programParticipationByCourse = useMemo(() => {
    const perStudent: Record<string, { reached: boolean; course: string }> = {};

    filteredSurveyResponses.forEach((response) => {
      const survey = surveys.find(
        (s) => safeString(s.id) === safeString(response.survey_id)
      );
      const questions = questionsForResponse(survey, response);

      questions.forEach((question: any) => {
        const optionProgramIds = question?.option_program_ids;
        if (
          question?.type !== "checkbox" ||
          !optionProgramIds ||
          Object.keys(optionProgramIds).length === 0
        ) {
          return;
        }

        const studentId =
          userIdToStudentId[safeString(response.user_id)] ||
          safeString(response.student_id);
        if (!studentId) return;

        const profile = profileByStudentId[studentId];
        const course = safeString(profile?.program) || "Not Specified";

        const given = response.answers?.[String(question.id)];
        const selected: string[] = Array.isArray(given) ? given : [];
        const reachedThisQuestion = selected.some(
          (option) => optionProgramIds[option] !== undefined
        );

        if (!perStudent[studentId]) {
          perStudent[studentId] = { reached: false, course };
        }
        if (reachedThisQuestion) perStudent[studentId].reached = true;
      });
    });

    const byCourse: Record<string, { reached: number; total: number }> = {};
    Object.values(perStudent).forEach(({ reached, course }) => {
      if (!byCourse[course]) byCourse[course] = { reached: 0, total: 0 };
      byCourse[course].total += 1;
      if (reached) byCourse[course].reached += 1;
    });

    return Object.entries(byCourse)
      .map(([course, { reached, total }]) => ({
        course,
        reached,
        notReached: total - reached,
        total,
        reachedPct: total > 0 ? Math.round((reached / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredSurveyResponses, surveys, userIdToStudentId, profileByStudentId]);

  /* =======================================================
     AWARENESS BY MATERIAL EXPOSURE

     The core comparison the rest of Knowledge Awareness never made:
     did students who actually opened an IEC material score higher on
     the related knowledge assessment than students who didn't? The
     join runs activity_logs.actor_email -> users.email ->
     users.student_id -> profiles.student_id (activity_logs has no
     user_id column at all, only actor_email), then
     activity_logs.entity_id -> materials.id -> materials.category,
     matched against survey_responses.survey_id -> surveys.iec_category.
  ======================================================= */

  // Second bridge alongside userIdToStudentId above — activity_logs is
  // keyed by actor_email, not user_id, so this can't reuse that map.
  // Test/seed accounts are excluded here so a seeded batch's view
  // history never counts toward this comparison.
  const emailToStudentId = useMemo(() => {
    const map: Record<string, string> = {};
    userBridge.forEach((user) => {
      if (user.is_test_account) return;
      const email = normalize(user.email);
      const studentId = safeString(user.student_id);
      if (email && studentId) map[email] = studentId;
    });
    return map;
  }, [userBridge]);

  // survey_responses has no is_test_account column of its own — a test
  // account's response is excluded by checking the student_id it
  // resolves to against this set, not by filtering the bridge above
  // (userIdToStudentId is shared with every other panel on this page
  // and must not change for them).
  const testAccountStudentIds = useMemo(() => {
    const set = new Set<string>();
    userBridge.forEach((user) => {
      if (user.is_test_account) {
        const studentId = safeString(user.student_id);
        if (studentId) set.add(studentId);
      }
    });
    return set;
  }, [userBridge]);

  const materialIdToCategory = useMemo(() => {
    const map: Record<string, string> = {};
    materials.forEach((material) => {
      map[safeString(material.id)] = safeString(material.category) || "Uncategorized";
    });
    return map;
  }, [materials]);

  // student_id -> set of IEC categories they've opened at least one
  // material from. entity_id is text and shared with every other
  // entity_type activity_logs tracks (surveys use UUIDs there) — only
  // a purely-numeric id is ever treated as a material id.
  const studentOpenedCategories = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    materialViewLogs.forEach((log) => {
      const entityId = safeString(log.entity_id);
      if (!/^\d+$/.test(entityId)) return;

      const studentId = emailToStudentId[normalize(log.actor_email)];
      if (!studentId) return;

      const category = materialIdToCategory[entityId];
      if (!category) return;

      if (!map[studentId]) map[studentId] = new Set();
      map[studentId].add(category);
    });

    return map;
  }, [materialViewLogs, emailToStudentId, materialIdToCategory]);

  const materialExposureAwareness = useMemo(() => {
    type Side = { values: number[]; students: Set<string> };
    const buckets: Record<string, { opened: Side; notOpened: Side }> = {};
    const newSide = (): Side => ({ values: [], students: new Set() });

    scoredSurveyResponses.forEach((response) => {
      const survey = surveys.find((s) => safeString(s.id) === safeString(response.survey_id));
      const category = safeString(survey?.iec_category);
      if (!category) return;

      const studentId = userIdToStudentId[safeString(response.user_id)];
      if (!studentId || testAccountStudentIds.has(studentId)) return;

      const opened = studentOpenedCategories[studentId]?.has(category) ?? false;

      if (!buckets[category]) buckets[category] = { opened: newSide(), notOpened: newSide() };
      const side = opened ? buckets[category].opened : buckets[category].notOpened;
      side.values.push(response.percentage || 0);
      side.students.add(studentId);
    });

    return Object.entries(buckets)
      .map(([category, { opened, notOpened }]) => {
        // Each side is judged on its own number of distinct students.
        const openedSmall = isSmallGroup(opened.students.size);
        const notOpenedSmall = isSmallGroup(notOpened.students.size);
        const openedAvg = average(opened.values);
        const notOpenedAvg = average(notOpened.values);
        return {
          category,
          openedAvg,
          notOpenedAvg,
          openedSmall,
          notOpenedSmall,
          difference: openedAvg !== null && notOpenedAvg !== null ? openedAvg - notOpenedAvg : null,
          openedCount: opened.values.length,
          notOpenedCount: notOpened.values.length,
          totalRespondents: opened.values.length + notOpened.values.length,
        };
      })
      .sort((a, b) => b.totalRespondents - a.totalRespondents);
  }, [scoredSurveyResponses, surveys, userIdToStudentId, testAccountStudentIds, studentOpenedCategories]);

  /* =======================================================
     CAMPUS
  ======================================================= */

  const campusAnalytics = useMemo(() => {
    const counts: Record<
      string,
      number
    > = {};

    filteredProfiles.forEach((profile) => {
      const campus =
        safeString(profile.campus) ||
        "Not Specified";

      counts[campus] =
        (counts[campus] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort(
        (a, b) => b.value - a.value
      );
  }, [filteredProfiles]);

  /* =======================================================
     SURVEY
  ======================================================= */

  const activeSurveys = useMemo(() => {
    return scopedSurveys.filter(
      (survey) =>
        normalize(survey.status) ===
        "active"
    ).length;
  }, [scopedSurveys]);

  /* =======================================================
     =======================================================
     IEC MATERIAL ANALYTICS
     =======================================================
  ======================================================= */

  /* -------------------------------------------------------
     TOTAL MATERIALS
  ------------------------------------------------------- */

  const totalMaterials =
    filteredMaterials.length;

  // The Content list is never narrowed by campus / year, so a materials number
  // is a link only while those two filters are off.
  const materialsListMatches = selectedCampus === "all" && selectedAcademicYear === "all" && selectedGuidanceProgram === ALL_FILTER;

  /* -------------------------------------------------------
     TOTAL IEC MATERIALS
  ------------------------------------------------------- */

  const totalIECMaterials =
    filteredMaterials.filter(
      (material) =>
        normalize(
          material.material_type
        ) === "iec"
    ).length;

  /* -------------------------------------------------------
     IEC MATERIALS CREATED THIS MONTH
     
     THIS IS THE MAIN ANALYTICS YOU ASKED FOR.
  ------------------------------------------------------- */

  const iecMaterialsThisMonth =
    filteredMaterials.filter(
      (material) =>
        normalize(
          material.material_type
        ) === "iec" &&
        isSameMonth(
          material.created_at
        )
    ).length;

  /* -------------------------------------------------------
     ALL MATERIALS CREATED THIS MONTH
  ------------------------------------------------------- */

  const materialsThisMonth =
    filteredMaterials.filter(
      (material) =>
        isSameMonth(
          material.created_at
        )
    ).length;

  /* -------------------------------------------------------
     MATERIALS CREATED THIS YEAR
  ------------------------------------------------------- */

  const materialsThisYear =
    filteredMaterials.filter(
      (material) =>
        isSameYear(
          material.created_at
        )
    ).length;

  /* -------------------------------------------------------
     IEC MATERIALS CREATED THIS YEAR

     Every other tile in the "IEC Material Summary" card is IEC-scoped
     (Total IEC, Downloads, This Month) — that card used to show
     materialsThisYear (ALL materials, IEC or not) for its "This Year"
     tile, silently pulling in program posters/handouts into what reads
     as an IEC-only summary. This is the IEC-filtered counterpart.
  ------------------------------------------------------- */

  const iecMaterialsThisYear =
    filteredMaterials.filter(
      (material) =>
        normalize(
          material.material_type
        ) === "iec" &&
        isSameYear(
          material.created_at
        )
    ).length;

  /* -------------------------------------------------------
     IEC DOWNLOADS
  ------------------------------------------------------- */

  const totalIECDowloads =
    filteredMaterials
      .filter(
        (material) =>
          normalize(
            material.material_type
          ) === "iec"
      )
      .reduce(
        (total, material) =>
          total +
          Number(
            material.downloads || 0
          ),
        0
      );

  /* -------------------------------------------------------
     DOWNLOADS THIS MONTH

     There's no per-download timestamp anywhere — `materials.downloads`
     is a single running counter with no log of when each download
     happened, so this can only ever be "lifetime downloads on
     materials uploaded this month," not "downloads that occurred this
     month." Named/labeled accordingly wherever it's shown.
  ------------------------------------------------------- */

  const downloadsThisMonth =
    filteredMaterials
      .filter((material) =>
        isSameMonth(
          material.created_at
        )
      )
      .reduce(
        (total, material) =>
          total +
          Number(
            material.downloads || 0
          ),
        0
      );

  /* -------------------------------------------------------
     MATERIAL TYPE ANALYTICS
  ------------------------------------------------------- */

  const materialTypeAnalytics =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      filteredMaterials.forEach(
        (material) => {
          const type =
            safeString(
              material.material_type
            ) ||
            "Uncategorized";

          counts[type] =
            (counts[type] || 0) + 1;
        }
      );

      return Object.entries(counts)
        .map(([name, value]) => ({
          name,
          value,
        }))
        .sort(
          (a, b) =>
            b.value - a.value
        );
    }, [filteredMaterials]);

  /* -------------------------------------------------------
     MATERIAL CATEGORY ANALYTICS
  ------------------------------------------------------- */

  const materialCategoryAnalytics =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      filteredMaterials.forEach(
        (material) => {
          const category =
            safeString(
              material.category
            ) ||
            "Uncategorized";

          counts[category] =
            (counts[category] || 0) + 1;
        }
      );

      return Object.entries(counts)
        .map(([category, count]) => ({
          category,
          count,
        }))
        .sort(
          (a, b) =>
            b.count - a.count
        )
        .slice(0, 12);
    }, [filteredMaterials]);

  /* -------------------------------------------------------
     MATERIAL FORMAT ANALYTICS
  ------------------------------------------------------- */

  const materialFormatAnalytics =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      filteredMaterials.forEach(
        (material) => {
          const format =
            safeString(
              material.format
            ) ||
            safeString(
              material.type
            ) ||
            "Unknown";

          counts[format] =
            (counts[format] || 0) + 1;
        }
      );

      return Object.entries(counts)
        .map(([format, count]) => ({
          format,
          count,
        }))
        .sort(
          (a, b) =>
            b.count - a.count
        );
    }, [filteredMaterials]);

  /* -------------------------------------------------------
     IEC CATEGORY ANALYTICS
  ------------------------------------------------------- */

  const iecCategoryAnalytics =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      filteredMaterials
        .filter(
          (material) =>
            normalize(
              material.material_type
            ) === "iec"
        )
        .forEach((material) => {
          const category =
            safeString(
              material.category
            ) ||
            "Uncategorized";

          counts[category] =
            (counts[category] || 0) + 1;
        });

      return Object.entries(counts)
        .map(([category, count]) => ({
          category,
          count,
        }))
        .sort(
          (a, b) =>
            b.count - a.count
        )
        .slice(0, 12);
    }, [filteredMaterials]);

  /* -------------------------------------------------------
     IEC MATERIALS MONTHLY CREATION TREND
     
     Shows how many IEC materials were
     CREATED in each month of the current year.
  ------------------------------------------------------- */

  const iecMonthlyTrend =
    useMemo(() => {
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      const data = months.map(
        (month) => ({
          month,
          materials: 0,
        })
      );

      filteredMaterials
        .filter(
          (material) =>
            normalize(
              material.material_type
            ) === "iec" &&
            isSameYear(
              material.created_at
            )
        )
        .forEach((material) => {
          if (!material.created_at)
            return;

          const date = new Date(
            material.created_at
          );

          if (
            !Number.isNaN(
              date.getTime()
            )
          ) {
            data[
              date.getMonth()
            ].materials += 1;
          }
        });

      return data;
    }, [filteredMaterials]);

  /* -------------------------------------------------------
     RECENT IEC MATERIALS
  ------------------------------------------------------- */

  const recentIECMaterials =
    useMemo(() => {
      return filteredMaterials
        .filter(
          (material) =>
            normalize(
              material.material_type
            ) === "iec"
        )
        .sort((a, b) => {
          const dateA = a.created_at
            ? new Date(
                a.created_at
              ).getTime()
            : 0;

          const dateB = b.created_at
            ? new Date(
                b.created_at
              ).getTime()
            : 0;

          return dateB - dateA;
        })
        .slice(0, 8);
    }, [filteredMaterials]);

  /* =======================================================
     SUMMARY VALUES
  ======================================================= */

  const totalStudents =
    participantCount;

  const totalGuidancePrograms =
    scopedPrograms.length;

  const totalSurveyResponses =
    filteredSurveyResponses.length;

  /* =======================================================
     REPORT ROWS
  ======================================================= */

  const getReportRows = () => {
    // A single-program export drops the rows that describe the whole library, not the program.
    const singleProgram = selectedGuidanceProgram !== ALL_FILTER;
    const libraryOnlyRows = new Set([
      "IEC materials created this month",
      "Materials created this month",
      "Materials created this year",
      "Downloads (this month's uploads)",
    ]);
    return [
      [
        "Metric",
        "Value",
      ],

      [
        "Students covered",
        totalStudents,
      ],

      [
        "Guidance programs",
        totalGuidancePrograms,
      ],

      [
        "Active surveys",
        activeSurveys,
      ],

      [
        "Unique survey participants",
        surveyParticipants,
      ],

      [
        "Survey responses",
        totalSurveyResponses,
      ],

      [
        "Total materials",
        totalMaterials,
      ],

      [
        "Total IEC materials",
        totalIECMaterials,
      ],

      [
        "IEC materials created this month",
        iecMaterialsThisMonth,
      ],

      [
        "Materials created this month",
        materialsThisMonth,
      ],

      [
        "Materials created this year",
        materialsThisYear,
      ],

      [
        "Total IEC downloads",
        totalIECDowloads,
      ],

      [
        "Downloads (this month's uploads)",
        downloadsThisMonth,
      ],

      [
        "PWD students",
        inclusionAnalytics.pwd,
      ],

      [
        "IP students",
        inclusionAnalytics.ip,
      ],
    ].filter((row) => !(singleProgram && libraryOnlyRows.has(String(row[0]))));
  };

  // Filters that match nobody: say so on the page and on page 1 of every export.
  const noStudentsMatch = anyFilterActive(filters) && participantCount === 0;

  /* =======================================================
     EXPORT REPORT — ported from the retired ReportsCenter screen.
     Independent date-range filtering (not the dropdowns above) over
     the same already-fetched profiles/programs/surveys/survey_responses/
     materials, producing byte-for-byte the same PDF ReportsCenter used
     to generate.
  ======================================================= */

  // PHASE 41: every export follows the dropdown filters (Program, PWD, IP and
  // the rest) AND the date range below.
  const reportFilteredProfiles = useMemo(
    () => filteredProfiles.filter((p) => isWithinRange(p.created_at, reportStartDate, reportEndDate)),
    [filteredProfiles, reportStartDate, reportEndDate]
  );

  const reportFilteredResponses = useMemo(
    () => filteredSurveyResponses.filter((r) => isWithinRange(r.created_at, reportStartDate, reportEndDate)),
    [filteredSurveyResponses, reportStartDate, reportEndDate]
  );

  const reportFilteredMaterials = useMemo(
    () => filteredMaterials.filter((m) => isWithinRange(m.created_at, reportStartDate, reportEndDate)),
    [filteredMaterials, reportStartDate, reportEndDate]
  );

  const reportScoredResponses = useMemo(() => {
    const surveysById: Record<string, Survey> = {};
    surveys.forEach((s) => {
      surveysById[safeString(s.id)] = s;
    });

    return reportFilteredResponses.filter((r) => {
      const survey = surveysById[safeString(r.survey_id)];
      return survey?.type === "knowledge" && r.percentage !== null && r.percentage !== undefined;
    });
  }, [reportFilteredResponses, surveys]);

  const reportProgramAwareness = useMemo(() => {
    const buckets: Record<string, { values: number[]; students: Set<string> }> = {};

    reportScoredResponses.forEach((response) => {
      const survey = surveys.find((s) => safeString(s.id) === safeString(response.survey_id));
      const questions = questionsForResponse(survey, response);
      const studentId = studentOfResponse(response);

      questions.forEach((question: any) => {
        if (question?.type !== "mcq" || !question?.correct_option || !question?.related_program_id) {
          return;
        }

        const programId = safeString(question.related_program_id);
        if (selectedGuidanceProgram !== ALL_FILTER && programId !== selectedGuidanceProgram) return;

        if (!buckets[programId]) buckets[programId] = { values: [], students: new Set() };
        buckets[programId].values.push(response.percentage || 0);
        buckets[programId].students.add(studentId);
      });
    });

    return scopedPrograms
      .map((program) => {
        const bucket = buckets[safeString(program.id)];
        return {
          name: getProgramName(program),
          guidanceService: safeString(program.guidance_service) || "Not Categorized",
          averageScore: bucket ? average(bucket.values) : null,
          responseCount: bucket ? bucket.values.length : 0,
          students: bucket ? bucket.students.size : 0,
        };
      })
      .sort((a, b) => b.responseCount - a.responseCount);
  }, [scopedPrograms, reportScoredResponses, surveys, userIdToStudentId, selectedGuidanceProgram]);

  const reportDemographics = useMemo(() => {
    const groupBy = (keyFn: (p: Profile) => string) => {
      const counts: Record<string, number> = {};
      reportFilteredProfiles.forEach((p) => {
        const key = keyFn(p);
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    const pwdCount = reportFilteredProfiles.filter((p) => p.is_pwd === true).length;
    const ipCount = reportFilteredProfiles.filter((p) => p.is_ip === true).length;

    return {
      total: reportFilteredProfiles.length,
      byYearLevel: groupBy((p) => getYearLevel(p.year_level)),
      byGender: groupBy((p) => safeString(p.gender) || "Not Specified"),
      byAgeBand: groupBy((p) => getAgeGroup(p.age)),
      pwd: pwdCount,
      nonPwd: reportFilteredProfiles.length - pwdCount,
      ip: ipCount,
      nonIp: reportFilteredProfiles.length - ipCount,
    };
  }, [reportFilteredProfiles]);

  const reportGuidanceCoverage = useMemo(() => {
    const programCounts: Record<string, number> = {};
    scopedPrograms.forEach((p) => {
      const service = safeString(p.guidance_service);
      if (service) programCounts[service] = (programCounts[service] || 0) + 1;
    });

    const serviceByProgramId: Record<string, string> = {};
    scopedPrograms.forEach((p) => {
      const service = safeString(p.guidance_service);
      if (service) serviceByProgramId[safeString(p.id)] = service;
    });

    const scoreBuckets: Record<string, { values: number[]; students: Set<string> }> = {};
    reportScoredResponses.forEach((response) => {
      const survey = surveys.find((s) => safeString(s.id) === safeString(response.survey_id));
      const questions = questionsForResponse(survey, response);
      const studentId = studentOfResponse(response);

      questions.forEach((question: any) => {
        if (question?.type !== "mcq" || !question?.correct_option || !question?.related_program_id) {
          return;
        }

        const service = serviceByProgramId[safeString(question.related_program_id)];
        if (!service) return;

        if (!scoreBuckets[service]) scoreBuckets[service] = { values: [], students: new Set() };
        scoreBuckets[service].values.push(response.percentage || 0);
        scoreBuckets[service].students.add(studentId);
      });
    });

    return GUIDANCE_SERVICES.map((service) => {
      const bucket = scoreBuckets[service];
      return {
        service,
        programCount: programCounts[service] || 0,
        averageScore: bucket ? average(bucket.values) : null,
        students: bucket ? bucket.students.size : 0,
      };
    });
  }, [scopedPrograms, reportScoredResponses, surveys, userIdToStudentId]);

  const reportMaterialReach = useMemo(() => {
    const byCategory: Record<string, { count: number; downloads: number }> = {};

    reportFilteredMaterials.forEach((m) => {
      const category = safeString(m.category) || "Uncategorized";
      if (!byCategory[category]) byCategory[category] = { count: 0, downloads: 0 };
      byCategory[category].count += 1;
      byCategory[category].downloads += m.downloads || 0;
    });

    return {
      totalMaterials: reportFilteredMaterials.length,
      totalDownloads: reportFilteredMaterials.reduce((sum, m) => sum + (m.downloads || 0), 0),
      byCategory: Object.entries(byCategory)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.count - a.count),
    };
  }, [reportFilteredMaterials]);

  const reportRangeLabel =
    reportStartDate || reportEndDate
      ? `${reportStartDate || "Beginning"} to ${reportEndDate || "Present"}`
      : "All-Time";

  // Single combined export — was two separate PDFs/buttons ("Export PDF"
  // and "Export Report"); merged into one document and one button.
  // IEC Material Reach (below) already covers what the old exportToPDF's
  // plainer "IEC Material Analytics" (category + count only) showed, plus
  // downloads, so that section isn't duplicated here — Recent IEC
  // Materials is kept since it's the one piece the old Export Report
  // never had.
  // A score cell: the real score, followed by the small-group note when the group
  // has fewer than 5 students; "No data" when there is nothing to show.
  const scoreCell = (value: number | null, students: number) =>
    value !== null ? withSmallGroupNote(`${value}%`, students) : "No data";

  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Learning gain (pre-test vs post-test) under the current filters. A group of
  // fewer than 5 paired students is labelled "small group" but its scores are shown.
  const buildLearningSection = async (): Promise<ReportSection | null> => {
    const { data, error } = await supabase.rpc("learning_gain_summary", buildLearningGainParams(filters));
    if (error || !data) return null;

    const payload = data as any;
    const rows = (payload.rows || []) as any[];
    const programTitles = new Map<string, string>(
      (payload.options?.programs || []).map((p: any) => [String(p.id), String(p.title).trim()])
    );
    const pct = (value: unknown) => (value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`);

    return {
      title: "Learning gain (pre vs post)",
      head: ["Group", "Paired students", "Mean pre-test", "Mean post-test", "Mean gain"],
      rows: rows
        .filter((row) => row.dimension === "overall" || row.dimension === "program")
        .map((row) => {
          const gain =
            row.mean_gain === null || row.mean_gain === undefined
              ? "—"
              : `${Number(row.mean_gain) > 0 ? "+" : ""}${Number(row.mean_gain).toFixed(1)} pts`;
          return [
            withSmallGroupNote(
              row.dimension === "overall" ? "All paired students" : programTitles.get(String(row.key)) || `Program ${row.key}`,
              Number(row.paired_n) || 0
            ),
            Number(row.paired_n) || 0,
            pct(row.mean_pre),
            pct(row.mean_post),
            gain,
          ];
        }),
      note: "Paired students only (both a pre-test and a post-test). A group under 5 paired students is shown with a caution note.",
    };
  };

  const reportTitle = selectedProgramName
    ? `Program report: ${selectedProgramName}`
    : "Guidance Awareness & Analytics Report";

  const reportFileBase = () => {
    const day = new Date().toISOString().slice(0, 10);
    if (selectedGuidanceProgram === ALL_FILTER) return `OMSU_Guidance_Analytics_Report_${day}`;
    const slug = (selectedProgramName || selectedGuidanceProgram).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    return `OMSU_Program_Report_${slug}_${day}`;
  };

  // The same tables as the PDF, as workbook sheets.
  const buildReportModel = (
    reach: Awaited<ReturnType<typeof fetchMaterialReach>> | null,
    learning: ReportSection | null
  ): ReportModel => {
    const small = (n: number) => (n < SMALL_SAMPLE_N ? ` (${smallGroupNote(n)})` : "");
    const sections: ReportSection[] = [
      { title: "Overview metrics", head: ["Metric", "Value"], rows: getReportRows().slice(1) as (string | number)[][] },
      {
        title: "Program awareness",
        head: ["Program", "Guidance service", "Avg. score", "Responses"],
        rows: reportProgramAwareness.map((row) => [row.name, row.guidanceService, scoreCell(row.averageScore, row.students), row.responseCount]),
      },
      {
        title: "Demographic breakdown",
        head: ["Dimension", "Segment", "Count"],
        rows: [
          ...reportDemographics.byYearLevel.map((r) => ["Year level", r.label, r.count]),
          ...reportDemographics.byGender.map((r) => ["Gender", r.label, r.count]),
          ...reportDemographics.byAgeBand.map((r) => ["Age band", r.label, r.count]),
          ["PWD status", "PWD", reportDemographics.pwd],
          ["PWD status", "Non-PWD", reportDemographics.nonPwd],
          ["IP status", "Indigenous Peoples", reportDemographics.ip],
          ["IP status", "Non-IP", reportDemographics.nonIp],
        ],
        note: "Counts only. No names, emails, or student IDs.",
      },
      {
        title: "Guidance service coverage",
        head: ["Guidance service", "Programs", "Avg. awareness score"],
        rows: reportGuidanceCoverage.map((row) => [row.service, row.programCount, scoreCell(row.averageScore, row.students)]),
      },
      // "Awareness by exposure" is not exported: see SHOW_MATERIAL_EXPOSURE.
      {
        title: "IEC material reach",
        head: ["Category", "Materials", "Downloads"],
        rows: reportMaterialReach.byCategory.map((row) => [row.category, row.count, row.downloads]),
        note: `${reportMaterialReach.totalMaterials} materials, ${reportMaterialReach.totalDownloads} downloads`,
      },
      {
        title: "Recent IEC materials",
        head: ["Title", "Format", "Category", "Campus", "Downloads", "Created"],
        rows: recentIECMaterials.map((material) => [
          safeString(material.title),
          safeString(material.format),
          safeString(material.category),
          campusLabel(safeString(material.campus)),
          Number(material.downloads || 0),
          material.created_at ? new Date(material.created_at).toLocaleDateString() : "",
        ]),
      },
    ];
    if (learning) sections.push(learning);
    if (reach) {
      sections.push({
        title: "Material reach by course",
        head: ["Course", "Students", "Opened at least one", "Reached"],
        rows: reach.by_course.map((row) => [`${row.key}${small(row.students)}`, row.students, row.reached, pctPdf(row.pct)]),
        note: "Percentages are based on students with an account in the system, not on total enrollment.",
      });
      sections.push({
        title: "Material reach by year level",
        head: ["Year level", "Students", "Opened at least one", "Reached"],
        rows: reach.by_year_level.map((row) => [`${row.key}${small(row.students)}`, row.students, row.reached, pctPdf(row.pct)]),
      });
    }

    return {
      title: reportTitle,
      periodLabel: reportRangeLabel,
      generatedAt: new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
      filtersLine: describeFilters(filters, selectedProgramName),
      definition: PARTICIPANTS_DEFINITION,
      sections,
      fileBase: reportFileBase(),
    };
  };

  const exportReportExcel = async () => {
    setGeneratingExcel(true);
    setExportError(null);
    try {
      let reach = materialReach;
      if (!reach) {
        try {
          reach = await fetchMaterialReach(reachFilters);
        } catch (reachError) {
          console.error("Material reach (Excel):", reachError);
        }
      }
      const learning = await buildLearningSection();
      await downloadReportXlsx(buildReportModel(reach, learning));
    } catch (error) {
      console.error("Excel export:", error);
      setExportError("The Excel file could not be created. Please try again.");
    } finally {
      setGeneratingExcel(false);
    }
  };

  const pctPdf = (pct: number | null) => (pct === null ? "—" : `${pct}%`);

  const exportReportPDF = async () => {
    setGeneratingReport(true);

    try {
      const doc = new jsPDF() as any;

      const NO_RECORDS_NOTE = "No records found for the selected period.";
      const tableBodyOrPlaceholder = <T,>(rows: T[], columnCount: number, mapRow: (row: T) => (string | number)[]) =>
        rows.length > 0 ? rows.map(mapRow) : [Array(columnCount).fill("—")];

      const generatedAtLabel = new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const learningSection = await buildLearningSection();
      const filtersLine = describeFilters(filters, selectedProgramName);
      let bodyTop = 46;

      const addHeader = (firstPage = false) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(15);
        doc.text("OMSU GUIDANCE AND TESTING CENTER", 14, 18);

        doc.setFontSize(12);
        const titleLines = doc.splitTextToSize(reportTitle, 182).slice(0, 2);
        doc.text(titleLines, 14, 26);
        const shift = (titleLines.length - 1) * 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Report Period: ${reportRangeLabel}`, 14, 33 + shift);
        doc.text(`Generated: ${generatedAtLabel}`, 14, 38 + shift);

        // The filters in force and what "participants" means, on every page.
        doc.setTextColor(40);
        const filterLines = doc.splitTextToSize(filtersLine, 182);
        doc.text(filterLines, 14, 43 + shift);
        let y = 43 + shift + filterLines.length * 4;
        const definitionLines = doc.splitTextToSize(PARTICIPANTS_DEFINITION, 182);
        doc.text(definitionLines, 14, y);
        y += definitionLines.length * 4;
        // A clear banner right under the filter line, on page 1 only.
        if (firstPage && noStudentsMatch) y = drawNoMatchBanner(doc, y);
        bodyTop = y + 5;
      };

      addHeader(true);

      let nextY = bodyTop;

      // SECTION 1 — Overview Metrics
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text("Overview metrics", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Metric", "Value"]],
        body: getReportRows().slice(1),
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { fontSize: 12 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + 12;

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = bodyTop;
      }

      // SECTION 2 — Program Awareness Summary
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text("Program awareness summary", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Program", "Guidance service", "Avg. score", "Responses"]],
        body: tableBodyOrPlaceholder(reportProgramAwareness, 4, (row) => [
          row.name,
          row.guidanceService,
          scoreCell(row.averageScore, row.students),
          row.responseCount,
        ]),
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 12 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + (reportProgramAwareness.length === 0 ? 5 : 12);

      if (reportProgramAwareness.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(148);
        doc.text(NO_RECORDS_NOTE, 14, nextY);
        nextY += 10;
      }

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = bodyTop;
      }

      // SECTION 3 — Demographic Breakdown
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Demographic breakdown", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Dimension", "Segment", "Count"]],
        body: [
          ...reportDemographics.byYearLevel.map((r) => ["Year level", r.label, r.count]),
          ...reportDemographics.byGender.map((r) => ["Gender", r.label, r.count]),
          ...reportDemographics.byAgeBand.map((r) => ["Age band", r.label, r.count]),
          ["PWD status", "PWD", reportDemographics.pwd],
          ["PWD status", "Non-PWD", reportDemographics.nonPwd],
          ["IP status", "Indigenous Peoples", reportDemographics.ip],
          ["IP status", "Non-IP", reportDemographics.nonIp],
        ],
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 12 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + 12;

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = bodyTop;
      }

      // SECTION 4 — Guidance Service Coverage
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Guidance service coverage", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Guidance service", "Programs", "Avg. awareness score"]],
        body: reportGuidanceCoverage.map((row) => [
          row.service,
          row.programCount,
          scoreCell(row.averageScore, row.students),
        ]),
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 12 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + 12;

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = bodyTop;
      }

      // SECTION 5 — Awareness by Material Exposure. Not printed: see SHOW_MATERIAL_EXPOSURE.
      if (SHOW_MATERIAL_EXPOSURE) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text("Awareness by material exposure", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["IEC category", "Opened", "Did not open", "Difference", "Respondents"]],
        body: tableBodyOrPlaceholder(materialExposureAwareness, 5, (row) => [
          row.category,
          row.openedAvg !== null ? `${row.openedAvg}% (${row.openedCount})` : "No data",
          row.notOpenedAvg !== null ? `${row.notOpenedAvg}% (${row.notOpenedCount})` : "No data",
          row.difference !== null ? `${row.difference >= 0 ? "+" : ""}${row.difference}pp` : "No data",
          row.totalRespondents,
        ]),
        headStyles: { fillColor: [8, 145, 178], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 12 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + (materialExposureAwareness.length === 0 ? 5 : 12);

      if (materialExposureAwareness.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(148);
        doc.text("No responses have been recorded yet.", 14, nextY);
        nextY += 10;
      }
      }

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = bodyTop;
      }

      // SECTION 6 — IEC Material Reach
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(
        `IEC Material Reach (${reportMaterialReach.totalMaterials} materials, ${reportMaterialReach.totalDownloads} downloads)`,
        14,
        nextY
      );
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Category", "Materials", "Downloads"]],
        body: tableBodyOrPlaceholder(reportMaterialReach.byCategory, 3, (row) => [row.category, row.count, row.downloads]),
        headStyles: { fillColor: [190, 24, 93], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 12 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + (reportMaterialReach.byCategory.length === 0 ? 5 : 12);

      if (reportMaterialReach.byCategory.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(148);
        doc.text(NO_RECORDS_NOTE, 14, nextY);
        nextY += 10;
      }

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = bodyTop;
      }

      // SECTION 7 — Recent IEC Materials
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text("Recent IEC materials", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Title", "Format", "Category", "Campus", "Downloads", "Created"]],
        body: tableBodyOrPlaceholder(recentIECMaterials, 6, (material) => [
          safeString(material.title),
          safeString(material.format),
          safeString(material.category),
          campusLabel(safeString(material.campus)),
          Number(material.downloads || 0),
          material.created_at ? new Date(material.created_at).toLocaleDateString() : "",
        ]),
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 12 },
      });

      // SECTION 8 — Learning gain (pre-test vs post-test) under the same filters.
      if (learningSection) {
        nextY = (doc.lastAutoTable?.finalY || nextY) + 12;
        if (nextY > 250) {
          doc.addPage();
          addHeader();
          nextY = bodyTop;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15);
        doc.text("Learning gain (pre-test vs post-test)", 14, nextY);
        nextY += 6;
        autoTable(doc, {
          startY: nextY,
          head: [learningSection.head],
          body: learningSection.rows.length > 0 ? learningSection.rows : [Array(learningSection.head.length).fill("—")],
          headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
          styles: { fontSize: 12 },
        });
        nextY = (doc.lastAutoTable?.finalY || nextY) + 5;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(doc.splitTextToSize(learningSection.note || "", 180), 14, nextY);
      }

      // SECTION 8 — Material Reach by Course (PHASE 32). Uses what is on
      // screen (the dashboard filters, IEC program and test-accounts
      // switch), fetching it if the screen has not loaded it yet.
      let reachForPdf = materialReach;
      if (!reachForPdf) {
        try {
          reachForPdf = await fetchMaterialReach(reachFilters);
        } catch (reachFetchError) {
          console.error("Material reach (PDF):", reachFetchError);
        }
      }

      doc.addPage();
      addHeader();
      nextY = bodyTop;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text("Material reach by course", 14, nextY);
      nextY += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      const reachFilterBits = [
        selectedCampus !== "all" && `Campus: ${selectedCampus}`,
        selectedProgram !== "all" && `Course: ${selectedProgram}`,
        selectedYearLevel !== "all" && `Year level: ${selectedYearLevel}`,
        selectedGender !== "all" && `Gender: ${selectedGender}`,
        selectedAge !== "all" && `Age: ${selectedAge}`,
        selectedAcademicYear !== "all" && `Academic year: ${selectedAcademicYear}`,
        selectedGuidanceProgram !== ALL_FILTER && `Program: ${selectedProgramName || selectedGuidanceProgram}`,
        selectedPwd !== ALL_FILTER && `PWD status: ${selectedPwd === "pwd" ? "PWD" : "Not PWD"}`,
        selectedIp !== ALL_FILTER && `IP status: ${selectedIp === "ip" ? "IP" : "Not IP"}`,
      ].filter(Boolean) as string[];
      const reachProgramTitle =
        reachIecProgramId === "all"
          ? "All programs"
          : reachForPdf?.options.iec_programs.find((p) => String(p.id) === reachIecProgramId)?.title.trim() ||
            `Program ${reachIecProgramId}`;
      const reachScope = [
        `IEC program: ${reachProgramTitle}`,
        ...(reachFilterBits.length ? reachFilterBits : ["No dashboard filters"]),
        reachIncludeTest ? "Test accounts included" : "Test accounts excluded",
      ].join(" | ");
      // The caption can be long: wrap it, then start everything below the LAST wrapped line.
      nextY = drawWrappedCaption(doc, reachScope, 14, nextY, 180).nextY;

      if (!reachForPdf) {
        nextY = drawEmptyLine(doc, "Material reach could not be loaded.", 14, nextY);
      } else if (reachForPdf.overall.students === 0) {
        nextY = drawEmptyLine(doc, "No students match the current filters.", 14, nextY);
      } else {
        const reachRows = reachForPdf.by_course;
        const reachSmall = (n: number) => (n < SMALL_SAMPLE_N ? ` (${smallGroupNote(n)})` : "");

        // Native bar chart: % reached per course, lowest first.
        const labelWidth = 62;
        const barMaxWidth = 100;
        const barHeight = 5;
        const barGap = 3;
        for (const row of reachRows) {
          if (nextY + barHeight > 275) {
            doc.addPage();
            addHeader();
            nextY = bodyTop;
          }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(30);
          const label = doc.splitTextToSize(row.key, labelWidth - 2)[0];
          doc.text(label, 14, nextY + 3.8);
          doc.setFillColor(238, 240, 250);
          doc.rect(14 + labelWidth, nextY, barMaxWidth, barHeight, "F");
          doc.setFillColor(79, 70, 229);
          const barWidth = (barMaxWidth * (row.pct ?? 0)) / 100;
          if (barWidth > 0) doc.rect(14 + labelWidth, nextY, barWidth, barHeight, "F");
          doc.text(pctPdf(row.pct), 14 + labelWidth + barMaxWidth + 2, nextY + 3.8);
          nextY += barHeight + barGap;
        }
        nextY += 4;

        autoTable(doc, {
          startY: nextY,
          head: [["Course", "Students", "Opened at least one", "Reached"]],
          body: reachRows.map((row) => [
            `${row.key}${reachSmall(row.students)}`,
            row.students,
            row.reached,
            pctPdf(row.pct),
          ]),
          headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
          styles: { fontSize: 12 },
        });
        nextY = (doc.lastAutoTable?.finalY || nextY) + 10;

        if (nextY > 250) {
          doc.addPage();
          addHeader();
          nextY = bodyTop;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15);
        doc.text("Material reach by year level", 14, nextY);
        nextY += 6;

        autoTable(doc, {
          startY: nextY,
          head: [["Year level", "Students", "Opened at least one", "Reached"]],
          body: reachForPdf.by_year_level.map((row) => [
            `${row.key}${reachSmall(row.students)}`,
            row.students,
            row.reached,
            pctPdf(row.pct),
          ]),
          headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
          styles: { fontSize: 12 },
        });
        nextY = (doc.lastAutoTable?.finalY || nextY) + 6;

        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(100);
        const reachNotes = doc.splitTextToSize(
          "Percentages are based on students with an account in the system, not on total enrollment. " +
            "Material views are recorded only since IEC materials were linked to programs, so reach for earlier students may be understated.",
          180
        );
        if (nextY + reachNotes.length * 4 > 280) {
          doc.addPage();
          addHeader();
          nextY = bodyTop;
        }
        doc.text(reachNotes, 14, nextY);
      }

      doc.save(`${reportFileBase()}.pdf`);
    } finally {
      setGeneratingReport(false);
    }
  };

  /* =======================================================
     AI INSIGHT — one comprehensive explanation of the whole dashboard.
     Every value below is already an aggregate (counts/averages/
     percentages/labels) computed above for the on-screen charts
     themselves — nothing here reaches into raw rows.
  ======================================================= */

  const buildInsightMetrics = () => ({
    overview: {
      studentsCovered: totalStudents,
      guidancePrograms: totalGuidancePrograms,
      activeSurveys,
      uniqueSurveyParticipants: surveyParticipants,
      surveyResponses: totalSurveyResponses,
      totalMaterials,
      totalIECMaterials,
      iecMaterialsThisMonth,
      materialsThisMonth,
      materialsThisYear,
      totalIECDownloads: totalIECDowloads,
      downloadsThisMonth,
      pwdStudents: inclusionAnalytics.pwd,
      ipStudents: inclusionAnalytics.ip,
    },
    materials: {
      byCategory: iecCategoryAnalytics,
      byType: materialTypeAnalytics,
      byFormat: materialFormatAnalytics,
    },
    knowledgeAwareness: {
      overallAverageScorePercent: awarenessAnalytics.overall,
      scoredResponses: awarenessAnalytics.totalResponses,
      byProgram: programAwarenessAnalytics,
      byYearLevel: awarenessAnalytics.byYearLevel,
      byGender: awarenessAnalytics.byGender,
      byPwdStatus: awarenessAnalytics.byPwd,
      byIpStatus: awarenessAnalytics.byIp,
      guidanceServiceCoverage,
      programParticipationByCourse,
      awarenessByMaterialExposure: materialExposureAwareness,
    },
    demographics: {
      byCourse: courseAnalytics,
      byYearLevel: yearLevelAnalytics,
      byGender: genderAnalytics,
      byAgeBand: ageAnalytics,
      byCampus: campusAnalytics,
    },
  });

  // Learning Gain lives in its own section with its own data source
  // (learning_gain_summary RPC) and filters, so it's fetched here
  // separately — unfiltered, all dimensions — for the AI Insight. Only
  // aggregates, same as everything else sent. If it can't be loaded the
  // insight still generates without it.
  const fetchLearningGainForInsight = async () => {
    const { data, error } = await supabase.rpc("learning_gain_summary", {
      p_age_brackets: AGE_BRACKETS,
    });

    if (error || !data) {
      return { unavailable: true };
    }

    const payload = data as any;
    const programTitles = new Map<string, string>(
      (payload.options?.programs || []).map((p: any) => [String(p.id), p.title])
    );
    const round = (value: unknown, digits: number) =>
      value === null || value === undefined ? null : Number(Number(value).toFixed(digits));

    const shape = (row: any) => {
      const n = Number(row.paired_n) || 0;
      const test = pairedTTest(
        n,
        row.mean_gain === null ? null : Number(row.mean_gain),
        row.sd_diff === null ? null : Number(row.sd_diff)
      );
      const group =
        row.dimension === "program"
          ? programTitles.get(String(row.key)) || `Program ${row.key}`
          : row.dimension === "year_level"
            ? yearLevelLabel(String(row.key))
            : String(row.key);

      return {
        group,
        pairedStudents: n,
        incompleteStudents: Number(row.incomplete_n) || 0,
        meanPreTestPercent: round(row.mean_pre, 1),
        meanPostTestPercent: round(row.mean_post, 1),
        meanGainPoints: round(row.mean_gain, 1),
        normalizedGain: round(row.norm_gain, 2),
        pairedTTest: test
          ? { t: round(test.t, 2), df: test.df, p: round(test.p, 4), significantAtP05: test.significant }
          : null,
        smallSample: n > 0 && n < SMALL_SAMPLE_N,
        interpretWithCaution: n > 0 && n < T_TEST_CAUTION_N,
      };
    };

    const rows: any[] = Array.isArray(payload.rows) ? payload.rows : [];
    const byDimension = (dimension: string) =>
      rows.filter((row) => row.dimension === dimension).map(shape);
    const overall = rows.find((row) => row.dimension === "overall");

    return {
      about:
        "Pre-test vs post-test on each program's knowledge assessment (one-group pretest-posttest). Paired students only; incomplete = pre-test only. Gain is in percentage points; normalizedGain = (post - pre) / (100 - pre). A paired t-test p below 0.05 means the difference is significant. Not affected by the dashboard filters.",
      overall: overall ? shape(overall) : null,
      byProgram: byDimension("program"),
      byCourse: byDimension("course"),
      byGender: byDimension("gender"),
      byAgeBracket: byDimension("age_bracket"),
      byYearLevel: byDimension("year_level"),
      byPwdStatus: byDimension("pwd"),
      byIpStatus: byDimension("ip"),
    };
  };

  // Material reach by course for the AI Insight: counts only, unfiltered,
  // test accounts excluded (not the on-screen toggle), all IEC programs.
  const fetchMaterialReachForInsight = async () => {
    try {
      const reach = await fetchMaterialReach(UNFILTERED_REACH);
      return {
        about:
          "Share of students (with an account in the system, not total enrollment) who opened at least one linked IEC material, per course. Counts only. Views were only recorded since materials were linked to programs, so earlier students may be understated. Not affected by the dashboard filters.",
        overall: reach.overall,
        byCourse: reach.by_course.map((row) => ({
          course: row.key,
          students: row.students,
          openedAtLeastOne: row.reached,
          percentReached: row.pct,
          smallSample: row.students < SMALL_SAMPLE_N,
        })),
      };
    } catch {
      return { unavailable: true };
    }
  };

  const handleGenerateInsight = async (regenerate = false) => {
    setInsightError(null);

    // Kept on purpose (PHASE 57): the page and the exports now show small groups, but fewer than 5
    // students are still not sent to the external AI service.
    if (hasActiveFilters && isSmallGroup(totalStudents)) {
      setInsight(null);
      setInsightError("Too few students match these filters to send to the AI Insight (fewer than 5). Remove some filters and try again.");
      return;
    }

    setInsightLoading(true);

    try {
      const result = await fetchAnalyticsInsight(
        "full_dashboard",
        "Full Analytics Dashboard",
        {
          ...buildInsightMetrics(),
          learningGain: await fetchLearningGainForInsight(),
          materialReach: await fetchMaterialReachForInsight(),
        },
        regenerate
      );
      setInsight(result);
    } catch (err: any) {
      setInsightError(err.message || "Failed to generate insight.");
    } finally {
      setInsightLoading(false);
    }
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 font-figtree">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />

        <p className="text-[13px] font-semibold text-slate-400">
          Loading guidance analytics...
        </p>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="font-figtree text-[#1E293B]">
      <div className="flex flex-col gap-[22px]">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-6">
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="m-0 font-bricolage font-extrabold text-[36px] md:text-[44px] leading-[1.05] tracking-[-0.025em] text-[#1E1B4B]">
              Analytics
            </h1>
            <p className="m-0 text-base text-[#5B6477]">
              How far the programs reached students, measured by pre-test and post-test results and the numbers below.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              onClick={exportReportPDF}
              disabled={generatingReport}
              className={`h-12 px-5 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[15px] flex items-center gap-2 hover:border-[#A5B4FC] disabled:opacity-60 ${focusRing}`}
            >
              {generatingReport ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              Export PDF
            </button>

            <button
              type="button"
              onClick={exportReportExcel}
              disabled={generatingExcel}
              className={`h-12 px-5 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[15px] flex items-center gap-2 hover:border-[#A5B4FC] disabled:opacity-60 ${focusRing}`}
            >
              {generatingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              Export Excel
            </button>

            {selectedGuidanceProgram !== ALL_FILTER && (
              <div
                role="group"
                aria-label="Export this program"
                className="h-12 pl-4 pr-1.5 rounded-2xl bg-[#EEF0FA] flex items-center gap-2"
              >
                <span className="text-sm font-bold text-[#1E1B4B]">Export this program</span>
                <button
                  type="button"
                  onClick={exportReportPDF}
                  disabled={generatingReport}
                  aria-label="Export this program as PDF"
                  className={`h-10 px-3.5 rounded-xl bg-white text-[#4338CA] font-bold text-sm hover:bg-[#E0E7FF] disabled:opacity-60 ${focusRing}`}
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={exportReportExcel}
                  disabled={generatingExcel}
                  aria-label="Export this program as Excel"
                  className={`h-10 px-3.5 rounded-xl bg-white text-[#4338CA] font-bold text-sm hover:bg-[#E0E7FF] disabled:opacity-60 ${focusRing}`}
                >
                  Excel
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleGenerateInsight(false)}
              disabled={insightLoading}
              className={`h-12 px-[22px] rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] flex items-center gap-2 disabled:opacity-60 ${focusRing}`}
            >
              {insightLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              )}
              AI Insight
            </button>
          </div>
        </div>

        {noStudentsMatch && (
          <p role="alert" className="m-0 px-4 py-3 rounded-2xl bg-[#FEF3C7] text-[#92400E] text-sm font-semibold">{NO_MATCH_TEXT}</p>
        )}

        {exportError && (
          <p role="alert" className="m-0 text-sm font-semibold text-[#BE123C]">{exportError}</p>
        )}

        {/* =================================================
            AI INSIGHT — plain-language explanation of the whole
            dashboard, via /api/analytics-insight (OpenRouter).
        ================================================= */}

        {(insightLoading || insightError || insight) && (
          <section
            aria-labelledby="ai-insight-heading"
            className="px-6 py-6 md:px-7 rounded-[32px] bg-[#1E1B4B] text-white flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="ai-insight-heading" className="m-0 font-bold text-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FBBF24]" aria-hidden="true" />
                AI Insight
              </h2>

              {insight && !insightLoading && (
                <button
                  type="button"
                  onClick={() => handleGenerateInsight(true)}
                  className={`h-11 px-3.5 rounded-xl border-[1.5px] border-white/35 text-white font-bold text-[13px] flex items-center gap-1.5 hover:bg-white/10 ${focusRing}`}
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Regenerate
                </button>
              )}
            </div>

            {insightLoading ? (
              <div className="flex items-center gap-2 py-4 text-[#C7C9F2]">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span className="text-sm font-semibold">Generating explanation...</span>
              </div>
            ) : insightError ? (
              <div className="flex flex-wrap items-center gap-3 py-1">
                <p role="alert" className="m-0 text-sm font-semibold text-rose-300">{insightError}</p>
                <button
                  type="button"
                  onClick={() => handleGenerateInsight(false)}
                  className={`h-11 px-3.5 rounded-xl border-[1.5px] border-white/35 text-white font-bold text-[13px] flex items-center gap-1.5 hover:bg-white/10 ${focusRing}`}
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : insight ? (
              <>
                <div className="space-y-3">
                  {insight.insight.split(/\n{2,}/).map((block, i) => {
                    // The model is asked for "• " bullet lines (normalized
                    // server-side in stripMarkdown) — render those as a
                    // real list instead of relying on whitespace-pre-line
                    // to fake one. A block with no bullet lines (an older
                    // cached insight from before this format, or a model
                    // that ignored the prompt) still falls back to a
                    // plain paragraph.
                    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
                    const isList = lines.length > 0 && lines.every((l) => l.startsWith("• "));

                    if (isList) {
                      return (
                        <ul key={i} className="m-0 list-disc pl-5 flex flex-col gap-2">
                          {lines.map((line, j) => (
                            <li key={j} className="text-[15px] leading-[1.55] text-[#E0E1F7]">
                              {line.replace(/^•\s*/, "")}
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    return (
                      <p key={i} className="m-0 text-[15px] leading-[1.55] text-[#E0E1F7] whitespace-pre-line">
                        {block}
                      </p>
                    );
                  })}
                </div>
                <p className="m-0 text-xs text-[#A5A8E0]">
                  Generated {new Date(insight.generatedAt).toLocaleString()}
                  {insight.cached ? " · cached" : ""}. Generated from the figures on this page. Check before using in a report.
                </p>
              </>
            ) : null}
          </section>
        )}

        {/* =================================================
            EXPORT PDF — DATE RANGE
            (ported from the retired ReportsCenter screen)
        ================================================= */}

        <Card className="p-5 md:p-6 rounded-[28px] border-none shadow-none bg-white">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-slate-400">
                  From
                </Label>
                <Input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-slate-400">
                  To
                </Label>
                <Input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]"
                />
              </div>
            </div>

            <p className="m-0 text-sm text-[#5B6477]">
              Report period: <span className="font-semibold text-[#1E1B4B]">{reportRangeLabel}</span>
            </p>
          </div>
        </Card>

        {/* =================================================
            TABS — the dashboard is split into focused views;
            header, AI Insight, and Export PDF stay above all
            of them.
        ================================================= */}

        <AnalyticsTabBar activeTab={activeTab} onChange={setActiveTab} />

        {(
          <>
          {/* =================================================
              FILTERS
          ================================================= */}

          <Card className="border-none shadow-none rounded-[28px] px-5 py-5 md:px-6 bg-white flex flex-col gap-3.5">

            <h2 className="sr-only">Analytics filters</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-campus" className="text-[13px] font-semibold text-[#334155]">Campus</span>
              <Select
                value={selectedCampus}
                onValueChange={
                  handleCampusFilterChange
                }
              >
                <SelectTrigger aria-labelledby="filter-campus" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="Campus" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All campuses
                  </SelectItem>

                  {campusOptions.map(
                    (campus) => (
                      <SelectItem
                        key={campus}
                        value={campus}
                      >
                        {campus}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-course" className="text-[13px] font-semibold text-[#334155]">Course</span>
              <Select
                value={selectedProgram}
                onValueChange={
                  setSelectedProgram
                }
              >
                <SelectTrigger aria-labelledby="filter-course" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="Program" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All courses
                  </SelectItem>

                  {programOptions.map(
                    (program) => (
                      <SelectItem
                        key={program}
                        value={program}
                      >
                        {program}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-year-level" className="text-[13px] font-semibold text-[#334155]">Year level</span>
              <Select
                value={selectedYearLevel}
                onValueChange={
                  setSelectedYearLevel
                }
              >
                <SelectTrigger aria-labelledby="filter-year-level" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="Year Level" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All year levels
                  </SelectItem>

                  {yearLevelOptions.map(
                    (year) => (
                      <SelectItem
                        key={year}
                        value={year}
                      >
                        {year}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-gender" className="text-[13px] font-semibold text-[#334155]">Gender</span>
              <Select
                value={selectedGender}
                onValueChange={
                  setSelectedGender
                }
              >
                <SelectTrigger aria-labelledby="filter-gender" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All genders
                  </SelectItem>

                  {genderOptions.map(
                    (gender) => (
                      <SelectItem
                        key={gender}
                        value={gender}
                      >
                        {gender}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-age" className="text-[13px] font-semibold text-[#334155]">Age</span>
              <Select
                value={selectedAge}
                onValueChange={setSelectedAge}
              >
                <SelectTrigger aria-labelledby="filter-age" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="Age" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All ages
                  </SelectItem>

                  {ageGroupOptions.map(
                    (group) => (
                      <SelectItem
                        key={group}
                        value={group}
                      >
                        {group}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-academic-year" className="text-[13px] font-semibold text-[#334155]">Academic year</span>
              <Select
                value={selectedAcademicYear}
                onValueChange={
                  setSelectedAcademicYear
                }
              >
                <SelectTrigger aria-labelledby="filter-academic-year" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All years
                  </SelectItem>

                  {academicYearOptions.map(
                    (year) => (
                      <SelectItem
                        key={year}
                        value={year}
                      >
                        {year}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              </div>


              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-program" className="text-[13px] font-semibold text-[#334155]">Program</span>
              <Select
                value={selectedGuidanceProgram}
                onValueChange={(value) => updateFilters({ program: value })}
              >
                <SelectTrigger aria-labelledby="filter-program" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="Program" />
                </SelectTrigger>

                <SelectContent className="max-h-80">
                  <SelectItem value="all">
                    All programs
                  </SelectItem>

                  {programFilterGroups.map((group) => (
                    <SelectGroup key={group.service}>
                      <SelectLabel>{group.service}</SelectLabel>
                      {group.items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-pwd" className="text-[13px] font-semibold text-[#334155]">PWD status</span>
              <Select
                value={selectedPwd}
                onValueChange={(value) => updateFilters({ pwd: value as AnalyticsFilters["pwd"] })}
              >
                <SelectTrigger aria-labelledby="filter-pwd" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="PWD status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pwd">PWD</SelectItem>
                  <SelectItem value="not">Not PWD</SelectItem>
                </SelectContent>
              </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
              <span id="filter-ip" className="text-[13px] font-semibold text-[#334155]">IP status</span>
              <Select
                value={selectedIp}
                onValueChange={(value) => updateFilters({ ip: value as AnalyticsFilters["ip"] })}
              >
                <SelectTrigger aria-labelledby="filter-ip" className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
                  <SelectValue placeholder="IP status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ip">IP</SelectItem>
                  <SelectItem value="not">Not IP</SelectItem>
                </SelectContent>
              </Select>
              </div>

            </div>

            {hasActiveFilters && (
              <p className="m-0 text-[13px] text-[#5B6477]" role="status">
                {describeFilters(filters, selectedProgramName)}
                {selectedGuidanceProgram !== ALL_FILTER && <> · {PARTICIPANTS_DEFINITION}</>}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                variant="ghost"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="h-11 px-3.5 rounded-xl font-bold text-sm text-[#4338CA] hover:bg-[#EEF0FA] disabled:opacity-50"
              >
                Clear filters
              </Button>
            </div>
          </Card>

          </>
        )}

        {activeTab === "overview" && (
          <div className="space-y-6">
          {/* =================================================
              GENERAL SUMMARY
          ================================================= */}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <StatCard
              title="Students covered"
              value={totalStudents}
              description="Profiles + survey participants"
              icon={Users}
              info="Student profiles plus anyone who answered a survey, each person counted once (and narrowed by the filters above). The Users page lists accounts, so its count can differ."
            />

            <StatCard
              title="Guidance programs"
              value={totalGuidancePrograms}
              description="Programs in the system"
              icon={GraduationCap}
              to={selectedGuidanceProgram === ALL_FILTER ? "/admin?tab=programs" : undefined}
              ariaLabel={`View all ${totalGuidancePrograms} ${totalGuidancePrograms === 1 ? "program" : "programs"}`}
              info="A program filter is on, so this is that one program. The programs list shows them all."
            />

            <StatCard
              title="Survey responses"
              value={totalSurveyResponses}
              description={`${activeSurveys} active survey(s)`}
              icon={BarChart3}
              noteTo={selectedGuidanceProgram === ALL_FILTER ? "/admin?tab=surveys&status=active" : undefined}
              noteAriaLabel={`View ${activeSurveys} published ${activeSurveys === 1 ? "survey" : "surveys"}`}
              info="Submitted answers, one per survey taken (narrowed by the filters above). No list shows responses one by one here, so only the active-survey count below opens a list."
            />

            <StatCard
              title="Total materials"
              value={totalMaterials}
              description="Materials in the library"
              icon={FileStack}
              to={materialsListMatches ? "/admin?tab=materials" : undefined}
              ariaLabel={`View all ${totalMaterials} ${totalMaterials === 1 ? "material" : "materials"}`}
              info="The campus or year filter above is applied, so this number can differ from the full list. Clear the filters to open the list."
            />

          </div>

          {/* =================================================
              SURVEY HUB
          ================================================= */}

          <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

              <div className="flex items-start gap-3">

                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5" />
                </div>

                <div>
                  <h2 className="text-lg font-bold text-[#1E1B4B]">
                    Survey & program awareness
                  </h2>

                  <p className="text-[13px] text-[#5B6477] mt-1">
                    Student evaluation and awareness dissemination
                  </p>
                </div>

              </div>

              <div className="grid grid-cols-3 gap-3">

                <div className="bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-[13px] font-semibold text-slate-400">
                    Surveys
                  </p>

                  <p className="text-xl font-black text-slate-800">
                    {surveys.length}
                  </p>
                </div>

                <div className="bg-indigo-50 rounded-xl px-4 py-3">
                  <p className="text-[13px] font-semibold text-indigo-400">
                    Participants
                  </p>

                  <p className="text-xl font-black text-indigo-700">
                    {
                      surveyParticipants
                    }
                  </p>
                </div>

                <div className="bg-emerald-50 rounded-xl px-4 py-3">
                  <p className="text-[13px] font-semibold text-emerald-400">
                    Responses
                  </p>

                  <p className="text-xl font-black text-emerald-700">
                    {
                      totalSurveyResponses
                    }
                  </p>
                </div>

              </div>

            </div>

          </Card>

          </div>
        )}

        {activeTab === "learning" && (
          <div className="space-y-6">
          {/* =================================================
              LEARNING GAIN (pre-test vs post-test): its data comes from
              the learning_gain_summary RPC, driven by the shared filter bar.
          ================================================= */}

          <LearningGainSection filters={filters} />

          </div>
        )}

        {activeTab === "awareness" && (
          <div className="space-y-6">
          {/* =================================================
              KNOWLEDGE AWARENESS
          ================================================= */}

          <div className="space-y-6">

            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg md:text-xl font-bold text-[#1E1B4B]">
                Knowledge awareness
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                info="The average of every scored answer across all awareness checks, shown as a percentage. No list has a matching count."
                title="Overall average score"
                value={
                  awarenessAnalytics.overall !== null
                    ? `${awarenessAnalytics.overall}%`
                    : "No data"
                }
                description={
                  awarenessAnalytics.overallSmall
                    ? `Across all knowledge assessments · ${smallGroupNote(awarenessAnalytics.overallStudents)}`
                    : "Across all knowledge assessments"
                }
                icon={Trophy}
              />

              <StatCard
                title="Scored assessment responses"
                value={awarenessAnalytics.totalResponses}
                description="Knowledge Assessment submissions counted"
                icon={Target}
                info="Pre-test and post-test submissions that were scored (narrowed by the filters above). The Assessments list shows the checks themselves, not submissions, so this number is not a link."
              />
            </div>

            {/* PER PROGRAM */}
            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-[#1E1B4B]">
                    Awareness by program
                  </h3>

                  <p className="text-[13px] text-[#5B6477] mt-1">
                    Average score on questions linked to each program
                  </p>
                </div>

                <div className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[13px] font-semibold">
                  {programAwarenessAnalytics.length} programs with data
                </div>
              </div>

              {programAwarenessAnalytics.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-400 text-xs font-bold text-center px-6">
                  No program-linked knowledge questions have been answered yet.
                  Link a question to a program in the Survey Builder to see it here.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart
                    data={programAwarenessAnalytics}
                    margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />

                    <XAxis
                      dataKey="name"
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      height={90}
                      tick={{ fontSize: 12, fontWeight: 700 }}
                    />

                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 12 }}
                      unit="%"
                    />

                    <Tooltip formatter={(value: number) => `${value}%`} />

                    <Bar
                      dataKey="average"
                      name="Avg. Score"
                      fill="#4f46e5"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {programAwarenessAnalytics.some((p) => p.small) && (
                <ul className="m-0 mt-3 p-0 list-none text-[13px] font-semibold text-[#92400E]">
                  {programAwarenessAnalytics.filter((p) => p.small).map((p) => (
                    <li key={p.programId}>{p.name}: {smallGroupNote(p.students)}</li>
                  ))}
                </ul>
              )}
            </Card>

            {/* DEMOGRAPHIC BREAKDOWNS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[
                { title: "By year level", data: awarenessAnalytics.byYearLevel },
                { title: "By gender", data: awarenessAnalytics.byGender },
                { title: "By PWD status", data: awarenessAnalytics.byPwd },
                { title: "By IP status", data: awarenessAnalytics.byIp },
              ].map(({ title, data }) => (
                <Card
                  key={title}
                  className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white"
                >
                  <h3 className="text-sm font-bold text-[#1E1B4B] mb-1">
                    {title}
                  </h3>

                  <p className="text-[13px] font-bold text-slate-400 mb-5">
                    Average knowledge score
                  </p>

                  {data.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-slate-400 text-xs font-bold">
                      No scored responses yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.map((row) => (
                        <div key={row.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-600">
                              {row.label}
                              <span className="text-slate-400 font-medium">
                                {" "}
                                ({row.count})
                              </span>
                            </span>
                            <span className="text-xs font-black text-indigo-600">
                              {row.average}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full"
                              style={{ width: `${row.average}%` }}
                            />
                          </div>
                          {row.small && (
                            <p className="m-0 mt-1 text-[12px] font-semibold text-[#92400E]">{smallGroupNote(row.students)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* GUIDANCE SERVICE COVERAGE */}
            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">
              <h3 className="text-sm font-bold text-[#1E1B4B] mb-1">
                Guidance service coverage
              </h3>

              <p className="text-[13px] font-bold text-slate-400 mb-5">
                Program count and average awareness score per guidance service
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[13px] font-semibold text-slate-400 border-b border-slate-100">
                      <th className="pb-3 pr-4">Guidance Service</th>
                      <th className="pb-3 pr-4">Programs</th>
                      <th className="pb-3">Avg. Awareness Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guidanceServiceCoverage.map((row) => (
                      <tr key={row.service} className="border-b border-slate-50 last:border-none">
                        <td className="py-3 pr-4 text-xs font-bold text-slate-700">
                          {row.service}
                        </td>
                        <td className="py-3 pr-4 text-xs font-black text-slate-900">
                          {row.programCount}
                        </td>
                        <td className="py-3 text-xs font-black">
                          {row.averageScore !== null ? (
                            <>
                              <span className="text-indigo-600">{row.averageScore}%</span>
                              {row.small && (
                                <span className="block text-[12px] font-semibold text-[#92400E]">{smallGroupNote(row.students)}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300 font-bold">No data</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* AWARENESS BY MATERIAL EXPOSURE — hidden, see SHOW_MATERIAL_EXPOSURE.
                The intervention-outcome comparison: did opening an IEC material
                correlate with a higher knowledge score on that category? */}
            {SHOW_MATERIAL_EXPOSURE && (
            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">
              <h3 className="text-sm font-bold text-[#1E1B4B] mb-1">
                Awareness by material exposure
              </h3>

              <p className="text-[13px] font-bold text-slate-400 mb-5">
                Average knowledge score for students who opened an IEC material in
                that category vs. students who did not
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[13px] font-semibold text-slate-400 border-b border-slate-100">
                      <th className="pb-3 pr-4">IEC Category</th>
                      <th className="pb-3 pr-4">Opened</th>
                      <th className="pb-3 pr-4">Did Not Open</th>
                      <th className="pb-3 pr-4">Difference</th>
                      <th className="pb-3">Respondents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialExposureAwareness.length === 0 ? (
                      <tr>
                        <td className="py-3 pr-4 text-xs font-bold text-slate-300">&mdash;</td>
                        <td className="py-3 pr-4 text-xs font-bold text-slate-300">&mdash;</td>
                        <td className="py-3 pr-4 text-xs font-bold text-slate-300">&mdash;</td>
                        <td className="py-3 pr-4 text-xs font-bold text-slate-300">&mdash;</td>
                        <td className="py-3 text-xs font-bold text-slate-300">&mdash;</td>
                      </tr>
                    ) : (
                      materialExposureAwareness.map((row) => (
                        <tr key={row.category} className="border-b border-slate-50 last:border-none">
                          <td className="py-3 pr-4 text-xs font-bold text-slate-700">
                            {row.category}
                          </td>
                          <td className="py-3 pr-4 text-xs font-black">
                            {row.openedAvg !== null ? (
                              <span className="text-indigo-600">{row.openedAvg}% <span className="text-slate-400 font-medium">({row.openedCount})</span></span>
                            ) : (
                              <span className="text-slate-300 font-bold">No data</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs font-black">
                            {row.notOpenedAvg !== null ? (
                              <span className="text-slate-700">{row.notOpenedAvg}% <span className="text-slate-400 font-medium">({row.notOpenedCount})</span></span>
                            ) : (
                              <span className="text-slate-300 font-bold">No data</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs font-black">
                            {row.difference !== null ? (
                              <span className={row.difference >= 0 ? "text-emerald-600" : "text-rose-500"}>
                                {row.difference >= 0 ? "+" : ""}
                                {row.difference}pp
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">No data</span>
                            )}
                          </td>
                          <td className="py-3 text-xs font-black text-slate-900">
                            {row.totalRespondents}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {materialExposureAwareness.length === 0 && (
                <p className="text-center text-[13px] font-bold text-slate-400 mt-4">
                  No responses have been recorded yet.
                </p>
              )}
            </Card>
            )}

            {/* PROGRAM PARTICIPATION BY COURSE */}
            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">
              <h3 className="text-sm font-bold text-[#1E1B4B] mb-1">
                Program participation by course
              </h3>

              <p className="text-[13px] font-bold text-slate-400 mb-5">
                Share of respondents per academic course who reported joining at
                least one linked guidance program
              </p>

              {programParticipationByCourse.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-400 text-xs font-bold text-center px-6">
                  No data yet. Add a "Checkbox (Multiple Answers)" question with
                  its options linked to Programs (e.g. "Which of these programs
                  have you participated in?") to a survey to see this report.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[13px] font-semibold text-slate-400 border-b border-slate-100">
                        <th className="pb-3 pr-4">Course</th>
                        <th className="pb-3 pr-4">Reached</th>
                        <th className="pb-3 pr-4">Not Reached</th>
                        <th className="pb-3 pr-4">Respondents</th>
                        <th className="pb-3">% Reached</th>
                      </tr>
                    </thead>
                    <tbody>
                      {programParticipationByCourse.map((row) => (
                        <tr key={row.course} className="border-b border-slate-50 last:border-none">
                          <td className="py-3 pr-4 text-xs font-bold text-slate-700">
                            {row.course}
                          </td>
                          <td className="py-3 pr-4 text-xs font-black text-emerald-600">
                            {row.reached}
                          </td>
                          <td className="py-3 pr-4 text-xs font-black text-rose-500">
                            {row.notReached}
                          </td>
                          <td className="py-3 pr-4 text-xs font-black text-slate-900">
                            {row.total}
                          </td>
                          <td className="py-3 text-xs font-black">
                            <span
                              className={
                                row.reachedPct < 50 ? "text-rose-500" : "text-indigo-600"
                              }
                            >
                              {row.reachedPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

          </div>

          </div>
        )}

        {activeTab === "iec" && (
          <div className="space-y-6">
          {/* =================================================
              IEC MATERIAL SUMMARY
          ================================================= */}

          <div className="space-y-4">

            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />

                <h2 className="text-xl font-bold text-[#1E1B4B]">
                  IEC materials analytics
                </h2>
              </div>

              <p className="mt-1 text-[13px] font-bold text-slate-400">
                Information, education and communication material dissemination
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* MAIN CARD */}

              <motion.div
                whileHover={{ y: -4 }}
                className="h-full"
              >
                <Card className="relative overflow-hidden border-none rounded-[1.75rem] bg-indigo-600 text-white shadow-xl p-6 h-full">

                  <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/10" />

                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                        <CalendarDays className="w-6 h-6" />
                      </div>

                      <span className="text-[13px] font-semibold bg-white/10 px-3 py-2 rounded-full">
                        Current month
                      </span>
                    </div>

                    <p className="mt-6 text-[13px] font-semibold text-indigo-100">
                      IEC materials created
                    </p>

                    <p className="mt-1 text-5xl font-black tracking-tighter">
                      {iecMaterialsThisMonth}
                    </p>

                    <p className="mt-2 text-[13px] font-bold text-indigo-100">
                      New IEC materials this month
                    </p>
                  </div>

                </Card>
              </motion.div>

              <StatCard
                title="Total IEC materials"
                value={totalIECMaterials}
                description="All IEC materials"
                icon={BookOpen}
                to={materialsListMatches && totalIECMaterials === totalMaterials ? "/admin?tab=materials" : undefined}
                ariaLabel={`View all ${totalIECMaterials} IEC ${totalIECMaterials === 1 ? "material" : "materials"}`}
                info="The campus or year filter above is applied, or some library items are not tagged as IEC, so the list would show a different count."
              />

              <StatCard
                title="IEC downloads"
                value={totalIECDowloads}
                description="Total material downloads"
                icon={Download}
                info="Every click on a Download button for IEC materials, added up. No list shows this total."
              />

              <StatCard
                title="Downloads of this month's uploads"
                value={downloadsThisMonth}
                description="All-time downloads of materials uploaded this month"
                icon={TrendingUp}
                info="Adds up every download ever made of the materials uploaded this month. It is not the downloads made this month: the system does not record when each download happened."
              />

            </div>

          </div>

          {/* =================================================
              IEC CREATION TREND
          ================================================= */}

          <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">

              <div>
                <h2 className="text-lg md:text-xl font-bold text-[#1E1B4B]">
                  IEC material creation trend
                </h2>

                <p className="text-[13px] text-[#5B6477] mt-1">
                  Number of IEC materials created per month — current year
                </p>
              </div>

              <div className="px-4 py-3 rounded-xl bg-indigo-50 text-indigo-700">
                <p className="text-[13px] font-semibold">
                  This year
                </p>

                <p className="text-xl font-black">
                  {iecMaterialsThisYear}
                </p>
              </div>

            </div>

            <ResponsiveContainer
              width="100%"
              height={330}
            >
              <LineChart
                data={iecMonthlyTrend}
                margin={{
                  top: 10,
                  right: 15,
                  left: 0,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="month"
                  tick={{
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{
                    fontSize: 12,
                  }}
                />

                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="materials"
                  name="IEC materials"
                  stroke="#4f46e5"
                  strokeWidth={4}
                  dot={{
                    r: 5,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>

          </Card>

          {/* =================================================
              IEC CATEGORY + MATERIAL TYPE
          ================================================= */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* CATEGORY */}

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-[#1E1B4B]">
                    IEC by category
                  </h2>

                  <p className="text-[13px] text-[#5B6477] mt-1">
                    Distribution of IEC materials by category
                  </p>
                </div>

                <BookOpen className="w-5 h-5 text-indigo-500" />
              </div>

              {iecCategoryAnalytics.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs font-bold text-slate-400">
                  No IEC material data available.
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={320}
                >
                  <BarChart
                    data={
                      iecCategoryAnalytics
                    }
                    margin={{
                      bottom: 60,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="category"
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      height={90}
                      tick={{
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    />

                    <YAxis
                      allowDecimals={false}
                      tick={{
                        fontSize: 12,
                      }}
                    />

                    <Tooltip />

                    <Bar
                      dataKey="count"
                      name="IEC materials"
                      fill="#4f46e5"
                      radius={[
                        8,
                        8,
                        0,
                        0,
                      ]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}

            </Card>

            {/* MATERIAL TYPE */}

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <h2 className="text-lg font-bold text-[#1E1B4B]">
                Materials by type
              </h2>

              <p className="text-[13px] text-[#5B6477] mt-1">
                IEC and other material classifications
              </p>

              <div className="h-72 mt-4">

                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>

                    <Pie
                      data={
                        materialTypeAnalytics
                      }
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={50}
                      paddingAngle={4}
                    >
                      {materialTypeAnalytics.map(
                        (_, index) => (
                          <Cell
                            key={index}
                            fill={
                              COLORS[
                                index %
                                  COLORS.length
                              ]
                            }
                          />
                        )
                      )}
                    </Pie>

                    <Tooltip />

                    <Legend />

                  </PieChart>
                </ResponsiveContainer>

              </div>

            </Card>

          </div>

          {/* =================================================
              MATERIAL FORMAT
          ================================================= */}
          {/* Campus breakdown was dropped here — every IEC material in
              practice gets the same default campus on upload, so a
              distribution-by-campus chart was always one full pie slice,
              not an actual breakdown. */}

          <div className="grid grid-cols-1 gap-6">

            {/* FORMAT */}

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white max-w-2xl">

              <h2 className="text-lg font-bold text-[#1E1B4B]">
                Materials by format
              </h2>

              <p className="text-[13px] text-[#5B6477] mt-1 mb-5">
                PDF, PNG, JPG, MP4 and other formats
              </p>

              <ResponsiveContainer
                width="100%"
                height={300}
              >
                <BarChart
                  data={
                    materialFormatAnalytics
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="format"
                    tick={{
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fontSize: 12,
                    }}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="count"
                    name="Materials"
                    fill="#7c3aed"
                    radius={[
                      8,
                      8,
                      0,
                      0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>

            </Card>

          </div>

          {/* =================================================
              RECENT IEC MATERIALS
          ================================================= */}

          <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">

              <div>
                <h2 className="text-lg md:text-xl font-bold text-[#1E1B4B]">
                  Recent IEC materials
                </h2>

                <p className="text-[13px] text-[#5B6477] mt-1">
                  Latest IEC materials added to the system
                </p>
              </div>

              <div className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[13px] font-semibold">
                {iecMaterialsThisMonth} Created This Month
              </div>

            </div>

            {recentIECMaterials.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <FileStack className="w-10 h-10 mx-auto mb-3 opacity-40" />

                <p className="text-xs font-bold">
                  No IEC materials available.
                </p>
              </div>
            ) : (
              <div className="space-y-3">

                {recentIECMaterials.map(
                  (material) => (
                    <div
                      key={String(
                        material.id
                      )}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 hover:bg-indigo-50/50 transition"
                    >

                      <div className="flex items-center gap-3 min-w-0">

                        <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm shrink-0">

                          {(() => {
                            // `format` is never actually populated on
                            // uploads — the real value lives in `type`
                            // ("PDF"/"Image"/"Video"/...). Falling back to
                            // it here is what materialFormatAnalytics
                            // already does; this render just hadn't.
                            const displayFormat = normalize(
                              safeString(material.format) ||
                                safeString(material.type)
                            );
                            if (displayFormat === "pdf") {
                              return <FileText className="w-5 h-5" />;
                            }
                            if (
                              displayFormat === "png" ||
                              displayFormat === "jpg" ||
                              displayFormat === "jpeg" ||
                              displayFormat === "image"
                            ) {
                              return <ImageIcon className="w-5 h-5" />;
                            }
                            if (displayFormat === "mp4" || displayFormat === "video") {
                              return <Video className="w-5 h-5" />;
                            }
                            return <File className="w-5 h-5" />;
                          })()}

                        </div>

                        <div className="min-w-0">

                          <p className="font-black text-sm text-slate-800 truncate">
                            {safeString(
                              material.title
                            ) ||
                              "Untitled Material"}
                          </p>

                          <div className="flex flex-wrap gap-2 mt-1">

                            <span className="text-[13px] font-semibold text-indigo-600">
                              {safeString(
                                material.category
                              ) ||
                                "Uncategorized"}
                            </span>

                            <span className="text-[13px] font-bold text-slate-400">
                              {safeString(material.format) ||
                                safeString(material.type) ||
                                "Unknown Format"}
                            </span>

                            <span className="text-[13px] font-bold text-slate-400">
                              {campusLabel(
                                safeString(material.campus)
                              )}
                            </span>

                          </div>

                        </div>

                      </div>

                      <div className="flex items-center gap-5 md:shrink-0">

                        <div className="text-right">
                          <p className="text-[13px] font-semibold text-slate-400">
                            Downloads
                          </p>

                          <p className="text-sm font-black text-slate-800">
                            {Number(
                              material.downloads ||
                                0
                            )}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[13px] font-semibold text-slate-400">
                            Created
                          </p>

                          <p className="text-xs font-bold text-slate-600">
                            {material.created_at
                              ? new Date(
                                  material.created_at
                                ).toLocaleDateString()
                              : "N/A"}
                          </p>
                        </div>

                      </div>

                    </div>
                  )
                )}

              </div>
            )}

          </Card>

          <MaterialReachSection
            data={materialReach}
            loading={reachLoading}
            error={reachError}
            iecProgramId={reachIecProgramId}
            onIecProgramChange={setReachIecProgramId}
            includeTest={reachIncludeTest}
            onIncludeTestChange={setReachIncludeTest}
          />

          </div>
        )}

        {activeTab === "students" && (
          <div className="space-y-6">
          {/* =================================================
              COURSE + YEAR LEVEL
          ================================================= */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <h2 className="text-lg font-bold text-[#1E1B4B]">
                Students by course
              </h2>

              <p className="text-[13px] text-[#5B6477] mt-1 mb-5">
                Demographic distribution by academic program &middot; click a bar to view students in Users
              </p>

              <ResponsiveContainer
                width="100%"
                height={300}
              >
                <BarChart
                  data={courseAnalytics}
                  margin={{
                    bottom: 60,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="course"
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                    height={80}
                    tick={{
                      fontSize: 12,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fontSize: 12,
                    }}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="count"
                    name="Students"
                    fill="#7c3aed"
                    radius={[
                      8,
                      8,
                      0,
                      0,
                    ]}
                    cursor="pointer"
                    onClick={(data: any) => data?.course && navigate(`/admin/users?program=${encodeURIComponent(data.course)}`)}
                  />
                </BarChart>
              </ResponsiveContainer>

            </Card>

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <h2 className="text-lg font-bold text-[#1E1B4B]">
                Students by year level
              </h2>

              <p className="text-[13px] text-[#5B6477] mt-1 mb-5">
                Higher education student distribution
              </p>

              <ResponsiveContainer
                width="100%"
                height={300}
              >
                <BarChart
                  data={
                    yearLevelAnalytics
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="year"
                    tick={{
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fontSize: 12,
                    }}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="count"
                    name="Students"
                    fill="#db2777"
                    radius={[
                      8,
                      8,
                      0,
                      0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>

            </Card>

          </div>

          {/* =================================================
              GENDER + AGE
          ================================================= */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <h2 className="text-lg font-bold text-[#1E1B4B]">
                Gender distribution
              </h2>

              <p className="text-[13px] text-[#5B6477] mt-1">
                Student demographic analytics
              </p>

              <div className="h-72 mt-4">

                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>

                    <Pie
                      data={
                        genderAnalytics
                      }
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={50}
                      paddingAngle={4}
                    >
                      {genderAnalytics.map(
                        (_, index) => (
                          <Cell
                            key={index}
                            fill={
                              COLORS[
                                index %
                                  COLORS.length
                              ]
                            }
                          />
                        )
                      )}
                    </Pie>

                    <Tooltip />

                    <Legend />

                  </PieChart>
                </ResponsiveContainer>

              </div>

            </Card>

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <h2 className="text-lg font-bold text-[#1E1B4B]">
                Age distribution
              </h2>

              <p className="text-[13px] text-[#5B6477] mt-1 mb-5">
                Student age-group analytics
              </p>

              <ResponsiveContainer
                width="100%"
                height={280}
              >
                <BarChart
                  data={ageAnalytics}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="group"
                    tick={{
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fontSize: 12,
                    }}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="count"
                    name="Students"
                    fill="#ea580c"
                    radius={[
                      8,
                      8,
                      0,
                      0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>

            </Card>

          </div>

          {/* =================================================
              PWD / IP
          ================================================= */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <Card className="border-none shadow-none rounded-[32px] p-6 bg-white">

              <div className="flex items-center gap-3">

                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Accessibility className="w-5 h-5" />
                </div>

                <div>
                  <h3 className="font-bold text-[#1E1B4B]">
                    PWD representation
                  </h3>

                  <p className="text-[13px] font-bold text-slate-400">
                    Persons with disabilities
                  </p>
                </div>

              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">

                <button
                  type="button"
                  onClick={() => inclusionAnalytics.pwd > 0 && navigate('/admin/users?inclusion=pwd')}
                  disabled={inclusionAnalytics.pwd === 0}
                  className={`bg-blue-50 rounded-2xl p-4 text-left transition-colors ${inclusionAnalytics.pwd > 0 ? 'hover:bg-blue-100 cursor-pointer' : 'cursor-default'}`}
                >
                  <p className="text-[13px] font-semibold text-blue-500">
                    PWD
                  </p>

                  <p className="text-3xl font-black text-blue-700 mt-1">
                    {
                      inclusionAnalytics.pwd
                    }
                  </p>
                  {inclusionAnalytics.pwd > 0 && (
                    <p className="text-[13px] font-semibold text-blue-400 mt-1">View in Users &rarr;</p>
                  )}
                </button>

                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[13px] font-semibold text-slate-400">
                    Non-PWD
                  </p>

                  <p className="text-3xl font-black text-slate-700 mt-1">
                    {
                      inclusionAnalytics.nonPwd
                    }
                  </p>
                </div>

              </div>

              {inclusionAnalytics.pwd > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                  <InclusionBreakdownList
                    title="By campus"
                    rows={inclusionBreakdown.pwd.byCampus}
                    accentClassName="bg-blue-50 text-blue-600"
                  />
                  <InclusionBreakdownList
                    title="By program"
                    rows={inclusionBreakdown.pwd.byProgram}
                    accentClassName="bg-blue-50 text-blue-600"
                  />
                  <InclusionBreakdownList
                    title="By year level"
                    rows={inclusionBreakdown.pwd.byYearLevel}
                    accentClassName="bg-blue-50 text-blue-600"
                  />
                </div>
              )}

            </Card>

            <Card className="border-none shadow-none rounded-[32px] p-6 bg-white">

              <div className="flex items-center gap-3">

                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Globe2 className="w-5 h-5" />
                </div>

                <div>
                  <h3 className="font-bold text-[#1E1B4B]">
                    IP representation
                  </h3>

                  <p className="text-[13px] font-bold text-slate-400">
                    Indigenous Peoples
                  </p>
                </div>

              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">

                <button
                  type="button"
                  onClick={() => inclusionAnalytics.ip > 0 && navigate('/admin/users?inclusion=ip')}
                  disabled={inclusionAnalytics.ip === 0}
                  className={`bg-emerald-50 rounded-2xl p-4 text-left transition-colors ${inclusionAnalytics.ip > 0 ? 'hover:bg-emerald-100 cursor-pointer' : 'cursor-default'}`}
                >
                  <p className="text-[13px] font-semibold text-emerald-500">
                    IP
                  </p>

                  <p className="text-3xl font-black text-emerald-700 mt-1">
                    {
                      inclusionAnalytics.ip
                    }
                  </p>
                  {inclusionAnalytics.ip > 0 && (
                    <p className="text-[13px] font-semibold text-emerald-500/70 mt-1">View in Users &rarr;</p>
                  )}
                </button>

                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[13px] font-semibold text-slate-400">
                    Non-IP
                  </p>

                  <p className="text-3xl font-black text-slate-700 mt-1">
                    {
                      inclusionAnalytics.nonIp
                    }
                  </p>
                </div>

              </div>

              {inclusionAnalytics.ip > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                  <InclusionBreakdownList
                    title="By campus"
                    rows={inclusionBreakdown.ip.byCampus}
                    accentClassName="bg-emerald-50 text-emerald-600"
                  />
                  <InclusionBreakdownList
                    title="By program"
                    rows={inclusionBreakdown.ip.byProgram}
                    accentClassName="bg-emerald-50 text-emerald-600"
                  />
                  <InclusionBreakdownList
                    title="By year level"
                    rows={inclusionBreakdown.ip.byYearLevel}
                    accentClassName="bg-emerald-50 text-emerald-600"
                  />
                </div>
              )}

            </Card>

          </div>

          {/* =================================================
              CAMPUS DISTRIBUTION
          ================================================= */}

          <div className="grid grid-cols-1 gap-6">

            <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">

              <h2 className="text-lg font-bold text-[#1E1B4B]">
                Campus distribution
              </h2>

              <p className="text-[13px] text-[#5B6477] mt-1">
                Student distribution by campus &middot; click a slice to view students in Users
              </p>

              <div className="h-72 mt-4">

                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>

                    <Pie
                      data={
                        campusAnalytics
                      }
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {campusAnalytics.map(
                        (entry, index) => (
                          <Cell
                            key={index}
                            fill={
                              COLORS[
                                index %
                                  COLORS.length
                              ]
                            }
                            cursor="pointer"
                            onClick={() => navigate(`/admin/users?campus=${encodeURIComponent(entry.name)}`)}
                          />
                        )
                      )}
                    </Pie>

                    <Tooltip />

                    <Legend />

                  </PieChart>
                </ResponsiveContainer>

              </div>

            </Card>

          </div>

          </div>
        )}

        {/* =================================================
            ADMIN FOOTER
        ================================================= */}

        <div className="bg-[#1E1B4B] rounded-[32px] p-6 md:p-7 text-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">

            <div className="flex items-start gap-3">

              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>

              <div>

                <h3 className="text-sm font-semibold">
                  Administrative analytics
                </h3>

                <p className="text-[13px] text-slate-400 mt-1 max-w-3xl leading-relaxed">
                  Analytics are generated from
                  registered student profiles,
                  Guidance programs,
                  survey responses, and IEC
                  materials stored in the
                  materials table.
                </p>

              </div>

            </div>

            <Button
              onClick={fetchAnalytics}
              variant="ghost"
              className="h-11 px-4 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 text-sm font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh data
            </Button>

          </div>

        </div>

      </div>
    </div>
  );
}