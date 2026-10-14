import { AlertTriangle, Loader2, Send } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { Card } from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { SMALL_SAMPLE_N } from "../../lib/learningGain";
import type { MaterialReachRow, MaterialReachSummary } from "../../lib/materialReach";

// Material reach by course: how many students opened at least one linked
// IEC material (PHASE 32). Presentational — the dashboard owns the data
// (so the PDF export can use it) and the filters. Counts only.

interface Props {
  data: MaterialReachSummary | null;
  loading: boolean;
  error: string | null;
  iecProgramId: string;
  onIecProgramChange: (value: string) => void;
  includeTest: boolean;
  onIncludeTestChange: (value: boolean) => void;
}

const BAR_COLOR = "#4f46e5";

function SmallSampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-bold whitespace-nowrap">
      <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
      Small sample
    </span>
  );
}

const pctLabel = (pct: number | null) => (pct === null ? "—" : `${pct}%`);

function ReachTable({ title, rows }: { title: string; rows: MaterialReachRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[13px] font-semibold text-[#5B6477] border-b border-[#E5E7F0]">
            <th scope="col" className="py-2 pr-3">{title}</th>
            <th scope="col" className="py-2 px-3 text-right">Students</th>
            <th scope="col" className="py-2 px-3 text-right">Opened ≥ 1</th>
            <th scope="col" className="py-2 pl-3 text-right">Reached</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[#F0F1F7] last:border-0">
              <td className="py-2.5 pr-3 font-semibold text-[#1E1B4B]">
                <span className="mr-2">{row.key}</span>
                {row.students < SMALL_SAMPLE_N && <SmallSampleBadge />}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">{row.students}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{row.reached}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums font-bold text-[#1E1B4B]">
                {pctLabel(row.pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MaterialReachSection({
  data,
  loading,
  error,
  iecProgramId,
  onIecProgramChange,
  includeTest,
  onIncludeTestChange,
}: Props) {
  const courses = data?.by_course ?? [];
  const years = data?.by_year_level ?? [];
  const programs = data?.options.iec_programs ?? [];
  const noLinks = !!data && data.linked_materials === 0;

  return (
    <Card className="border-none shadow-none rounded-[32px] p-5 md:p-7 bg-white">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            <h2 className="text-lg md:text-xl font-bold text-[#1E1B4B]">Material reach by course</h2>
          </div>
          <p className="mt-1 text-[13px] font-semibold text-slate-400">
            Students who opened at least one linked IEC material
            {data ? ` · ${data.linked_materials} linked material${data.linked_materials === 1 ? "" : "s"} counted` : ""}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-1.5 min-w-0 sm:w-64">
            <span id="reach-iec-program" className="text-[13px] font-semibold text-[#334155]">IEC program</span>
            <Select value={iecProgramId} onValueChange={onIecProgramChange}>
              <SelectTrigger
                aria-labelledby="reach-iec-program"
                className="h-11 rounded-[14px] bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] text-sm text-[#1E293B]"
              >
                <SelectValue placeholder="All programs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programs</SelectItem>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.title.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 h-11 text-sm font-semibold text-[#334155] cursor-pointer">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(e) => onIncludeTestChange(e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            Include test accounts (this section only)
          </label>
        </div>
      </div>

      <div className="mt-5">
        {error ? (
          <p role="alert" className="text-sm font-semibold text-red-600">
            Could not load material reach: {error}
          </p>
        ) : loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-slate-400" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Loading material reach...
          </div>
        ) : !data || data.overall.students === 0 ? (
          <p className="text-sm text-slate-500">No students match the current filters.</p>
        ) : (
          <div className={`flex flex-col gap-6 ${loading ? "opacity-60" : ""}`}>
            {noLinks && (
              <p className="m-0 rounded-2xl bg-[#FEF3C7] text-[#92400E] text-sm font-semibold px-4 py-3">
                {iecProgramId === "all"
                  ? "No IEC materials are linked to any program yet, so no student can show as reached."
                  : "This program has no linked IEC materials, so no student can show as reached."}
              </p>
            )}

            <p className="m-0 text-sm text-[#334155]">
              Overall: <strong>{data.overall.reached}</strong> of <strong>{data.overall.students}</strong> students
              ({pctLabel(data.overall.pct)})
            </p>

            <div role="img" aria-label="Horizontal bar chart: percentage of students reached, per course">
              <ResponsiveContainer width="100%" height={Math.max(160, courses.length * 40 + 40)}>
                <BarChart data={courses} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="key" width={150} tick={{ fontSize: 12 }} interval={0} />
                  <Tooltip
                    formatter={(value: number, _name, item: any) => [
                      `${value}% (${item.payload.reached} of ${item.payload.students} students)`,
                      "Reached",
                    ]}
                  />
                  <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                    {courses.map((row) => (
                      <Cell key={row.key} fill={BAR_COLOR} fillOpacity={row.students < SMALL_SAMPLE_N ? 0.45 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <ReachTable title="Course" rows={courses} />
            <ReachTable title="Year level" rows={years} />
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-1 text-xs text-slate-500">
        <p className="m-0">
          Percentages are based on students with an account in the system, not on total enrollment.
        </p>
        <p className="m-0">
          Material views are recorded only since IEC materials were linked to programs, so reach for
          earlier students may be understated. <strong>Small sample</strong> marks groups under {SMALL_SAMPLE_N} students (paler bars).
        </p>
      </div>
    </Card>
  );
}
