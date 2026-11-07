// Material reach by course — types and the RPC wrapper for the
// Analytics dashboard's "Material reach by course" section.
// The aggregation happens in SQL: see material_reach_summary() in
// supabase/migrations.sql (PHASE 32). Counts only; no student is ever
// identified.

import { supabase } from './supabase';
import { AGE_GROUP_RANGES } from './analyticsFilters';

export interface MaterialReachRow {
  key: string;
  students: number;
  reached: number;
  pct: number | null;
}

export interface MaterialReachSummary {
  by_course: MaterialReachRow[];
  by_year_level: MaterialReachRow[];
  overall: { students: number; reached: number; pct: number | null };
  // Distinct, non-archived linked IEC materials the "reached" rule used.
  linked_materials: number;
  options: { iec_programs: { id: number; title: string }[] };
}

// Dashboard filters, as the dashboard holds them ("all" = no filter).
export interface MaterialReachFilters {
  campus: string;
  course: string;
  yearLevel: string;
  gender: string;
  age: string; // a dashboard age group label, e.g. "18–20"
  academicYear: string;
  iecProgramId: string; // "all" or a programs.id
  includeTest: boolean;
  // PHASE 41: the shared Program / PWD / IP filters.
  guidanceProgramId: string; // "all" or a programs.id: participants of its awareness check
  pwd: 'all' | 'pwd' | 'not';
  ip: 'all' | 'ip' | 'not';
}

const orNull = (value: string) => (value === 'all' || value === '' ? null : value);

export async function fetchMaterialReach(filters: MaterialReachFilters): Promise<MaterialReachSummary> {
  const range = AGE_GROUP_RANGES[filters.age];
  const academicYear = Number(filters.academicYear);
  const programId = Number(filters.iecProgramId);
  const guidanceProgramId = Number(filters.guidanceProgramId);

  const { data, error } = await supabase.rpc('material_reach_summary', {
    p_campus: orNull(filters.campus),
    p_course: orNull(filters.course),
    p_year_level: orNull(filters.yearLevel),
    p_gender: orNull(filters.gender),
    p_age_min: range ? range.min : null,
    p_age_max: range ? range.max : null,
    p_academic_year: Number.isFinite(academicYear) && orNull(filters.academicYear) ? academicYear : null,
    p_iec_program_id: Number.isFinite(programId) && orNull(filters.iecProgramId) ? programId : null,
    p_include_test: filters.includeTest,
    p_program_id: Number.isFinite(guidanceProgramId) && orNull(filters.guidanceProgramId) ? guidanceProgramId : null,
    p_pwd: filters.pwd === 'pwd' ? true : filters.pwd === 'not' ? false : null,
    p_ip: filters.ip === 'ip' ? true : filters.ip === 'not' ? false : null,
  });

  if (error) throw error;
  return data as MaterialReachSummary;
}

// Same defaults as the section: no filters, all IEC programs, test
// accounts excluded. Used for the AI Insight payload.
export const UNFILTERED_REACH: MaterialReachFilters = {
  campus: 'all',
  course: 'all',
  yearLevel: 'all',
  gender: 'all',
  age: 'all',
  academicYear: 'all',
  iecProgramId: 'all',
  includeTest: false,
  guidanceProgramId: 'all',
  pwd: 'all',
  ip: 'all',
};
