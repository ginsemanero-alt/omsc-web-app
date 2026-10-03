import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Info,
  CheckCircle2,
  MinusCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import {
  AGE_BRACKETS,
  SMALL_SAMPLE_N,
  T_TEST_CAUTION_N,
  emptyRow,
  formatPValue,
  normalizedGainLevel,
  pairedTTest,
  yearLevelLabel,
  type LearningGainDimension,
  type LearningGainOptions,
  type LearningGainRow,
  type LearningGainSummary,
} from "../../lib/learningGain";

/* =========================================================
   LEARNING GAIN (pre-test vs post-test)

   Alvarez: "Provide data analytics for the result of intervention
   (developed learning awareness) — for gender, age, course." Year
   level, PWD, and IP were asked for by the other panelists.

   One-group pretest-posttest: every figure here counts PAIRED
   students only (both a pre-test and a post-test on the same
   program's knowledge assessment). Pre-test-only students are shown
   separately as "incomplete" for attrition. All aggregation runs in
   SQL — learning_gain_summary() (PHASE 23 in supabase/migrations.sql);
   this component only renders the per-group rows it returns and
   computes the paired t-test from their mean/SD of differences.
========================================================= */

// Validated with the dataviz palette checks (colorblind separation
// and contrast on white): cyan = before, indigo = after.
const PRE_COLOR = "#C7C9F2";
const POST_COLOR = "#4F46E5";
const GAIN_UP_COLOR = "#4F46E5";
const GAIN_DOWN_COLOR = "#ea580c";

type BreakdownDimension = Exclude<LearningGainDimension, "program" | "overall">;

const BREAKDOWNS: { id: BreakdownDimension; label: string }[] = [
  { id: "course", label: "Course" },
  { id: "gender", label: "Gender" },
  { id: "age_bracket", label: "Age" },
  { id: "year_level", label: "Year level" },
  { id: "pwd", label: "PWD status" },
  { id: "ip", label: "IP status" },
];

interface Filters {
  programId: string;
  course: string;
  yearLevel: string;
  gender: string;
  ageBracket: string;
  academicYear: string;
}

const ALL = "all";

const DEFAULT_FILTERS: Filters = {
  programId: ALL,
  course: ALL,
  yearLevel: ALL,
  gender: ALL,
  ageBracket: ALL,
  academicYear: ALL,
};

const EMPTY_OPTIONS: LearningGainOptions = {
  programs: [],
  courses: [],
  year_levels: [],
  genders: [],
  years: [],
};

// A display row: the SQL aggregate plus its label and t-test.
interface DisplayRow extends LearningGainRow {
  label: string;
}

function fmtPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function fmtGain(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} pts`;
}

function fmtG(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(raw: any): LearningGainRow {
  return {
    dimension: raw.dimension,
    key: String(raw.key),
    paired_n: Number(raw.paired_n) || 0,
    incomplete_n: Number(raw.incomplete_n) || 0,
    ceiling_n: Number(raw.ceiling_n) || 0,
    viewed_before_pre_n: Number(raw.viewed_before_pre_n) || 0,
    mean_pre: asNumber(raw.mean_pre),
    mean_post: asNumber(raw.mean_post),
    mean_gain: asNumber(raw.mean_gain),
    sd_diff: asNumber(raw.sd_diff),
    norm_gain: asNumber(raw.norm_gain),
  };
}

function groupLabel(dimension: BreakdownDimension, key: string): string {
  return dimension === "year_level" ? yearLevelLabel(key) : key;
}

export default function LearningGainSection() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [breakdown, setBreakdown] = useState<BreakdownDimension>("course");

  const [summary, setSummary] = useState<LearningGainSummary>({
    rows: [],
    options: EMPTY_OPTIONS,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase.rpc("learning_gain_summary", {
      p_program_id: filters.programId === ALL ? null : Number(filters.programId),
      p_course: filters.course === ALL ? null : filters.course,
      p_year_level: filters.yearLevel === ALL ? null : filters.yearLevel,
      p_gender: filters.gender === ALL ? null : filters.gender,
      p_age_bracket: filters.ageBracket === ALL ? null : filters.ageBracket,
      p_academic_year: filters.academicYear === ALL ? null : Number(filters.academicYear),
      p_age_brackets: AGE_BRACKETS,
    });

    if (error) {
      console.error("Learning gain:", error);
      // PGRST202 = function not found — the PHASE 22–23 migration
      // hasn't been run on this database yet.
      setLoadError(
        error.code === "PGRST202"
          ? "The Learning Gain function isn't installed yet. Run PHASE 22 and PHASE 23 of supabase/migrations.sql in the Supabase SQL Editor."
          : error.message || "Unable to load learning gain data."
      );
      setLoading(false);
      return;
    }

    const payload = (data || {}) as any;
    setSummary({
      rows: Array.isArray(payload.rows) ? payload.rows.map(normalizeRow) : [],
      options: {
        programs: payload.options?.programs || [],
        courses: payload.options?.courses || [],
        year_levels: payload.options?.year_levels || [],
        genders: payload.options?.genders || [],
        years: payload.options?.years || [],
      },
    });
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const setFilter = (field: keyof Filters) => (value: string) =>
    setFilters((previous) => ({ ...previous, [field]: value }));

  const filtersActive = Object.values(filters).some((value) => value !== ALL);

  /* ---------------------------------------------------------
     DERIVED ROWS
  --------------------------------------------------------- */

  const overall: LearningGainRow = useMemo(
    () =>
      summary.rows.find((row) => row.dimension === "overall") ||
      emptyRow("overall", "All"),
    [summary.rows]
  );

  // Every program that has a linked knowledge assessment gets a row,
  // zeros included, so the table never collapses to nothing.
  const programRows: DisplayRow[] = useMemo(() => {
    const byKey = new Map(
      summary.rows
        .filter((row) => row.dimension === "program")
        .map((row) => [row.key, row])
    );

    return summary.options.programs
      .filter(
        (program) =>
          filters.programId === ALL || String(program.id) === filters.programId
      )
      .map((program) => ({
        ...(byKey.get(String(program.id)) || emptyRow("program", String(program.id))),
        label: program.title,
      }));
  }, [summary, filters.programId]);

  const breakdownRows: DisplayRow[] = useMemo(() => {
    const byKey = new Map(
      summary.rows
        .filter((row) => row.dimension === breakdown)
        .map((row) => [row.key, row])
    );

    // The groups that should always appear, even at zero.
    let expected: string[];
    switch (breakdown) {
      case "age_bracket":
        expected = AGE_BRACKETS.map((bracket) => bracket.label);
        break;
      case "pwd":
        expected = ["PWD", "Non-PWD"];
        break;
      case "ip":
        expected = ["IP", "Non-IP"];
        break;
      case "gender":
        expected = summary.options.genders;
        break;
      case "year_level":
        expected = summary.options.year_levels;
        break;
      default:
        expected = summary.options.courses;
    }

    const keys = [...new Set([...expected, ...byKey.keys()])];

    const rows = keys.map((key) => ({
      ...(byKey.get(key) || emptyRow(breakdown, key)),
      label: groupLabel(breakdown, key),
    }));

    // Age and year level keep their natural order; the rest go
    // largest group first. "Not specified" / "Outside brackets" last.
    const trailing = (key: string) =>
      key === "Not specified" || key === "Outside brackets" ? 1 : 0;

    if (breakdown === "age_bracket") {
      const order = AGE_BRACKETS.map((bracket) => bracket.label);
      return rows.sort(
        (a, b) =>
          trailing(a.key) - trailing(b.key) ||
          order.indexOf(a.key) - order.indexOf(b.key)
      );
    }

    if (breakdown === "year_level") {
      return rows.sort(
        (a, b) => trailing(a.key) - trailing(b.key) || a.key.localeCompare(b.key, undefined, { numeric: true })
      );
    }

    return rows.sort(
      (a, b) =>
        trailing(a.key) - trailing(b.key) ||
        b.paired_n - a.paired_n ||
        a.label.localeCompare(b.label)
    );
  }, [summary, breakdown]);

  const programChartData = programRows
    .filter((row) => row.paired_n > 0)
    .map((row) => ({
      name: row.label,
      pre: row.mean_pre,
      post: row.mean_post,
      n: row.paired_n,
    }));

  const gainChartData = breakdownRows
    .filter((row) => row.paired_n > 0 && row.mean_gain !== null)
    .map((row) => ({
      name: row.label,
      gain: row.mean_gain as number,
      n: row.paired_n,
    }));

  const overallTest = pairedTTest(overall.paired_n, overall.mean_gain, overall.sd_diff);
  const overallLevel = normalizedGainLevel(overall.norm_gain);
  const attempted = overall.paired_n + overall.incomplete_n;
  const attritionPct = attempted > 0 ? (overall.incomplete_n / attempted) * 100 : 0;
  const breakdownLabel =
    BREAKDOWNS.find((item) => item.id === breakdown)?.label || "Group";

  return (
    <div className="flex flex-col gap-5 font-figtree text-[#1E293B]">

      {/* FILTERS — all six combine (AND) inside the SQL function. */}
      <Card className="border-none shadow-none rounded-[28px] px-5 py-5 md:px-6 bg-white flex flex-col gap-3.5">
        <h2 className="sr-only">Learning gain filters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <FilterSelect
            label="Program"
            value={filters.programId}
            onChange={setFilter("programId")}
            allLabel="All programs"
            options={summary.options.programs.map((program) => ({
              value: String(program.id),
              label: program.title,
            }))}
          />
          <FilterSelect
            label="Course"
            value={filters.course}
            onChange={setFilter("course")}
            allLabel="All courses"
            options={[...summary.options.courses].sort().map((course) => ({
              value: course,
              label: course,
            }))}
          />
          <FilterSelect
            label="Year level"
            value={filters.yearLevel}
            onChange={setFilter("yearLevel")}
            allLabel="All year levels"
            options={[...summary.options.year_levels]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              .map((level) => ({ value: level, label: yearLevelLabel(level) }))}
          />
          <FilterSelect
            label="Gender"
            value={filters.gender}
            onChange={setFilter("gender")}
            allLabel="All genders"
            options={[...summary.options.genders].sort().map((gender) => ({
              value: gender,
              label: gender,
            }))}
          />
          <FilterSelect
            label="Age"
            value={filters.ageBracket}
            onChange={setFilter("ageBracket")}
            allLabel="All ages"
            options={AGE_BRACKETS.map((bracket) => ({
              value: bracket.label,
              label: bracket.label,
            }))}
          />
          <FilterSelect
            label="Academic year"
            value={filters.academicYear}
            onChange={setFilter("academicYear")}
            allLabel="All years"
            options={[...summary.options.years]
              .sort((a, b) => b - a)
              .map((year) => ({ value: String(year), label: String(year) }))}
          />
        </div>

        {filtersActive && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="h-11 px-3.5 rounded-xl font-bold text-sm text-[#4338CA] hover:bg-[#EEF0FA] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
            >
              Reset filters
            </button>
          </div>
        )}
      </Card>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="m-0 font-bold text-lg text-[#1E1B4B]">
              Learning gain
            </h2>
            <p className="m-0 text-sm text-[#5B6477] mt-1">
              Pre-test vs post-test · paired students only · test accounts excluded
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={fetchSummary}
          disabled={loading}
          className="h-11 px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] text-sm font-bold gap-2 self-start md:self-auto hover:border-[#A5B4FC]"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </Button>
      </div>


      {loadError ? (
        <Card className="border-none shadow-none rounded-[32px] p-8 md:p-10 bg-white">
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-rose-500" />
            </div>
            <p className="text-sm font-bold text-[#1E1B4B]">
              Learning gain unavailable
            </p>
            <p className="text-xs font-medium text-slate-500 max-w-lg leading-relaxed">
              {loadError}
            </p>
            <Button
              type="button"
              onClick={fetchSummary}
              className="mt-2 h-10 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-[13px] font-semibold"
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ?"opacity-60" : ""}`}>

          {/* SUMMARY — same numbers as before, new layout. */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-3.5">
            <div className="px-[22px] py-5 rounded-[26px] bg-white flex flex-col gap-1 min-w-0">
              <span className="text-[13px] font-semibold text-[#5B6477]">Students with both tests</span>
              <span className="font-bricolage font-extrabold text-[36px] leading-tight text-[#1E1B4B]">{overall.paired_n}</span>
              {overall.paired_n > 0 && overall.paired_n < SMALL_SAMPLE_N && (
                <span className="self-start"><SmallSampleBadge /></span>
              )}
            </div>
            <div className="px-[22px] py-5 rounded-[26px] bg-white flex flex-col gap-1 min-w-0">
              <span className="text-[13px] font-semibold text-[#5B6477]">Mean pre-test</span>
              <span className="font-bricolage font-extrabold text-[36px] leading-tight text-[#1E1B4B]">{fmtPct(overall.mean_pre)}</span>
            </div>
            <div className="px-[22px] py-5 rounded-[26px] bg-white flex flex-col gap-1 min-w-0">
              <span className="text-[13px] font-semibold text-[#5B6477]">Mean post-test</span>
              <span className="font-bricolage font-extrabold text-[36px] leading-tight text-[#1E1B4B]">{fmtPct(overall.mean_post)}</span>
            </div>
            <div className="px-[22px] py-5 rounded-[26px] bg-[#D1FAE5] flex flex-col gap-1 min-w-0">
              <span className="text-[13px] font-semibold text-[#065F46]">Mean gain</span>
              <span className="font-bricolage font-extrabold text-[36px] leading-tight text-[#065F46]">{fmtGain(overall.mean_gain)}</span>
              <span className="text-xs text-[#065F46]">
                {overall.paired_n > 0 && overall.norm_gain === null
                  ? "Normalized gain: pre-test mean is 100%, no room to gain"
                  : `Normalized gain ${fmtG(overall.norm_gain)}`}
              </span>
              {overallLevel && <span className="self-start mt-1"><GainLevelBadge level={overallLevel} /></span>}
            </div>
            <div className="col-span-2 lg:col-span-1 px-[22px] py-5 rounded-[26px] bg-[#1E1B4B] text-white flex flex-col gap-1 min-w-0">
              <span className="text-[13px] font-semibold text-[#FBBF24]">Paired t-test</span>
              <span className="font-bricolage font-extrabold text-[28px] leading-tight">
                {overallTest
                  ? overallTest.p < 0.001
                    ? "p < .001"
                    : `p = ${formatPValue(overallTest.p)}`
                  : "Not enough data"}
              </span>
              <span className="text-xs text-[#C7C9F2]">
                {overallTest
                  ? `t(${overallTest.df}) = ${overallTest.t.toFixed(2)} · ${overallTest.significant ? "Significant at 0.05" : "Not significant at 0.05"}`
                  : "Needs at least 2 paired students with differing gains"}
              </span>
              {overall.paired_n > 0 && overall.paired_n < T_TEST_CAUTION_N && (
                <span className="self-start mt-1"><CautionBadge compact /></span>
              )}
            </div>
          </div>

          {/* WHO IS COUNTED + how to read the t-test */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
            <div className="px-6 py-6 md:px-7 rounded-[32px] bg-white flex flex-col gap-3.5">
              <h3 className="m-0 font-bold text-lg text-[#1E1B4B]">Who is counted</h3>
              <div className="flex justify-between gap-3 px-4 py-3 rounded-2xl bg-[#F5F6FB]">
                <span className="text-sm text-[#334155]">Pre-test and post-test (counted)</span>
                <span className="font-extrabold text-[#1E1B4B]">{overall.paired_n}</span>
              </div>
              <div className="flex justify-between gap-3 px-4 py-3 rounded-2xl bg-[#F5F6FB]">
                <span className="text-sm text-[#334155]">
                  Pre-test only (not yet finished)
                  {attempted > 0 && <span className="text-[#5B6477]"> · {attritionPct.toFixed(1)}% attrition</span>}
                </span>
                <span className="font-extrabold text-[#1E1B4B]">{overall.incomplete_n}</span>
              </div>
              <div className="flex justify-between gap-3 px-4 py-3 rounded-2xl bg-[#F5F6FB]">
                <span className="text-sm text-[#334155]">
                  Viewed materials before the pre-test (not counted)
                </span>
                <span className="font-extrabold text-[#1E1B4B]">{overall.viewed_before_pre_n}</span>
              </div>
              <p className="m-0 text-[13px] text-[#5B6477]">
                Test accounts are excluded. A pre-test taken after opening the program's materials
                isn't a true starting point, so those students are left out of the gain.
              </p>
            </div>
            <div className="px-6 py-6 md:px-7 rounded-[32px] bg-white flex flex-col gap-2">
              <h3 className="m-0 font-bold text-lg text-[#1E1B4B]">How to read the t-test</h3>
              <p className="m-0 text-sm leading-relaxed text-[#334155]">
                p &lt; 0.05 means the pre-test to post-test difference is statistically
                significant (unlikely to be due to chance). With fewer than {T_TEST_CAUTION_N}{" "}
                paired students, read the result with caution: the t-test assumes the score
                differences are roughly normal, which a small group can't show. Needs at least 2
                paired students with differing gains. Normalized gain is (post − pre) ÷ (100 − pre).
              </p>
            </div>
          </div>

          {/* PRE VS POST PER PROGRAM */}
          <Card className="border-none shadow-none rounded-[32px] p-5 md:p-10 bg-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#1E1B4B]">
                  Pre-test vs post-test by program
                </h3>
                <p className="text-[13px] font-bold text-slate-400 mt-1">
                  Mean score of paired students, in percent
                </p>
              </div>

              <div className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[13px] font-semibold self-start md:self-auto">
                {programChartData.length} of {programRows.length} programs with paired data
              </div>
            </div>

            {programChartData.length === 0 ? (
              <EmptyState
                message={
                  programRows.length === 0
                    ? "No knowledge assessment is linked to a program yet. In the Survey Builder, set a knowledge assessment's \"Pre/Post-Test For Program\"."
                    : "No student has completed both the pre-test and the post-test yet."
                }
              />
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={programChartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                    height={100}
                    tick={{ fontSize: 12, fontWeight: 700, fill: "#64748b" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(79, 70, 229, 0.06)" }}
                    formatter={(value: number, name: string) => [
                      `${Number(value).toFixed(1)}%`,
                      name,
                    ]}
                    labelFormatter={(label: string, payload: any[]) =>
                      `${label} · n = ${payload?.[0]?.payload?.n ?? 0}`
                    }
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 13, fontWeight: 600 }}
                  />
                  <Bar dataKey="pre" name="Pre-test" fill={PRE_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="post" name="Post-test" fill={POST_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            <div className="mt-8">
              <MetricsTable
                firstColumn="Program"
                rows={programRows}
                emptyMessage="No programs have a linked knowledge assessment yet."
              />
            </div>
          </Card>

          {/* DEMOGRAPHIC BREAKDOWN */}
          <Card className="border-none shadow-none rounded-[32px] p-5 md:p-10 bg-white">
            <div className="flex flex-col gap-4 mb-6">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#1E1B4B]">
                  Learning gain by {breakdownLabel}
                </h3>
                <p className="text-[13px] font-bold text-slate-400 mt-1">
                  Mean gain (post − pre, percentage points) per group
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {BREAKDOWNS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBreakdown(item.id)}
                    className={`h-11 px-4 rounded-full text-sm font-semibold transition-colors ${ breakdown === item.id ?"bg-[#1E1B4B] text-white font-bold"
                        : "bg-[#F5F6FB] text-[#334155] hover:bg-[#EEF0FA]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {gainChartData.length === 0 ? (
              <EmptyState message={`No paired results by ${breakdownLabel.toLowerCase()} yet.`} />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(180, gainChartData.length * 48 + 40)}
              >
                <BarChart
                  data={gainChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    unit=" pts"
                    domain={[(min: number) => Math.min(0, Math.floor(min)), (max: number) => Math.max(0, Math.ceil(max))]}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={{ fontSize: 12, fontWeight: 700, fill: "#64748b" }}
                  />
                  <ReferenceLine x={0} stroke="#94a3b8" />
                  <Tooltip
                    cursor={{ fill: "rgba(79, 70, 229, 0.06)" }}
                    formatter={(value: number) => [fmtGain(Number(value)), "Mean Gain"]}
                    labelFormatter={(label: string, payload: any[]) =>
                      `${label} · n = ${payload?.[0]?.payload?.n ?? 0}`
                    }
                  />
                  <Bar dataKey="gain" name="Mean Gain" radius={[0, 4, 4, 0]} barSize={22}>
                    {gainChartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.gain < 0 ? GAIN_DOWN_COLOR : GAIN_UP_COLOR}
                      />
                    ))}
                    <LabelList
                      dataKey="gain"
                      position="right"
                      formatter={(value: number) => fmtGain(Number(value))}
                      style={{ fontSize: 12, fontWeight: 800, fill: "#334155" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            <div className="mt-8">
              <MetricsTable
                firstColumn={breakdownLabel}
                rows={breakdownRows}
                emptyMessage="No groups yet."
              />
            </div>
          </Card>

          {/* HOW TO READ */}
          <div className="flex items-start gap-3 p-5 md:p-6 rounded-[2rem] bg-indigo-50/70 border border-indigo-100">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-[13px] md:text-xs leading-relaxed font-medium text-indigo-800">
              <strong>Gain</strong> = post-test − pre-test, in percentage points.{" "}
              <strong>⟨g⟩</strong> (normalized gain) = gain ÷ (100 − pre-test), the share of the
              possible improvement actually achieved: High ≥ 0.70, Medium 0.30–0.69, Low &lt; 0.30.
              It is blank when the pre-test mean is already 100%.{" "}
              <strong>Small sample</strong> marks groups under {SMALL_SAMPLE_N} paired students.
              Incomplete students (pre-test only) are never included in the means.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   PIECES
========================================================= */

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <p className="m-0 text-[13px] font-semibold text-[#334155]">
        {label}
      </p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MetricsTable({
  firstColumn,
  rows,
  emptyMessage,
}: {
  firstColumn: string;
  rows: DisplayRow[];
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[860px] text-left">
        <thead>
          <tr className="border-b border-slate-100">
            {[
              firstColumn,
              "Paired n",
              "Incomplete",
              "Pre",
              "Post",
              "Gain",
              "⟨g⟩",
              "t",
              "df",
              "p",
              "Result",
            ].map((heading) => (
              <th
                key={heading}
                className="pb-3 pr-4 text-[13px] font-semibold text-slate-400 whitespace-nowrap"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="py-8 text-center text-xs font-bold text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const test = pairedTTest(row.paired_n, row.mean_gain, row.sd_diff);
              const level = normalizedGainLevel(row.norm_gain);

              return (
                <tr key={`${row.dimension}-${row.key}`} className="border-b border-slate-50 align-top">
                  <td className="py-3 pr-4">
                    <p className="text-xs font-black text-slate-800 max-w-[240px]">{row.label}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.paired_n > 0 && row.paired_n < SMALL_SAMPLE_N && <SmallSampleBadge />}
                      {row.ceiling_n > 0 && (
                        <span className="px-2 py-[3px] rounded-full bg-[#F1F5F9] text-[#475569] text-xs font-bold">
                          {row.ceiling_n} at 100% pre
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs font-black text-slate-900">{row.paired_n}</td>
                  <td className="py-3 pr-4 text-xs font-bold text-slate-500">{row.incomplete_n}</td>
                  <td className="py-3 pr-4 text-xs font-bold text-[#5B6477]">{fmtPct(row.mean_pre)}</td>
                  <td className="py-3 pr-4 text-xs font-bold text-indigo-600">{fmtPct(row.mean_post)}</td>
                  <td
                    className={`py-3 pr-4 text-xs font-black whitespace-nowrap ${ row.mean_gain !== null && row.mean_gain < 0 ?"text-orange-600" : "text-slate-900"
                    }`}
                  >
                    {fmtGain(row.mean_gain)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className="text-xs font-black text-slate-900">{fmtG(row.norm_gain)}</span>
                    {level && (
                      <span className="ml-1.5 align-middle">
                        <GainLevelBadge level={level} />
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs font-bold text-slate-600">
                    {test ? test.t.toFixed(2) : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs font-bold text-slate-600">
                    {test ? test.df : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs font-bold text-slate-600 whitespace-nowrap">
                    {test ? formatPValue(test.p) : "—"}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {test ? (
                        <SignificanceBadge significant={test.significant} />
                      ) : (
                        <span className="text-[13px] font-bold text-slate-300">n/a</span>
                      )}
                      {test && row.paired_n < T_TEST_CAUTION_N && <CautionBadge compact />}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-56 flex flex-col items-center justify-center gap-3 rounded-[2rem] bg-slate-50 text-center px-6">
      <TrendingUp className="w-8 h-8 text-slate-300" />
      <p className="text-xs font-bold text-slate-400 max-w-md leading-relaxed">{message}</p>
    </div>
  );
}

function SmallSampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-bold whitespace-nowrap">
      <AlertTriangle className="w-2.5 h-2.5" />
      Small sample
    </span>
  );
}

function CautionBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-[#FFEDD5] text-[#9A3412] text-xs font-bold whitespace-nowrap">
      <AlertTriangle className="w-2.5 h-2.5" />
      {compact ? `n < ${T_TEST_CAUTION_N}` : `n < ${T_TEST_CAUTION_N} · interpret with caution`}
    </span>
  );
}

function SignificanceBadge({ significant }: { significant: boolean }) {
  return significant ? (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-[#D1FAE5] text-[#065F46] text-xs font-bold whitespace-nowrap">
      <CheckCircle2 className="w-2.5 h-2.5" />
      Significant
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-[#F1F5F9] text-[#475569] text-xs font-bold whitespace-nowrap">
      <MinusCircle className="w-2.5 h-2.5" />
      Not significant
    </span>
  );
}

function GainLevelBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const styles = {
    High: "bg-indigo-600 text-white",
    Medium: "bg-violet-100 text-violet-700",
    Low: "bg-slate-100 text-slate-500",
  } as const;

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[13px] font-semibold ${styles[level]}`}
    >
      {level} gain
    </span>
  );
}
