import { supabase } from './supabase';

export const CAMPUSES = [
  'San Jose Campus',
  'Labangan Campus',
  'Murtha Campus',
] as const;

// programs.campus / materials.campus: NULL means university-wide (every
// campus sees it); a campus name means only that campus's students see
// it. See the PHASE 21 migration note in supabase/migrations.sql.
export const ALL_CAMPUSES_LABEL = 'All Campuses';

export function campusLabel(campus?: string | null) {
  return campus || ALL_CAMPUSES_LABEL;
}

// PostgREST `.or()` filter matching university-wide rows plus the given
// campus. Double-quoted because campus names contain spaces.
export function campusVisibilityFilter(campus: string) {
  return `campus.is.null,campus.eq."${campus.replace(/"/g, '')}"`;
}

// The signed-in student's campus, read from their profile (not the
// display-only localStorage copy, which falls back to San Jose). Null
// when unknown — callers then show everything rather than hide content.
export async function fetchViewerCampus(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('campus')
    .eq('id', session.user.id)
    .maybeSingle();
  return data?.campus || null;
}
