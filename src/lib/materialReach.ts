// Material reach by course — types and the RPC wrapper for the
// Analytics dashboard's "Material reach by course" section.
// The aggregation happens in SQL: see material_reach_summary() in
// supabase/migrations.sql (PHASE 32). Counts only; no student is ever
// identified.

import { supabase } from './supabase';

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
}

// The dashboard's age groups (AnalyticsDashboard getAgeGroup) as min/max.
const AGE_GROUP_RANGES: Record<string, { min: number | null; max: number | null }> = {
  'Below 18': { min: null, max: 17 },
  '18–20': { min: 18, max: 20 },
  '21–22': { min: 21, max: 22 },
  '23–24': { min: 23, max: 24 },
  '25–26': { min: 25, max: 26 },
  '27+': { min: 27, max: null },
};

const orNull = (value: string) => (value === 'all' || value === '' ? null : value);

export async function fetchMaterialReach(filters: MaterialReachFilters): Promise<MaterialReachSummary> {
  const range = AGE_GROUP_RANGES[filters.age];
  const academicYear = Number(filters.academicYear);
  const programId = Number(filters.iecProgramId);

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
};
