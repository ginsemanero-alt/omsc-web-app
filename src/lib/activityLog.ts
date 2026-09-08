import { supabase } from './supabase';

// Shared helper for the admin activity log — records who did what, to
// which record, and when. Scope is admin actions only (create/update/
// delete on Programs, Materials, Surveys, and User Management); nothing
// here tracks student activity.
//
// Requires the `activity_logs` table + RLS from supabase/migrations.sql
// (PHASE 6). Call sites pass actorEmail/actorName from useAuth() — this
// module isn't a hook itself, so it can be called from plain event
// handlers after a mutation succeeds.

export type ActivityAction = 'create' | 'update' | 'delete';
export type ActivityEntityType = 'program' | 'material' | 'survey' | 'user';

interface LogActivityParams {
  actorEmail: string | null | undefined;
  actorName?: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  // Stringified regardless of source type — programs/materials/users use
  // bigint ids, surveys use a uuid, and the log column doesn't need to
  // distinguish between them.
  entityId?: string | number | null;
  entityLabel?: string | null;
  details?: string | null;
}

// Fire-and-forget by design: a logging failure must never block, roll
// back, or surface an error for the admin action it's recording. Errors
// are swallowed after a console.warn, so an admin who hasn't run the
// activity_logs migration yet still gets fully working Programs/
// Materials/Surveys/User Management — just without the log entry.
export async function logActivity({
  actorEmail,
  actorName,
  action,
  entityType,
  entityId,
  entityLabel,
  details,
}: LogActivityParams): Promise<void> {
  if (!actorEmail) return;

  try {
    const { error } = await supabase.from('activity_logs').insert([
      {
        actor_email: actorEmail,
        actor_name: actorName || null,
        action,
        entity_type: entityType,
        entity_id: entityId != null ? String(entityId) : null,
        entity_label: entityLabel || null,
        details: details || null,
      },
    ]);

    if (error) console.warn('Activity log write failed:', error.message);
  } catch (err) {
    console.warn('Activity log write failed:', err);
  }
}
