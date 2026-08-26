import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useToast } from "../../hooks/use-toast";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  FileDown,
  FileSpreadsheet,
  Loader2,
  BarChart3,
  Users,
  BookOpen,
  Layers,
  RefreshCw,
} from "lucide-react";

/* =========================================================
   TYPES
========================================================= */

interface Profile {
  id: string;
  student_id?: string | null;
  full_name?: string | null;
  campus?: string | null;
  program?: string | null;
  year_level?: string | number | null;
  age?: number | null;
  gender?: string | null;
  is_pwd?: boolean | null;
  is_ip?: boolean | null;
  created_at?: string | null;
}

interface GuidanceProgram {
  id: string | number;
  title?: string | null;
  name?: string | null;
  guidance_service?: string | null;
  program_component?: string | null;
  created_at?: string | null;
}

interface Survey {
  id: string | number;
  title: string;
  type?: "knowledge" | "opinion" | null;
  questions_data?: any[];
}

interface SurveyResponse {
  id: string | number;
  survey_id: string | number;
  user_id: string | number;
  percentage?: number | null;
  created_at?: string | null;
}

interface Material {
  id: string | number;
  title?: string | null;
  type?: string | null;
  category?: string | null;
  downloads?: number | null;
  created_at?: string | null;
}

interface UserBridge {
  id: string | number;
  student_id?: string | null;
}

const GUIDANCE_SERVICES = [
  "Information Services",
  "Individual Inventory",
  "Research and Evaluation",
  "Career Orientation",
  "Testing Services",
  "Counseling Services",
];

/* =========================================================
   HELPERS
========================================================= */

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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

function isWithinRange(dateStr: string | null | undefined, start: string, end: string): boolean {
  if (!start && !end) return true;
  if (!dateStr) return false;

  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return false;

  if (start && d < new Date(start).getTime()) return false;
  if (end && d > new Date(`${end}T23:59:59`).getTime()) return false;

  return true;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ReportsCenter() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [programs, setPrograms] = useState<GuidanceProgram[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponse[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [userBridge, setUserBridge] = useState<UserBridge[]>([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      setLoading(true);

      const [profilesRes, programsRes, surveysRes, responsesRes, materialsRes, usersRes] =
        await Promise.all([
          supabase.from("profiles").select("*"),
          supabase.from("programs").select("*"),
          supabase.from("surveys").select("*"),
          supabase.from("survey_responses").select("*"),
          supabase.from("materials").select("*"),
          supabase.from("users").select("id, student_id"),
        ]);

      if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
      if (programsRes.data) setPrograms(programsRes.data as GuidanceProgram[]);
      if (surveysRes.data) setSurveys(surveysRes.data as Survey[]);
      if (responsesRes.data) setSurveyResponses(responsesRes.data as SurveyResponse[]);
      if (materialsRes.data) setMaterials(materialsRes.data as Material[]);
      if (usersRes.data) setUserBridge(usersRes.data as UserBridge[]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to load report data",
        description: error?.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     DATE-RANGE FILTERED DATA
  ======================================================= */

  const filteredProfiles = useMemo(
    () => profiles.filter((p) => isWithinRange(p.created_at, startDate, endDate)),
    [profiles, startDate, endDate]
  );

  const filteredResponses = useMemo(
    () => surveyResponses.filter((r) => isWithinRange(r.created_at, startDate, endDate)),
    [surveyResponses, startDate, endDate]
  );

  const filteredMaterials = useMemo(
    () => materials.filter((m) => isWithinRange(m.created_at, startDate, endDate)),
    [materials, startDate, endDate]
  );

  /* =======================================================
     BRIDGE: survey_responses.user_id (bigint, users.id) ->
     users.student_id -> profiles.student_id
  ======================================================= */

  const userIdToStudentId = useMemo(() => {
    const map: Record<string, string> = {};
    userBridge.forEach((u) => {
      const studentId = safeString(u.student_id);
      if (studentId) map[safeString(u.id)] = studentId;
    });
    return map;
  }, [userBridge]);

  const scoredResponses = useMemo(() => {
    const surveysById: Record<string, Survey> = {};
    surveys.forEach((s) => {
      surveysById[safeString(s.id)] = s;
    });

    return filteredResponses.filter((r) => {
      const survey = surveysById[safeString(r.survey_id)];
      return survey?.type === "knowledge" && r.percentage !== null && r.percentage !== undefined;
    });
  }, [filteredResponses, surveys]);

  /* =======================================================
     SECTION 1 — PROGRAM AWARENESS SUMMARY
  ======================================================= */

  const programAwareness = useMemo(() => {
    const buckets: Record<string, number[]> = {};

    scoredResponses.forEach((response) => {
      const survey = surveys.find((s) => safeString(s.id) === safeString(response.survey_id));
      const questions = Array.isArray(survey?.questions_data) ? survey!.questions_data : [];

      questions.forEach((question: any) => {
        if (question?.type !== "mcq" || !question?.correct_option || !question?.related_program_id) {
          return;
        }

        const programId = safeString(question.related_program_id);
        // Awareness contribution is 100 if the response's overall
        // percentage reflects a correct answer set; simpler and more
        // transparent: use the response's own percentage as its
        // contribution to every program it references a question for.
        if (!buckets[programId]) buckets[programId] = [];
        buckets[programId].push(response.percentage || 0);
      });
    });

    return programs
      .map((program) => {
        const values = buckets[safeString(program.id)] || [];
        return {
          name: getProgramName(program),
          guidanceService: safeString(program.guidance_service) || "Not Categorized",
          averageScore: average(values),
          responseCount: values.length,
        };
      })
      .sort((a, b) => b.responseCount - a.responseCount);
  }, [programs, scoredResponses, surveys]);

  /* =======================================================
     SECTION 2 — DEMOGRAPHIC BREAKDOWN
  ======================================================= */

  const demographics = useMemo(() => {
    const groupBy = (keyFn: (p: Profile) => string) => {
      const counts: Record<string, number> = {};
      filteredProfiles.forEach((p) => {
        const key = keyFn(p);
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    const pwdCount = filteredProfiles.filter((p) => p.is_pwd === true).length;
    const ipCount = filteredProfiles.filter((p) => p.is_ip === true).length;

    return {
      total: filteredProfiles.length,
      byYearLevel: groupBy((p) => getYearLevel(p.year_level)),
      byGender: groupBy((p) => safeString(p.gender) || "Not Specified"),
      byAgeBand: groupBy((p) => getAgeGroup(p.age)),
      pwd: pwdCount,
      nonPwd: filteredProfiles.length - pwdCount,
      ip: ipCount,
      nonIp: filteredProfiles.length - ipCount,
    };
  }, [filteredProfiles]);

  /* =======================================================
     SECTION 3 — GUIDANCE SERVICE COVERAGE
  ======================================================= */

  const guidanceCoverage = useMemo(() => {
    const programCounts: Record<string, number> = {};
    programs.forEach((p) => {
      const service = safeString(p.guidance_service);
      if (service) programCounts[service] = (programCounts[service] || 0) + 1;
    });

    const serviceByProgramId: Record<string, string> = {};
    programs.forEach((p) => {
      const service = safeString(p.guidance_service);
      if (service) serviceByProgramId[safeString(p.id)] = service;
    });

    const scoreBuckets: Record<string, number[]> = {};
    scoredResponses.forEach((response) => {
      const survey = surveys.find((s) => safeString(s.id) === safeString(response.survey_id));
      const questions = Array.isArray(survey?.questions_data) ? survey!.questions_data : [];

      questions.forEach((question: any) => {
        if (question?.type !== "mcq" || !question?.correct_option || !question?.related_program_id) {
          return;
        }

        const service = serviceByProgramId[safeString(question.related_program_id)];
        if (!service) return;

        if (!scoreBuckets[service]) scoreBuckets[service] = [];
        scoreBuckets[service].push(response.percentage || 0);
      });
    });

    return GUIDANCE_SERVICES.map((service) => ({
      service,
      programCount: programCounts[service] || 0,
      averageScore: average(scoreBuckets[service] || []),
    }));
  }, [programs, scoredResponses, surveys]);

  /* =======================================================
     SECTION 4 — IEC MATERIAL REACH
  ======================================================= */

  const materialReach = useMemo(() => {
    const byCategory: Record<string, { count: number; downloads: number }> = {};

    filteredMaterials.forEach((m) => {
      const category = safeString(m.category) || "Uncategorized";
      if (!byCategory[category]) byCategory[category] = { count: 0, downloads: 0 };
      byCategory[category].count += 1;
      byCategory[category].downloads += m.downloads || 0;
    });

    return {
      totalMaterials: filteredMaterials.length,
      totalDownloads: filteredMaterials.reduce((sum, m) => sum + (m.downloads || 0), 0),
      byCategory: Object.entries(byCategory)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.count - a.count),
    };
  }, [filteredMaterials]);

  /* =======================================================
     REPORT META
  ======================================================= */

  const rangeLabel =
    startDate || endDate
      ? `${startDate || "Beginning"} to ${endDate || "Present"}`
      : "All-Time";

  const generatedAtLabel = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  /* =======================================================
     PDF EXPORT
  ======================================================= */

  function exportPDF() {
    setGenerating(true);

    try {
      const doc = new jsPDF() as any;

      const addHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(15);
        doc.text("OMSC GUIDANCE AND TESTING CENTER", 14, 18);

        doc.setFontSize(12);
        doc.text("Guidance Awareness & Analytics Report", 14, 26);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Report Period: ${rangeLabel}`, 14, 33);
        doc.text(`Generated: ${generatedAtLabel}`, 14, 38);
      };

      addHeader();

      let nextY = 46;

      // SECTION 1 — Program Awareness Summary
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text("Program Awareness Summary", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Program", "Guidance Service", "Avg. Score", "Responses"]],
        body: programAwareness.map((row) => [
          row.name,
          row.guidanceService,
          row.averageScore !== null ? `${row.averageScore}%` : "No data",
          row.responseCount,
        ]),
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + 12;

      // SECTION 2 — Demographic Breakdown
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Demographic Breakdown", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Dimension", "Segment", "Count"]],
        body: [
          ...demographics.byYearLevel.map((r) => ["Year Level", r.label, r.count]),
          ...demographics.byGender.map((r) => ["Gender", r.label, r.count]),
          ...demographics.byAgeBand.map((r) => ["Age Band", r.label, r.count]),
          ["PWD Status", "PWD", demographics.pwd],
          ["PWD Status", "Non-PWD", demographics.nonPwd],
          ["IP Status", "Indigenous Peoples", demographics.ip],
          ["IP Status", "Non-IP", demographics.nonIp],
        ],
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + 12;

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = 46;
      }

      // SECTION 3 — Guidance Service Coverage
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Guidance Service Coverage", 14, nextY);
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Guidance Service", "Programs", "Avg. Awareness Score"]],
        body: guidanceCoverage.map((row) => [
          row.service,
          row.programCount,
          row.averageScore !== null ? `${row.averageScore}%` : "No data",
        ]),
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8 },
      });
      nextY = (doc.lastAutoTable?.finalY || nextY) + 12;

      if (nextY > 250) {
        doc.addPage();
        addHeader();
        nextY = 46;
      }

      // SECTION 4 — IEC Material Reach
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(
        `IEC Material Reach (${materialReach.totalMaterials} materials, ${materialReach.totalDownloads} downloads)`,
        14,
        nextY
      );
      nextY += 6;

      autoTable(doc, {
        startY: nextY,
        head: [["Category", "Materials", "Downloads"]],
        body: materialReach.byCategory.map((row) => [row.category, row.count, row.downloads]),
        headStyles: { fillColor: [190, 24, 93], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8 },
      });

      doc.save(`OMSC_Guidance_Report_${new Date().toISOString().slice(0, 10)}.pdf`);

      toast({ title: "Report Generated", description: "Your PDF report has downloaded." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "PDF Generation Failed",
        description: error?.message || "Please try again.",
      });
    } finally {
      setGenerating(false);
    }
  }

  /* =======================================================
     EXCEL EXPORT
  ======================================================= */

  function exportExcel() {
    setGenerating(true);

    try {
      const workbook = XLSX.utils.book_new();

      const coverSheet = XLSX.utils.aoa_to_sheet([
        ["OMSC GUIDANCE AND TESTING CENTER"],
        ["Guidance Awareness & Analytics Report"],
        [`Report Period: ${rangeLabel}`],
        [`Generated: ${generatedAtLabel}`],
      ]);
      XLSX.utils.book_append_sheet(workbook, coverSheet, "Report Info");

      const programSheet = XLSX.utils.json_to_sheet(
        programAwareness.map((row) => ({
          Program: row.name,
          "Guidance Service": row.guidanceService,
          "Avg. Score (%)": row.averageScore ?? "No data",
          Responses: row.responseCount,
        }))
      );
      XLSX.utils.book_append_sheet(workbook, programSheet, "Program Awareness");

      const demographicRows = [
        ...demographics.byYearLevel.map((r) => ({ Dimension: "Year Level", Segment: r.label, Count: r.count })),
        ...demographics.byGender.map((r) => ({ Dimension: "Gender", Segment: r.label, Count: r.count })),
        ...demographics.byAgeBand.map((r) => ({ Dimension: "Age Band", Segment: r.label, Count: r.count })),
        { Dimension: "PWD Status", Segment: "PWD", Count: demographics.pwd },
        { Dimension: "PWD Status", Segment: "Non-PWD", Count: demographics.nonPwd },
        { Dimension: "IP Status", Segment: "Indigenous Peoples", Count: demographics.ip },
        { Dimension: "IP Status", Segment: "Non-IP", Count: demographics.nonIp },
      ];
      const demographicSheet = XLSX.utils.json_to_sheet(demographicRows);
      XLSX.utils.book_append_sheet(workbook, demographicSheet, "Demographics");

      const coverageSheet = XLSX.utils.json_to_sheet(
        guidanceCoverage.map((row) => ({
          "Guidance Service": row.service,
          Programs: row.programCount,
          "Avg. Awareness Score (%)": row.averageScore ?? "No data",
        }))
      );
      XLSX.utils.book_append_sheet(workbook, coverageSheet, "Guidance Coverage");

      const materialSheet = XLSX.utils.json_to_sheet(
        materialReach.byCategory.map((row) => ({
          Category: row.category,
          Materials: row.count,
          Downloads: row.downloads,
        }))
      );
      XLSX.utils.book_append_sheet(workbook, materialSheet, "IEC Material Reach");

      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buffer], { type: "application/octet-stream" });

      saveAs(blob, `OMSC_Guidance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

      toast({ title: "Report Generated", description: "Your Excel report has downloaded." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Excel Generation Failed",
        description: error?.message || "Please try again.",
      });
    } finally {
      setGenerating(false);
    }
  }

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">
          Loading Report Data
        </p>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="space-y-6 md:space-y-8 p-2">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase">
            Reports <span className="text-indigo-600">Center</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest mt-1">
            OMSC Guidance and Testing Center — generated reports
          </p>
        </div>

        <Button
          variant="outline"
          onClick={fetchAll}
          className="rounded-xl font-black uppercase text-[10px] gap-2 h-11"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Data
        </Button>
      </div>

      {/* DATE RANGE + EXPORT ACTIONS */}
      <Card className="p-5 md:p-7 rounded-[2rem] border-none shadow-sm bg-white">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                From
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 rounded-xl bg-slate-50 border-none font-bold text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                To
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 rounded-xl bg-slate-50 border-none font-bold text-xs"
              />
            </div>
          </div>

          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Report Period: <span className="text-slate-700">{rangeLabel}</span>
          </p>

          <div className="flex gap-3 w-full lg:w-auto">
            <Button
              onClick={exportPDF}
              disabled={generating}
              className="flex-1 lg:flex-none h-12 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-xs gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Export PDF
            </Button>
            <Button
              onClick={exportExcel}
              disabled={generating}
              className="flex-1 lg:flex-none h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Export Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* SECTION PREVIEWS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PROGRAM AWARENESS */}
        <Card className="p-5 md:p-7 rounded-[2rem] border-none shadow-sm bg-white">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
              Program Awareness Summary
            </h3>
          </div>
          <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-5">
            Average knowledge score per program
          </p>

          {programAwareness.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-xs font-bold">
              No programs found.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {programAwareness.map((row) => (
                <div key={row.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 truncate">{row.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{row.guidanceService}</p>
                  </div>
                  <span className="text-sm font-black text-indigo-600 shrink-0 ml-3">
                    {row.averageScore !== null ? `${row.averageScore}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* DEMOGRAPHICS */}
        <Card className="p-5 md:p-7 rounded-[2rem] border-none shadow-sm bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
              Demographic Breakdown
            </h3>
          </div>
          <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-5">
            {demographics.total} students in range
          </p>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50">
              <p className="text-lg font-black text-slate-800">{demographics.pwd}</p>
              <p className="text-[8px] font-black uppercase text-slate-400">PWD</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <p className="text-lg font-black text-slate-800">{demographics.ip}</p>
              <p className="text-[8px] font-black uppercase text-slate-400">Indigenous Peoples</p>
            </div>
          </div>

          <div className="mt-4 space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {demographics.byYearLevel.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500">{row.label}</span>
                <span className="font-black text-slate-800">{row.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* GUIDANCE SERVICE COVERAGE */}
        <Card className="p-5 md:p-7 rounded-[2rem] border-none shadow-sm bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
              Guidance Service Coverage
            </h3>
          </div>
          <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-5">
            Program count and awareness score per service
          </p>

          <div className="space-y-2">
            {guidanceCoverage.map((row) => (
              <div key={row.service} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <p className="text-xs font-black text-slate-700">{row.service}</p>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-bold text-slate-400">{row.programCount} programs</span>
                  <span className="text-sm font-black text-amber-600">
                    {row.averageScore !== null ? `${row.averageScore}%` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* IEC MATERIAL REACH */}
        <Card className="p-5 md:p-7 rounded-[2rem] border-none shadow-sm bg-white">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
              IEC Material Reach
            </h3>
          </div>
          <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-5">
            {materialReach.totalMaterials} materials · {materialReach.totalDownloads} downloads
          </p>

          {materialReach.byCategory.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-xs font-bold">
              No materials found.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {materialReach.byCategory.map((row) => (
                <div key={row.category} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <p className="text-xs font-black text-slate-700 truncate">{row.category}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] font-bold text-slate-400">{row.count} items</span>
                    <span className="text-sm font-black text-rose-600">{row.downloads} dl</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
