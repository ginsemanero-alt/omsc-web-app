import { supabase } from './supabase';

// Records that the signed-in student opened a material (IEC material or
// program handout) — every time, not once per session. The server
// identifies the student from their session and keeps the first view's
// timestamp (record_material_view, PHASE 26); admins aren't recorded.
// Fire-and-forget: a failure here must never block opening the material.
export function recordMaterialView(materialId: number | string | null | undefined): void {
  const id = Number(materialId);
  if (!Number.isFinite(id)) return;

  supabase
    .rpc('record_material_view', { p_material_id: id })
    .then(({ error }) => {
      if (error) console.warn('recordMaterialView failed:', error.message);
    });
}
