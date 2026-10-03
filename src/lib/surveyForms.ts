import { supabase } from './supabase';

// Since PHASE 30 (supabase/migrations.sql) nobody can SELECT
// surveys.questions_data or questions_data_post directly: those columns
// hold the answer keys. Every other column stays readable, but select('*')
// fails, so survey reads list their columns.
export const SURVEY_COLUMNS =
  'id, title, description, category, iec_category, type, status, program_id, created_at, archived_at';

// Admins read both forms (answer keys included) through
// admin_survey_forms() and merge them into the survey rows. Students use
// get_assessment_questions() instead, which never returns the keys.
export async function withAdminForms<T extends { id: string | number }>(
  surveys: T[]
): Promise<(T & { questions_data: any[]; questions_data_post: any[] | null })[]> {
  if (surveys.length === 0) return [];
  const { data, error } = await supabase.rpc('admin_survey_forms', {
    p_survey_ids: surveys.map((s) => s.id),
  });
  if (error) throw error;
  const byId = new Map<string, { questions_data: any; questions_data_post: any }>(
    (data || []).map((row: any) => [String(row.id), row])
  );
  return surveys.map((survey) => {
    const forms = byId.get(String(survey.id));
    return {
      ...survey,
      questions_data: Array.isArray(forms?.questions_data) ? forms!.questions_data : [],
      questions_data_post: Array.isArray(forms?.questions_data_post) ? forms!.questions_data_post : null,
    };
  });
}
