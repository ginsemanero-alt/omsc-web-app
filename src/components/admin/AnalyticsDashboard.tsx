import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

import {
  Download,
  Users,
  GraduationCap,
  BarChart3,
  ClipboardList,
  Loader2,
  FileText,
  Table as TableIcon,
  FileJson,
  RefreshCw,
  Accessibility,
  Globe2,
  ShieldCheck,
  ChevronDown,
  Info,
  BookOpen,
  FileStack,
  CalendarDays,
  TrendingUp,
  Image as ImageIcon,
  Video,
  File,
  Eye,
  Trophy,
  Target,
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
import { saveAs } from "file-saver";

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
  program_component?: string | null;
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
  questions_data?: any[];
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
}

// Bridges survey_responses.user_id (a bigint FK to users.id) to
// profiles (keyed on the auth uuid): users.id -> users.student_id ->
// profiles.student_id. Neither users.id nor profiles.id can be
// compared directly to each other.
interface UserBridge {
  id: string | number;
  student_id?: string | null;
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
  program_component?: string | null;

  tags?: string[] | null;
}

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  className?: string;
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

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  className = "",
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Card
        className={`relative overflow-hidden border-none rounded-[1.75rem] bg-white shadow-lg shadow-slate-100 p-5 md:p-6 h-full ${className}`}
      >
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-indigo-50" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
              {title}
            </p>

            <p className="mt-2 text-3xl md:text-4xl font-black tracking-tighter text-slate-900">
              {value}
            </p>

            <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">
              {description}
            </p>
          </div>

          <div className="w-11 h-11 shrink-0 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Icon className="w-5 h-5" strokeWidth={2.5} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

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

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [programs, setPrograms] = useState<GuidanceProgram[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<
    SurveyResponse[]
  >([]);
  const [userBridge, setUserBridge] = useState<UserBridge[]>([]);

  /* MATERIALS */

  const [materials, setMaterials] = useState<Material[]>([]);

  /* FILTERS */

  const [selectedCampus, setSelectedCampus] = useState("all");
  const [selectedProgram, setSelectedProgram] = useState("all");
  const [selectedYearLevel, setSelectedYearLevel] = useState("all");
  const [selectedGender, setSelectedGender] = useState("all");
  const [selectedAcademicYear, setSelectedAcademicYear] =
    useState("all");

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
      ] = await Promise.all([
        supabase.from("profiles").select("*"),

        supabase
          .from("programs")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("surveys")
          .select("*")
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
          .order("created_at", { ascending: false }),

        // Only the columns needed to bridge survey_responses.user_id to
        // profiles via student_id (see UserBridge above).
        supabase.from("users").select("id, student_id"),
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

      setProfiles((profilesResult.data || []) as Profile[]);
      setPrograms((programsResult.data || []) as GuidanceProgram[]);
      setSurveys((surveysResult.data || []) as Survey[]);
      setSurveyResponses(
        (responsesResult.data || []) as SurveyResponse[]
      );

      setMaterials((materialsResult.data || []) as Material[]);
      setUserBridge((userBridgeResult.data || []) as UserBridge[]);
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

  const programOptions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .map((p) => safeString(p.program))
          .filter(Boolean)
      )
    ).sort();
  }, [profiles]);

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

  const hasActiveFilters =
    selectedCampus !== "all" ||
    selectedProgram !== "all" ||
    selectedYearLevel !== "all" ||
    selectedGender !== "all" ||
    selectedAcademicYear !== "all";

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

      const academicYearMatch =
        selectedAcademicYear === "all" ||
        (profile.created_at &&
          String(
            new Date(profile.created_at).getFullYear()
          ) === selectedAcademicYear);

      return (
        campusMatch &&
        programMatch &&
        yearMatch &&
        genderMatch &&
        academicYearMatch
      );
    });
  }, [
    profiles,
    selectedCampus,
    selectedProgram,
    selectedYearLevel,
    selectedGender,
    selectedAcademicYear,
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
    return surveyResponses.filter((response) => {
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
  ]);

  /* =======================================================
     MATERIAL FILTERING
     
     Materials do not have student/user IDs.
     
     Therefore:
     - Campus filter applies to materials.
     - Academic year filter applies to created_at.
     - Program/year/gender filters do not alter materials.
  ======================================================= */

  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => {
      const campus = normalize(material.campus);

      const campusMatch =
        selectedCampus === "all" ||
        campus === normalize(selectedCampus) ||
        campus === "universal";

      const academicYearMatch =
        selectedAcademicYear === "all" ||
        (material.created_at &&
          String(
            new Date(material.created_at).getFullYear()
          ) === selectedAcademicYear);

      return campusMatch && academicYearMatch;
    });
  }, [
    materials,
    selectedCampus,
    selectedAcademicYear,
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
        addParticipant(
          response.user_id,
          response.student_id
        );
      }
    );

    return participants.size;
  }, [
    filteredProfiles,
    filteredSurveyResponses,
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

  /* =======================================================
     PRE-TEST / POST-TEST COMPARISON

     A single Knowledge Assessment only measures awareness at one
     point in time — it can't show that a student actually learned
     something. Pairing a "(Pre-Test)" survey with a "(Post-Test)"
     survey of the same topic (same title minus that suffix) lets us
     compute a per-student gain score, which is the actual evidence
     of a knowledge/awareness improvement.
  ======================================================= */

  const getBaseTopicAndPhase = (
    title: string
  ): { base: string; phase: "pre" | "post" | null } => {
    const preMatch = title.match(/^(.*?)\s*\(pre-test\)\s*$/i);
    if (preMatch) return { base: preMatch[1].trim(), phase: "pre" };

    const postMatch = title.match(/^(.*?)\s*\(post-test\)\s*$/i);
    if (postMatch) return { base: postMatch[1].trim(), phase: "post" };

    return { base: title, phase: null };
  };

  const prePostComparison = useMemo(() => {
    const surveysById: Record<string, Survey> = {};
    surveys.forEach((survey) => {
      surveysById[safeString(survey.id)] = survey;
    });

    // topic -> studentId -> { pre?: percentage, post?: percentage }
    const byTopic: Record<string, Record<string, { pre?: number; post?: number }>> = {};

    scoredSurveyResponses.forEach((response) => {
      const survey = surveysById[safeString(response.survey_id)];
      if (!survey?.title) return;

      const { base, phase } = getBaseTopicAndPhase(survey.title);
      if (!phase) return;

      const studentId =
        userIdToStudentId[safeString(response.user_id)] ||
        safeString(response.student_id);
      if (!studentId) return;

      if (!byTopic[base]) byTopic[base] = {};
      if (!byTopic[base][studentId]) byTopic[base][studentId] = {};
      byTopic[base][studentId][phase] = response.percentage ?? 0;
    });

    const average = (values: number[]) =>
      values.length > 0
        ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
        : null;

    return Object.entries(byTopic)
      .map(([topic, students]) => {
        const preScores: number[] = [];
        const postScores: number[] = [];
        const gains: number[] = [];
        let improvedCount = 0;

        Object.values(students).forEach((entry) => {
          if (entry.pre !== undefined) preScores.push(entry.pre);
          if (entry.post !== undefined) postScores.push(entry.post);

          if (entry.pre !== undefined && entry.post !== undefined) {
            const gain = entry.post - entry.pre;
            gains.push(gain);
            if (gain > 0) improvedCount += 1;
          }
        });

        return {
          topic,
          preAvg: average(preScores),
          postAvg: average(postScores),
          avgGain: average(gains),
          pairedCount: gains.length,
          improvedCount,
          preOnlyCount: preScores.length,
          postOnlyCount: postScores.length,
        };
      })
      .sort((a, b) => b.pairedCount - a.pairedCount);
  }, [scoredSurveyResponses, surveys, userIdToStudentId]);

  const awarenessAnalytics = useMemo(() => {
    const average = (values: number[]) =>
      values.length > 0
        ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
        : null;

    const overall = average(
      scoredSurveyResponses.map((r) => r.percentage || 0)
    );

    const groupBy = (
      keyFn: (profile: Profile | undefined) => string
    ) => {
      const buckets: Record<string, number[]> = {};

      scoredSurveyResponses.forEach((response) => {
        const studentId = userIdToStudentId[safeString(response.user_id)];
        const profile = studentId ? profileByStudentId[studentId] : undefined;
        const key = keyFn(profile);

        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(response.percentage || 0);
      });

      return Object.entries(buckets)
        .map(([label, values]) => ({
          label,
          average: average(values) ?? 0,
          count: values.length,
        }))
        .sort((a, b) => b.count - a.count);
    };

    return {
      overall,
      totalResponses: scoredSurveyResponses.length,
      byYearLevel: groupBy((p) => getYearLevel(p?.year_level)),
      byGender: groupBy((p) => safeString(p?.gender) || "Not Specified"),
      byPwd: groupBy((p) => (p?.is_pwd ? "PWD" : "Non-PWD")),
      byIp: groupBy((p) => (p?.is_ip ? "IP" : "Non-IP")),
    };
  }, [scoredSurveyResponses, userIdToStudentId, profileByStudentId]);

  const programAwarenessAnalytics = useMemo(() => {
    const buckets: Record<string, number[]> = {};

    scoredSurveyResponses.forEach((response) => {
      const survey = surveys.find(
        (s) => safeString(s.id) === safeString(response.survey_id)
      );

      const questions = Array.isArray(survey?.questions_data)
        ? survey!.questions_data
        : [];

      questions.forEach((question: any) => {
        if (
          question?.type !== "mcq" ||
          !question?.correct_option ||
          !question?.related_program_id
        ) {
          return;
        }

        const programId = safeString(question.related_program_id);
        const given = response.answers?.[String(question.id)];
        const isCorrect = given === question.correct_option ? 1 : 0;

        if (!buckets[programId]) buckets[programId] = [];
        buckets[programId].push(isCorrect * 100);
      });
    });

    return Object.entries(buckets)
      .map(([programId, values]) => {
        const program = programs.find(
          (p) => safeString(p.id) === programId
        );

        return {
          programId,
          name: program ? getProgramName(program) : `Program #${programId}`,
          average: Math.round(
            values.reduce((sum, v) => sum + v, 0) / values.length
          ),
          count: values.length,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [scoredSurveyResponses, surveys, programs]);

  /* =======================================================
     GUIDANCE SERVICE COVERAGE

     Usita asked to "include all the Programs of Guidance" — this
     shows program count and average awareness score per guidance
     service, across the fixed 6-category list, including
     categories with zero programs so gaps are visible too.
  ======================================================= */

  const guidanceServiceCoverage = useMemo(() => {
    const programCounts: Record<string, number> = {};

    programs.forEach((program) => {
      const service = safeString(program.guidance_service);
      if (service) programCounts[service] = (programCounts[service] || 0) + 1;
    });

    const serviceByProgramId: Record<string, string> = {};
    programs.forEach((program) => {
      const service = safeString(program.guidance_service);
      if (service) serviceByProgramId[safeString(program.id)] = service;
    });

    const scoreBuckets: Record<string, number[]> = {};

    scoredSurveyResponses.forEach((response) => {
      const survey = surveys.find(
        (s) => safeString(s.id) === safeString(response.survey_id)
      );

      const questions = Array.isArray(survey?.questions_data)
        ? survey!.questions_data
        : [];

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

        if (!scoreBuckets[service]) scoreBuckets[service] = [];
        scoreBuckets[service].push(isCorrect * 100);
      });
    });

    return GUIDANCE_SERVICES.map((service) => {
      const scores = scoreBuckets[service] || [];

      return {
        service,
        programCount: programCounts[service] || 0,
        averageScore:
          scores.length > 0
            ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length)
            : null,
      };
    });
  }, [programs, scoredSurveyResponses, surveys]);

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
    return surveys.filter(
      (survey) =>
        normalize(survey.status) ===
        "active"
    ).length;
  }, [surveys]);

  /* =======================================================
     MONTHLY PROGRAM PARTICIPATION

     Was derived from program_registrations, removed in
     Phase 1b. Kept as an explicit empty array so the trend
     chart renders its "no data" state instead of a flat
     zero line that could be mistaken for real data.
  ======================================================= */

  const monthlyParticipation: {
    month: string;
    participants: number;
  }[] = [];

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
     MATERIAL CAMPUS ANALYTICS
  ------------------------------------------------------- */

  const materialCampusAnalytics =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      filteredMaterials.forEach(
        (material) => {
          const campus =
            safeString(
              material.campus
            ) ||
            "Not Specified";

          counts[campus] =
            (counts[campus] || 0) + 1;
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
    programs.length;

  const totalSurveyResponses =
    filteredSurveyResponses.length;

  /* =======================================================
     REPORT ROWS
  ======================================================= */

  const getReportRows = () => {
    return [
      [
        "Metric",
        "Value",
      ],

      [
        "Students Covered",
        totalStudents,
      ],

      [
        "Guidance Programs",
        totalGuidancePrograms,
      ],

      [
        "Active Surveys",
        activeSurveys,
      ],

      [
        "Unique Survey Participants",
        surveyParticipants,
      ],

      [
        "Survey Responses",
        totalSurveyResponses,
      ],

      [
        "Total Materials",
        totalMaterials,
      ],

      [
        "Total IEC Materials",
        totalIECMaterials,
      ],

      [
        "IEC Materials Created This Month",
        iecMaterialsThisMonth,
      ],

      [
        "Materials Created This Month",
        materialsThisMonth,
      ],

      [
        "Materials Created This Year",
        materialsThisYear,
      ],

      [
        "Total IEC Downloads",
        totalIECDowloads,
      ],

      [
        "Downloads This Month",
        downloadsThisMonth,
      ],

      [
        "PWD Students",
        inclusionAnalytics.pwd,
      ],

      [
        "IP Students",
        inclusionAnalytics.ip,
      ],
    ];
  };

  /* =======================================================
     PDF EXPORT
  ======================================================= */

  const exportToPDF = () => {
    const doc = new jsPDF() as any;

    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.setFontSize(18);

    doc.text(
      "OMSC GUIDANCE ANALYTICS REPORT",
      14,
      20
    );

    doc.setFontSize(9);

    doc.setTextColor(100);

    doc.text(
      `Generated: ${new Date().toLocaleString()}`,
      14,
      28
    );

    autoTable(doc, {
      startY: 36,

      head: [
        [
          "ANALYTICS METRIC",
          "VALUE",
        ],
      ],

      body:
        getReportRows().slice(1),

      headStyles: {
        fillColor: [
          79,
          70,
          229,
        ],
        textColor: [
          255,
          255,
          255,
        ],
        fontStyle:
          "bold",
      },

      alternateRowStyles: {
        fillColor: [
          248,
          250,
          252,
        ],
      },
    });

    let nextY =
      (doc.lastAutoTable
        ?.finalY || 36) + 12;

    /* IEC REPORT */

    doc.setFontSize(13);

    doc.setTextColor(15);

    doc.text(
      "IEC MATERIAL ANALYTICS",
      14,
      nextY
    );

    nextY += 6;

    autoTable(doc, {
      startY: nextY,

      head: [
        [
          "CATEGORY",
          "COUNT",
        ],
      ],

      body:
        iecCategoryAnalytics.map(
          (row) => [
            row.category,
            row.count,
          ]
        ),

      headStyles: {
        fillColor: [
          5,
          150,
          105,
        ],
        textColor: [
          255,
          255,
          255,
        ],
      },
    });

    nextY =
      (doc.lastAutoTable
        ?.finalY || nextY) + 12;

    doc.setFontSize(13);

    doc.text(
      "RECENT IEC MATERIALS",
      14,
      nextY
    );

    autoTable(doc, {
      startY: nextY + 6,

      head: [
        [
          "TITLE",
          "FORMAT",
          "CATEGORY",
          "CAMPUS",
          "DOWNLOADS",
          "CREATED",
        ],
      ],

      body:
        recentIECMaterials.map(
          (material) => [
            safeString(
              material.title
            ),
            safeString(
              material.format
            ),
            safeString(
              material.category
            ),
            safeString(
              material.campus
            ),
            Number(
              material.downloads ||
                0
            ),
            material.created_at
              ? new Date(
                  material.created_at
                ).toLocaleDateString()
              : "",
          ]
        ),

      headStyles: {
        fillColor: [
          79,
          70,
          229,
        ],
        textColor: [
          255,
          255,
          255,
        ],
      },
    });

    let prePostY =
      (doc.lastAutoTable
        ?.finalY || nextY) + 12;

    doc.setFontSize(13);

    doc.text(
      "PRE-TEST VS POST-TEST COMPARISON",
      14,
      prePostY
    );

    autoTable(doc, {
      startY: prePostY + 6,

      head: [
        [
          "TOPIC",
          "PRE-TEST AVG",
          "POST-TEST AVG",
          "AVG GAIN",
          "PAIRED STUDENTS",
          "IMPROVED",
        ],
      ],

      body: prePostComparison.map((row) => [
        row.topic,
        row.preAvg !== null ? `${row.preAvg}%` : "-",
        row.postAvg !== null ? `${row.postAvg}%` : "-",
        row.avgGain !== null ? `${row.avgGain >= 0 ? "+" : ""}${row.avgGain}%` : "-",
        row.pairedCount,
        row.pairedCount > 0 ? `${row.improvedCount}/${row.pairedCount}` : "-",
      ]),

      headStyles: {
        fillColor: [
          79,
          70,
          229,
        ],
        textColor: [
          255,
          255,
          255,
        ],
      },
    });

    doc.save(
      `OMSC_Guidance_Analytics_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`
    );
  };

  /* =======================================================
     CSV EXPORT
  ======================================================= */

  const exportToCSV = () => {
    const rows: any[][] = [];

    rows.push([
      "OMSC GUIDANCE ANALYTICS REPORT",
    ]);

    rows.push([]);

    rows.push([
      "SUMMARY",
      "VALUE",
    ]);

    getReportRows()
      .slice(1)
      .forEach((row) =>
        rows.push(row)
      );

    rows.push([]);

    /* IEC */

    rows.push([
      "IEC MATERIAL ANALYTICS",
    ]);

    rows.push([
      "CATEGORY",
      "COUNT",
    ]);

    iecCategoryAnalytics.forEach(
      (row) => {
        rows.push([
          row.category,
          row.count,
        ]);
      }
    );

    rows.push([]);

    /* MATERIAL TYPES */

    rows.push([
      "MATERIAL TYPES",
    ]);

    rows.push([
      "MATERIAL TYPE",
      "COUNT",
    ]);

    materialTypeAnalytics.forEach(
      (row) => {
        rows.push([
          row.name,
          row.value,
        ]);
      }
    );

    rows.push([]);

    /* MATERIAL DATA */

    rows.push([
      "MATERIAL DATA",
    ]);

    rows.push([
      "ID",
      "TITLE",
      "MATERIAL TYPE",
      "TYPE",
      "FORMAT",
      "CATEGORY",
      "CAMPUS",
      "PROGRAM COMPONENT",
      "DOWNLOADS",
      "CREATED AT",
    ]);

    filteredMaterials.forEach(
      (material) => {
        rows.push([
          material.id,
          material.title ?? "",
          material.material_type ??
            "",
          material.type ?? "",
          material.format ?? "",
          material.category ??
            "",
          material.campus ?? "",
          material.program_component ??
            "",
          material.downloads ?? 0,
          material.created_at ?? "",
        ]);
      }
    );

    rows.push([]);

    /* PROGRAM AWARENESS */

    rows.push([
      "PROGRAM",
      "AVG KNOWLEDGE SCORE",
      "SCORED ANSWERS",
    ]);

    programAwarenessAnalytics.forEach(
      (row) => {
        rows.push([
          row.name,
          row.average,
          row.count,
        ]);
      }
    );

    rows.push([]);

    /* PRE-TEST / POST-TEST COMPARISON */

    rows.push([
      "TOPIC",
      "PRE-TEST AVG",
      "POST-TEST AVG",
      "AVG GAIN",
      "PAIRED STUDENTS",
      "IMPROVED",
    ]);

    prePostComparison.forEach((row) => {
      rows.push([
        row.topic,
        row.preAvg ?? "",
        row.postAvg ?? "",
        row.avgGain ?? "",
        row.pairedCount,
        row.pairedCount > 0 ? `${row.improvedCount}/${row.pairedCount}` : "",
      ]);
    });

    const csv = rows
      .map((row) =>
        row
          .map((value) =>
            escapeCSV(value)
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob(
      [csv],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    saveAs(
      blob,
      `OMSC_Guidance_Analytics_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
  };

  /* =======================================================
     JSON EXPORT
  ======================================================= */

  const exportToJSON = () => {
    const report = {
      generated_at:
        new Date().toISOString(),

      filters: {
        campus:
          selectedCampus,

        program:
          selectedProgram,

        year_level:
          selectedYearLevel,

        gender:
          selectedGender,

        academic_year:
          selectedAcademicYear,
      },

      summary: {
        students_covered:
          totalStudents,

        guidance_programs:
          totalGuidancePrograms,

        active_surveys:
          activeSurveys,

        unique_survey_participants:
          surveyParticipants,

        survey_responses:
          totalSurveyResponses,

        total_materials:
          totalMaterials,

        total_iec_materials:
          totalIECMaterials,

        iec_materials_this_month:
          iecMaterialsThisMonth,

        materials_this_month:
          materialsThisMonth,

        materials_this_year:
          materialsThisYear,

        total_iec_downloads:
          totalIECDowloads,

        downloads_this_month:
          downloadsThisMonth,
      },

      materials: {
        total:
          totalMaterials,

        total_iec:
          totalIECMaterials,

        iec_this_month:
          iecMaterialsThisMonth,

        this_month:
          materialsThisMonth,

        this_year:
          materialsThisYear,

        total_iec_downloads:
          totalIECDowloads,

        downloads_this_month:
          downloadsThisMonth,

        by_type:
          materialTypeAnalytics,

        by_category:
          materialCategoryAnalytics,

        iec_by_category:
          iecCategoryAnalytics,

        by_format:
          materialFormatAnalytics,

        by_campus:
          materialCampusAnalytics,

        monthly_creation:
          iecMonthlyTrend,

        recent_iec_materials:
          recentIECMaterials,
      },

      demographics: {
        campus:
          campusAnalytics,

        course:
          courseAnalytics,

        year_level:
          yearLevelAnalytics,

        gender:
          genderAnalytics,

        age:
          ageAnalytics,

        pwd: {
          pwd:
            inclusionAnalytics.pwd,

          non_pwd:
            inclusionAnalytics.nonPwd,
        },

        ip: {
          ip:
            inclusionAnalytics.ip,

          non_ip:
            inclusionAnalytics.nonIp,
        },
      },

      programs:
        programAwarenessAnalytics,

      awareness: {
        overall_score: awarenessAnalytics.overall,
        total_scored_responses: awarenessAnalytics.totalResponses,
        by_year_level: awarenessAnalytics.byYearLevel,
        by_gender: awarenessAnalytics.byGender,
        by_pwd: awarenessAnalytics.byPwd,
        by_ip: awarenessAnalytics.byIp,
      },

      pre_post_comparison: prePostComparison,

      monthly_participation:
        monthlyParticipation,

      survey_response_data:
        filteredSurveyResponses,

      material_data:
        filteredMaterials,
    };

    const blob = new Blob(
      [
        JSON.stringify(
          report,
          null,
          2
        ),
      ],
      {
        type: "application/json",
      }
    );

    saveAs(
      blob,
      `OMSC_Guidance_Analytics_${new Date()
        .toISOString()
        .slice(0, 10)}.json`
    );
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />

        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
          Loading Guidance Analytics...
        </p>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />

                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600">
                  Guidance Management Analytics
                </span>
              </div>

              <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase text-slate-900">
                Analytics{" "}
                <span className="text-indigo-600">
                  Dashboard
                </span>
              </h1>

              <p className="mt-3 max-w-2xl text-xs md:text-sm font-medium text-slate-500 leading-relaxed">
                Administrative analytics for
                monitoring students, Guidance
                programs, surveys, and IEC
                materials.
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-12 rounded-xl px-5 bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest">
                  <Download className="w-4 h-4 mr-2" />
                  Generate Report
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-64 rounded-2xl p-2"
              >
                <DropdownMenuItem
                  onClick={exportToPDF}
                  className="rounded-xl p-3 cursor-pointer"
                >
                  <FileText className="w-5 h-5 mr-3 text-red-500" />

                  <div>
                    <p className="font-bold text-sm">
                      PDF Report
                    </p>

                    <p className="text-[9px] text-slate-400">
                      Printable analytics report
                    </p>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={exportToCSV}
                  className="rounded-xl p-3 cursor-pointer"
                >
                  <TableIcon className="w-5 h-5 mr-3 text-emerald-500" />

                  <div>
                    <p className="font-bold text-sm">
                      CSV Report
                    </p>

                    <p className="text-[9px] text-slate-400">
                      Excel / statistical analysis
                    </p>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={exportToJSON}
                  className="rounded-xl p-3 cursor-pointer"
                >
                  <FileJson className="w-5 h-5 mr-3 text-amber-500" />

                  <div>
                    <p className="font-bold text-sm">
                      JSON Dataset
                    </p>

                    <p className="text-[9px] text-slate-400">
                      Complete analytics dataset
                    </p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* =================================================
            FILTERS
        ================================================= */}

        <Card className="border-none shadow-sm rounded-[1.75rem] p-4 md:p-5 bg-white">

          <div className="flex items-center gap-2 mb-4">
            <Info className="w-4 h-4 text-indigo-600" />

            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              Analytics Filters
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

            {/* CAMPUS */}

            <Select
              value={selectedCampus}
              onValueChange={
                setSelectedCampus
              }
            >
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-none text-xs font-bold">
                <SelectValue placeholder="Campus" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  All Campuses
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

            {/* PROGRAM */}

            <Select
              value={selectedProgram}
              onValueChange={
                setSelectedProgram
              }
            >
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-none text-xs font-bold">
                <SelectValue placeholder="Program" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  All Programs
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

            {/* YEAR */}

            <Select
              value={selectedYearLevel}
              onValueChange={
                setSelectedYearLevel
              }
            >
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-none text-xs font-bold">
                <SelectValue placeholder="Year Level" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  All Year Levels
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

            {/* GENDER */}

            <Select
              value={selectedGender}
              onValueChange={
                setSelectedGender
              }
            >
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-none text-xs font-bold">
                <SelectValue placeholder="Gender" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  All Genders
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

            {/* YEAR */}

            <Select
              value={selectedAcademicYear}
              onValueChange={
                setSelectedAcademicYear
              }
            >
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-none text-xs font-bold">
                <SelectValue placeholder="Academic Year" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  All Years
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

          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedCampus("all");
                setSelectedProgram("all");
                setSelectedYearLevel("all");
                setSelectedGender("all");
                setSelectedAcademicYear("all");
              }}
              className="text-[9px] font-black uppercase tracking-widest text-slate-400"
            >
              Reset Filters
            </Button>
          </div>
        </Card>

        {/* =================================================
            GENERAL SUMMARY
        ================================================= */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <StatCard
            title="Students Covered"
            value={totalStudents}
            description="Profiles + survey participants"
            icon={Users}
          />

          <StatCard
            title="Guidance Programs"
            value={totalGuidancePrograms}
            description="Programs in the system"
            icon={GraduationCap}
          />

          <StatCard
            title="Survey Responses"
            value={totalSurveyResponses}
            description={`${activeSurveys} active survey(s)`}
            icon={BarChart3}
          />

          <StatCard
            title="Total Materials"
            value={totalMaterials}
            description="Materials in the library"
            icon={FileStack}
          />

        </div>

        {/* =================================================
            IEC MATERIAL SUMMARY
        ================================================= */}

        <div className="space-y-4">

          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />

              <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">
                IEC Materials Analytics
              </h2>
            </div>

            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Information, Education and Communication material dissemination
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

                    <span className="text-[8px] font-black uppercase tracking-widest bg-white/10 px-3 py-2 rounded-full">
                      Current Month
                    </span>
                  </div>

                  <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-100">
                    IEC Materials Created
                  </p>

                  <p className="mt-1 text-5xl font-black tracking-tighter">
                    {iecMaterialsThisMonth}
                  </p>

                  <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-indigo-100">
                    New IEC materials this month
                  </p>
                </div>

              </Card>
            </motion.div>

            <StatCard
              title="Total IEC Materials"
              value={totalIECMaterials}
              description="All IEC materials"
              icon={BookOpen}
            />

            <StatCard
              title="IEC Downloads"
              value={totalIECDowloads}
              description="Total material downloads"
              icon={Download}
            />

            <StatCard
              title="Downloads This Month"
              value={downloadsThisMonth}
              description="Downloads from monthly records"
              icon={TrendingUp}
            />

          </div>

        </div>

        {/* =================================================
            IEC CREATION TREND
        ================================================= */}

        <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">

            <div>
              <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-slate-800">
                IEC Material Creation Trend
              </h2>

              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                Number of IEC materials created per month — current year
              </p>
            </div>

            <div className="px-4 py-3 rounded-xl bg-indigo-50 text-indigo-700">
              <p className="text-[8px] uppercase font-black tracking-widest">
                This Month
              </p>

              <p className="text-xl font-black">
                {iecMaterialsThisMonth}
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
                  fontSize: 9,
                  fontWeight: 700,
                }}
              />

              <YAxis
                allowDecimals={false}
                tick={{
                  fontSize: 9,
                }}
              />

              <Tooltip />

              <Line
                type="monotone"
                dataKey="materials"
                name="IEC Materials"
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

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
                  IEC by Category
                </h2>

                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
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
                      fontSize: 8,
                      fontWeight: 700,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fontSize: 9,
                    }}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="count"
                    name="IEC Materials"
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

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Materials by Type
            </h2>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
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
            MATERIAL FORMAT + CAMPUS
        ================================================= */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* FORMAT */}

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Materials by Format
            </h2>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1 mb-5">
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
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{
                    fontSize: 9,
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

          {/* CAMPUS */}

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Material Distribution by Campus
            </h2>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
              Where materials are assigned or available
            </p>

            <div className="h-72 mt-4">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>

                  <Pie
                    data={
                      materialCampusAnalytics
                    }
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {materialCampusAnalytics.map(
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
            RECENT IEC MATERIALS
        ================================================= */}

        <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">

            <div>
              <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-slate-800">
                Recent IEC Materials
              </h2>

              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                Latest IEC materials added to the system
              </p>
            </div>

            <div className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase">
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

                        {normalize(
                          material.format
                        ) === "pdf" ? (
                          <FileText className="w-5 h-5" />
                        ) : normalize(
                            material.format
                          ) === "png" ||
                          normalize(
                            material.format
                          ) === "jpg" ||
                          normalize(
                            material.format
                          ) === "jpeg" ? (
                          <ImageIcon className="w-5 h-5" />
                        ) : normalize(
                            material.format
                          ) === "mp4" ? (
                          <Video className="w-5 h-5" />
                        ) : (
                          <File className="w-5 h-5" />
                        )}

                      </div>

                      <div className="min-w-0">

                        <p className="font-black text-sm text-slate-800 truncate">
                          {safeString(
                            material.title
                          ) ||
                            "Untitled Material"}
                        </p>

                        <div className="flex flex-wrap gap-2 mt-1">

                          <span className="text-[8px] font-black uppercase text-indigo-600">
                            {safeString(
                              material.category
                            ) ||
                              "Uncategorized"}
                          </span>

                          <span className="text-[8px] font-bold uppercase text-slate-400">
                            {safeString(
                              material.format
                            ) ||
                              "Unknown Format"}
                          </span>

                          <span className="text-[8px] font-bold uppercase text-slate-400">
                            {safeString(
                              material.campus
                            ) ||
                              "Universal"}
                          </span>

                        </div>

                      </div>

                    </div>

                    <div className="flex items-center gap-5 md:shrink-0">

                      <div className="text-right">
                        <p className="text-[8px] uppercase font-black text-slate-400">
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
                        <p className="text-[8px] uppercase font-black text-slate-400">
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

        {/* =================================================
            KNOWLEDGE AWARENESS
        ================================================= */}

        <div className="space-y-6">

          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-slate-800">
              Knowledge Awareness
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              title="Overall Average Score"
              value={
                awarenessAnalytics.overall !== null
                  ? `${awarenessAnalytics.overall}%`
                  : "No data"
              }
              description="Across all knowledge assessments"
              icon={Trophy}
            />

            <StatCard
              title="Scored Assessment Responses"
              value={awarenessAnalytics.totalResponses}
              description="Knowledge Assessment submissions counted"
              icon={Target}
            />
          </div>

          {/* PER PROGRAM */}
          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg md:text-xl font-black uppercase tracking-tight text-slate-800">
                  Awareness by Program
                </h3>

                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                  Average score on questions linked to each program
                </p>
              </div>

              <div className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase">
                {programAwarenessAnalytics.length} Programs With Data
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
                    tick={{ fontSize: 9, fontWeight: 700 }}
                  />

                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 9 }}
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
          </Card>

          {/* DEMOGRAPHIC BREAKDOWNS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { title: "By Year Level", data: awarenessAnalytics.byYearLevel },
              { title: "By Gender", data: awarenessAnalytics.byGender },
              { title: "By PWD Status", data: awarenessAnalytics.byPwd },
              { title: "By IP Status", data: awarenessAnalytics.byIp },
            ].map(({ title, data }) => (
              <Card
                key={title}
                className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white"
              >
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-1">
                  {title}
                </h3>

                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-5">
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
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* GUIDANCE SERVICE COVERAGE */}
          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-1">
              Guidance Service Coverage
            </h3>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-5">
              Program count and average awareness score per guidance service
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
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
                          <span className="text-indigo-600">{row.averageScore}%</span>
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

          {/* PRE-TEST / POST-TEST COMPARISON */}
          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 mb-1">
              Pre-Test vs Post-Test Comparison
            </h3>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-5">
              Average score gain for students who completed both a "(Pre-Test)" and
              "(Post-Test)" survey of the same topic
            </p>

            {prePostComparison.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-xs font-bold text-center px-6">
                No paired data yet. Create a survey titled "Topic (Pre-Test)" and
                another "Topic (Post-Test)" with the same wording to see the
                comparison here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="pb-3 pr-4">Topic</th>
                      <th className="pb-3 pr-4">Pre-Test Avg</th>
                      <th className="pb-3 pr-4">Post-Test Avg</th>
                      <th className="pb-3 pr-4">Avg. Gain</th>
                      <th className="pb-3 pr-4">Paired Students</th>
                      <th className="pb-3">Improved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prePostComparison.map((row) => (
                      <tr key={row.topic} className="border-b border-slate-50 last:border-none">
                        <td className="py-3 pr-4 text-xs font-bold text-slate-700">
                          {row.topic}
                        </td>
                        <td className="py-3 pr-4 text-xs font-black text-slate-500">
                          {row.preAvg !== null ? `${row.preAvg}%` : "—"}
                        </td>
                        <td className="py-3 pr-4 text-xs font-black text-slate-500">
                          {row.postAvg !== null ? `${row.postAvg}%` : "—"}
                        </td>
                        <td className="py-3 pr-4 text-xs font-black">
                          {row.avgGain !== null ? (
                            <span className={row.avgGain >= 0 ? "text-emerald-600" : "text-rose-500"}>
                              {row.avgGain >= 0 ? "+" : ""}
                              {row.avgGain}%
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">No pairs yet</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-xs font-black text-slate-900">
                          {row.pairedCount}
                        </td>
                        <td className="py-3 text-xs font-black text-slate-900">
                          {row.pairedCount > 0
                            ? `${row.improvedCount}/${row.pairedCount}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

        </div>

        {/* =================================================
            COURSE + YEAR LEVEL
        ================================================= */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Students by Course
            </h2>

            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 mb-5">
              Demographic distribution by academic program
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
                    fontSize: 9,
                  }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{
                    fontSize: 9,
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
                />
              </BarChart>
            </ResponsiveContainer>

          </Card>

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Students by Year Level
            </h2>

            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 mb-5">
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
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{
                    fontSize: 9,
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

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Gender Distribution
            </h2>

            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">
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

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Age Distribution
            </h2>

            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 mb-5">
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
                    fontSize: 8,
                    fontWeight: 700,
                  }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{
                    fontSize: 9,
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

          <Card className="border-none shadow-xl rounded-[2rem] p-6 bg-white">

            <div className="flex items-center gap-3">

              <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Accessibility className="w-5 h-5" />
              </div>

              <div>
                <h3 className="font-black uppercase text-slate-800">
                  PWD Representation
                </h3>

                <p className="text-[9px] uppercase font-bold text-slate-400">
                  Persons with Disabilities
                </p>
              </div>

            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">

              <div className="bg-blue-50 rounded-2xl p-4">
                <p className="text-[9px] uppercase font-black text-blue-500">
                  PWD
                </p>

                <p className="text-3xl font-black text-blue-700 mt-1">
                  {
                    inclusionAnalytics.pwd
                  }
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[9px] uppercase font-black text-slate-400">
                  Non-PWD
                </p>

                <p className="text-3xl font-black text-slate-700 mt-1">
                  {
                    inclusionAnalytics.nonPwd
                  }
                </p>
              </div>

            </div>

          </Card>

          <Card className="border-none shadow-xl rounded-[2rem] p-6 bg-white">

            <div className="flex items-center gap-3">

              <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Globe2 className="w-5 h-5" />
              </div>

              <div>
                <h3 className="font-black uppercase text-slate-800">
                  IP Representation
                </h3>

                <p className="text-[9px] uppercase font-bold text-slate-400">
                  Indigenous Peoples
                </p>
              </div>

            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">

              <div className="bg-emerald-50 rounded-2xl p-4">
                <p className="text-[9px] uppercase font-black text-emerald-500">
                  IP
                </p>

                <p className="text-3xl font-black text-emerald-700 mt-1">
                  {
                    inclusionAnalytics.ip
                  }
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[9px] uppercase font-black text-slate-400">
                  Non-IP
                </p>

                <p className="text-3xl font-black text-slate-700 mt-1">
                  {
                    inclusionAnalytics.nonIp
                  }
                </p>
              </div>

            </div>

          </Card>

        </div>

        {/* =================================================
            CAMPUS + PROGRAM TREND
        ================================================= */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Campus Distribution
            </h2>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
              Student distribution by campus
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

          <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
              Awareness Trend
            </h2>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
              Monthly knowledge survey awareness scores
            </p>

            <div className="h-72 mt-4">

              {monthlyParticipation.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold">
                  No awareness trend data available yet.
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={
                      monthlyParticipation
                    }
                  >

                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="month"
                      tick={{
                        fontSize: 9,
                      }}
                    />

                    <YAxis
                      allowDecimals={false}
                      tick={{
                        fontSize: 9,
                      }}
                    />

                    <Tooltip />

                    <Line
                      type="monotone"
                      dataKey="participants"
                      name="Awareness Score"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      dot={{
                        r: 4,
                      }}
                    />

                  </LineChart>
                </ResponsiveContainer>
              )}

            </div>

          </Card>

        </div>

        {/* =================================================
            SURVEY HUB
        ================================================= */}

        <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            <div className="flex items-start gap-3">

              <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>

              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
                  Survey & Program Awareness
                </h2>

                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                  Student evaluation and awareness dissemination
                </p>
              </div>

            </div>

            <div className="grid grid-cols-3 gap-3">

              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-[8px] uppercase font-black text-slate-400">
                  Surveys
                </p>

                <p className="text-xl font-black text-slate-800">
                  {surveys.length}
                </p>
              </div>

              <div className="bg-indigo-50 rounded-xl px-4 py-3">
                <p className="text-[8px] uppercase font-black text-indigo-400">
                  Participants
                </p>

                <p className="text-xl font-black text-indigo-700">
                  {
                    surveyParticipants
                  }
                </p>
              </div>

              <div className="bg-emerald-50 rounded-xl px-4 py-3">
                <p className="text-[8px] uppercase font-black text-emerald-400">
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

        {/* =================================================
            MATERIAL DATA SUMMARY
        ================================================= */}

        <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

          <div className="flex items-center gap-3 mb-5">

            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FileStack className="w-5 h-5" />
            </div>

            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">
                IEC Material Summary
              </h2>

              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                Material production and dissemination overview
              </p>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            <div className="rounded-2xl bg-indigo-50 p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400">
                Total IEC
              </p>

              <p className="mt-2 text-3xl font-black text-indigo-700">
                {totalIECMaterials}
              </p>

              <p className="mt-1 text-[9px] font-bold text-indigo-400 uppercase">
                All IEC materials
              </p>
            </div>

            <div className="rounded-2xl bg-emerald-50 p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                This Month
              </p>

              <p className="mt-2 text-3xl font-black text-emerald-700">
                {
                  iecMaterialsThisMonth
                }
              </p>

              <p className="mt-1 text-[9px] font-bold text-emerald-400 uppercase">
                New IEC materials
              </p>
            </div>

            <div className="rounded-2xl bg-purple-50 p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-purple-400">
                This Year
              </p>

              <p className="mt-2 text-3xl font-black text-purple-700">
                {materialsThisYear}
              </p>

              <p className="mt-1 text-[9px] font-bold text-purple-400 uppercase">
                Materials created
              </p>
            </div>

            <div className="rounded-2xl bg-orange-50 p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-orange-400">
                Downloads
              </p>

              <p className="mt-2 text-3xl font-black text-orange-700">
                {totalIECDowloads}
              </p>

              <p className="mt-1 text-[9px] font-bold text-orange-400 uppercase">
                Total IEC downloads
              </p>
            </div>

          </div>

          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">

            <div className="flex items-start gap-3">

              <Info className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />

              <div>

                <p className="text-xs font-black uppercase text-indigo-900">
                  IEC Material Production Analytics
                </p>

                <p className="mt-1 text-xs text-indigo-700 leading-relaxed">
                  The system automatically counts
                  IEC materials using the
                  <strong> material_type </strong>
                  field from the materials table.
                  Materials are considered newly
                  created this month when their
                  <strong> created_at </strong>
                  timestamp belongs to the current
                  month and year.
                </p>

              </div>

            </div>

          </div>

        </Card>

        {/* =================================================
            ADMIN FOOTER
        ================================================= */}

        <div className="bg-slate-900 rounded-[2rem] p-6 md:p-7 text-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">

            <div className="flex items-start gap-3">

              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>

              <div>

                <h3 className="text-sm font-black uppercase tracking-wide">
                  Administrative Analytics
                </h3>

                <p className="text-[10px] text-slate-400 mt-1 max-w-3xl leading-relaxed">
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
              className="h-10 rounded-xl text-indigo-300 hover:text-white hover:bg-white/10 text-[9px] font-black uppercase tracking-widest"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Data
            </Button>

          </div>

        </div>

      </div>
    </div>
  );
}