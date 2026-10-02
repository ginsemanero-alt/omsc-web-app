import { supabase } from './supabase';

// Material progress for the pre-test -> materials -> post-test flow
// (PHASE 29, supabase/migrations.sql).
//
// - Only IEC library materials linked to a program (program_materials)
//   count. Handouts (materials.program_id set) never do.
// - "Viewed" means the student opened the preview or downloaded it; each
//   open calls record_material_view(), which writes material_views.
// - The post-test stays locked until every linked material is viewed. A
//   program with no linked materials keeps it locked ("coming soon").
//
// The same rule is enforced on the server by submit_assessment (PHASE 30).
// Keep the two in step: linked materials that are not archived and are
// not handouts, each with a material_views row for the student.

export interface LinkedMaterial {
  id: number;
  title: string;
  type: string | null;
  category: string | null;
  file_url: string | null;
  image_url: string | null;
  description: string | null;
}

export interface MaterialProgressData {
  // program id -> its linked IEC materials, in the admin's order
  linksByProgram: Record<number, LinkedMaterial[]>;
  viewedIds: Set<number>;
}

export interface MaterialProgress {
  viewed: number;
  total: number;
}

export const MATERIALS_COMING_SOON = 'Materials for this program are coming soon.';
export const MATERIALS_CHECK_FAILED = "Couldn't check your materials. Refresh to try again.";

interface LinkRow {
  program_id: number;
  material_id: number;
  sort_order: number | null;
  materials: (LinkedMaterial & { archived_at: string | null; program_id: number | null }) | null;
}

// Loads the links (for the given programs, or all) and, for a signed-in
// student, which materials they have viewed. Throws on a failed query so
// the caller can show "couldn't check" instead of a wrong count.
export async function loadMaterialProgress(
  userRowId: number | null,
  programIds?: number[]
): Promise<MaterialProgressData> {
  let linkQuery = supabase
    .from('program_materials')
    .select('program_id, material_id, sort_order, materials(id, title, type, category, file_url, image_url, description, archived_at, program_id)')
    .order('sort_order', { ascending: true });
  if (programIds) {
    if (programIds.length === 0) return { linksByProgram: {}, viewedIds: new Set() };
    linkQuery = linkQuery.in('program_id', programIds);
  }

  const [linkRes, viewRes] = await Promise.all([
    linkQuery,
    userRowId
      ? supabase.from('material_views').select('material_id').eq('user_id', userRowId)
      : Promise.resolve({ data: [] as { material_id: number }[], error: null }),
  ]);
  if (linkRes.error) throw linkRes.error;
  if (viewRes.error) throw viewRes.error;

  const linksByProgram: Record<number, LinkedMaterial[]> = {};
  for (const row of (linkRes.data || []) as unknown as LinkRow[]) {
    const material = row.materials;
    if (!material || material.archived_at || material.program_id !== null) continue;
    (linksByProgram[row.program_id] ||= []).push({
      id: material.id,
      title: material.title,
      type: material.type,
      category: material.category,
      file_url: material.file_url,
      image_url: material.image_url,
      description: material.description,
    });
  }

  return {
    linksByProgram,
    viewedIds: new Set((viewRes.data || []).map((v) => Number(v.material_id))),
  };
}

export function linkedMaterialsFor(data: MaterialProgressData | null, programId: number): LinkedMaterial[] {
  return data?.linksByProgram[programId] || [];
}

export function isMaterialViewed(data: MaterialProgressData | null, materialId: number): boolean | null {
  if (!data) return null;
  return data.viewedIds.has(materialId);
}

export function materialProgressFor(data: MaterialProgressData | null, programId: number): MaterialProgress | null {
  if (!data) return null;
  const linked = linkedMaterialsFor(data, programId);
  return {
    viewed: linked.filter((m) => data.viewedIds.has(m.id)).length,
    total: linked.length,
  };
}

// Why the post-test can't be taken yet, or null when it can. Pass
// failed=true when loading the progress failed: the lock then holds with
// a "couldn't check" reason rather than silently opening.
export function postTestLockFor(
  data: MaterialProgressData | null,
  programId: number | null | undefined,
  failed = false
): string | null {
  if (failed) return MATERIALS_CHECK_FAILED;
  if (!data || programId == null) return null;
  const progress = materialProgressFor(data, programId)!;
  if (progress.total === 0) return MATERIALS_COMING_SOON;
  const remaining = progress.total - progress.viewed;
  if (remaining <= 0) return null;
  return `View ${remaining} more material${remaining === 1 ? '' : 's'} to unlock`;
}

// Records one open (preview, download, play) of a material for the
// signed-in student. The server finds the student from the session and
// ignores admins, so this is safe to call from any page. Never blocks the
// open itself.
export async function recordMaterialView(materialId: number): Promise<boolean> {
  const { error } = await supabase.rpc('record_material_view', { p_material_id: materialId });
  if (error) {
    console.warn('Material view not recorded:', error.message);
    return false;
  }
  return true;
}
