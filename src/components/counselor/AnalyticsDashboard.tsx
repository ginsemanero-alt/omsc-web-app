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
import "jspdf-autotable";
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
}

interface Registration {
  id?: string | number;
  user_id?: string | null;
  student_id?: string | null;
  program_id?: string | number | null;
  program?: string | null;
  created_at?: string | null;
  status?: string | null;
}

interface Survey {
  id: string | number;
  title: string;
  status?: string | null;
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
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<
    SurveyResponse[]
  >([]);

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
        registrationsResult,
        surveysResult,
        responsesResult,
        materialsResult,
      ] = await Promise.all([
        supabase.from("profiles").select("*"),

        supabase
          .from("programs")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("program_registrations")
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
      ]);

      if (profilesResult.error) {
        console.error("Profiles:", profilesResult.error);
      }

      if (programsResult.error) {
        console.error("Programs:", programsResult.error);
      }

      if (registrationsResult.error) {
        console.error("Registrations:", registrationsResult.error);
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

      setProfiles((profilesResult.data || []) as Profile[]);
      setPrograms((programsResult.data || []) as GuidanceProgram[]);
      setRegistrations(
        (registrationsResult.data || []) as Registration[]
      );
      setSurveys((surveysResult.data || []) as Survey[]);
      setSurveyResponses(
        (responsesResult.data || []) as SurveyResponse[]
      );

      setMaterials((materialsResult.data || []) as Material[]);
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

    registrations.forEach((r) => {
      if (!r.created_at) return;

      const year = new Date(r.created_at).getFullYear();

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
    registrations,
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
     FILTERED USER IDS
  ======================================================= */

  const filteredUserIds = useMemo(() => {
    return new Set(
      filteredProfiles
        .map((p) => safeString(p.id))
        .filter(Boolean)
    );
  }, [filteredProfiles]);

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
     REGISTRATIONS
  ======================================================= */

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((registration) => {
      const userId = safeString(registration.user_id);
      const studentId = safeString(
        registration.student_id
      );

      if (!hasActiveFilters) {
        return true;
      }

      if (userId && filteredUserIds.has(userId)) {
        return true;
      }

      if (
        studentId &&
        filteredStudentIds.has(studentId)
      ) {
        return true;
      }

      return false;
    });
  }, [
    registrations,
    filteredUserIds,
    filteredStudentIds,
    hasActiveFilters,
  ]);

  /* =======================================================
     SURVEY RESPONSES
  ======================================================= */

  const filteredSurveyResponses = useMemo(() => {
    return surveyResponses.filter((response) => {
      const userId = safeString(response.user_id);
      const studentId = safeString(
        response.student_id
      );

      if (!hasActiveFilters) {
        return true;
      }

      if (userId && filteredUserIds.has(userId)) {
        return true;
      }

      if (
        studentId &&
        filteredStudentIds.has(studentId)
      ) {
        return true;
      }

      return false;
    });
  }, [
    surveyResponses,
    filteredUserIds,
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

    filteredRegistrations.forEach(
      (registration) => {
        addParticipant(
          registration.user_id,
          registration.student_id
        );
      }
    );

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
    filteredRegistrations,
    filteredSurveyResponses,
  ]);

  /* =======================================================
     PROGRAM PARTICIPANTS
  ======================================================= */

  const programParticipants = useMemo(() => {
    const participants = new Set<string>();

    filteredRegistrations.forEach(
      (registration) => {
        const userId = normalize(
          registration.user_id
        );

        const studentId = normalize(
          registration.student_id
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
  }, [filteredRegistrations]);

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
     PROGRAM ANALYTICS
  ======================================================= */

  const programAnalytics = useMemo(() => {
    const countsById: Record<
      string,
      number
    > = {};

    const countsByName: Record<
      string,
      number
    > = {};

    programs.forEach((program) => {
      countsById[String(program.id)] = 0;

      const name = getProgramName(program);

      countsByName[normalize(name)] = 0;
    });

    filteredRegistrations.forEach(
      (registration) => {
        if (
          registration.program_id !==
            null &&
          registration.program_id !==
            undefined
        ) {
          const key = String(
            registration.program_id
          );

          countsById[key] =
            (countsById[key] || 0) + 1;
        }

        if (registration.program) {
          const key = normalize(
            registration.program
          );

          countsByName[key] =
            (countsByName[key] || 0) + 1;
        }
      }
    );

    const rows = programs.map((program) => {
      const programId = String(program.id);

      const name = getProgramName(program);

      const registrationCount =
        countsById[programId] > 0
          ? countsById[programId]
          : countsByName[normalize(name)] || 0;

      return {
        name,
        registrations: registrationCount,
        category:
          safeString(program.category) ||
          "Guidance Program",
      };
    });

    filteredRegistrations.forEach(
      (registration) => {
        if (!registration.program) return;

        const registrationName =
          safeString(registration.program);

        const alreadyExists = rows.some(
          (row) =>
            normalize(row.name) ===
            normalize(registrationName)
        );

        if (!alreadyExists) {
          rows.push({
            name: registrationName,
            registrations:
              countsByName[
                normalize(registrationName)
              ] || 0,
            category: "Guidance Program",
          });
        }
      }
    );

    return rows
      .filter(
        (row) => row.registrations > 0
      )
      .sort(
        (a, b) =>
          b.registrations -
          a.registrations
      )
      .slice(0, 12);
  }, [
    programs,
    filteredRegistrations,
  ]);

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
  ======================================================= */

  const monthlyParticipation =
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
          participants: 0,
        })
      );

      filteredRegistrations.forEach(
        (registration) => {
          if (!registration.created_at)
            return;

          const date = new Date(
            registration.created_at
          );

          if (
            !Number.isNaN(
              date.getTime()
            )
          ) {
            data[
              date.getMonth()
            ].participants += 1;
          }
        }
      );

      return data;
    }, [filteredRegistrations]);

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

  const totalProgramParticipants =
    filteredRegistrations.length;

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
        "Unique Program Participants",
        programParticipants,
      ],

      [
        "Program Registrations",
        totalProgramParticipants,
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

    doc.autoTable({
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

    doc.autoTable({
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

    doc.autoTable({
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

    /* PROGRAM */

    rows.push([
      "PROGRAM",
      "CATEGORY",
      "REGISTRATIONS",
    ]);

    programAnalytics.forEach(
      (row) => {
        rows.push([
          row.name,
          row.category,
          row.registrations,
        ]);
      }
    );

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

        unique_program_participants:
          programParticipants,

        program_registrations:
          totalProgramParticipants,

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
        programAnalytics,

      monthly_participation:
        monthlyParticipation,

      program_registration_data:
        filteredRegistrations,

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

              <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase italic text-slate-900">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

          <StatCard
            title="Students Covered"
            value={totalStudents}
            description="Profiles + program + survey participants"
            icon={Users}
          />

          <StatCard
            title="Program Participants"
            value={programParticipants}
            description="Unique registered students"
            icon={ClipboardList}
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
            PROGRAM ANALYTICS
        ================================================= */}

        <Card className="border-none shadow-xl rounded-[2rem] p-5 md:p-7 bg-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">

            <div>
              <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-slate-800">
                Guidance Program Participation
              </h2>

              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                Analytics per program based on actual registrations
              </p>
            </div>

            <div className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase">
              {programAnalytics.length} Programs Displayed
            </div>

          </div>

          {programAnalytics.length ===
          0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs font-bold">
              No program participation data available.
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={350}
            >
              <BarChart
                data={programAnalytics}
                margin={{
                  top: 10,
                  right: 10,
                  left: 0,
                  bottom: 60,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  height={90}
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
                  dataKey="registrations"
                  name="Registrations"
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
              Program Participation Trend
            </h2>

            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">
              Monthly Guidance program registrations
            </p>

            <div className="h-72 mt-4">

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
                    name="Registrations"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                    }}
                  />

                </LineChart>
              </ResponsiveContainer>

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
                  program registrations,
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