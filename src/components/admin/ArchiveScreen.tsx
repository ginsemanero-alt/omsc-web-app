import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PRIVATE_MATERIAL_BUCKET } from '../../lib/materialAccess';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/use-toast';
import { logActivity } from '../../lib/activityLog';
import { NOTE_PUBLISHED } from '../../lib/activityLogView';
import { deleteHostedVideoForMaterial } from '../../lib/videoHosting';
import { adminPost, fetchRetentionSettings, formatDay, removalInfo, type RetentionSettings } from '../../lib/retention';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  Archive as ArchiveIcon,
  Calendar,
  FileStack,
  ClipboardList,
  Users,
  UserX,
  RotateCcw,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

type EntityType = 'program' | 'material' | 'survey' | 'user';

interface ArchivedRow {
  id: number;
  label: string;
  archived_at: string;
  // material only — needed to also clean up its storage file(s) on a
  // permanent delete, same as MaterialLibrary.tsx used to do inline.
  file_url?: string | null;
  // A material's full file in the private bucket (PHASE 35).
  file_path?: string | null;
  thumb_path?: string | null;
  // A video hosted on Cloudinary (PHASE 37); deleted there before the row goes.
  video_public_id?: string | null;
  image_url?: string | null;
  // A handout belongs to a program and goes with it.
  program_id?: number | null;
  // Retention and delete protection (PHASE 50).
  role?: string | null;
  anonymized_at?: string | null;
  // Responses (surveys) or responses + material views (students) used in
  // analytics. Test accounts are not counted: they can always be deleted.
  analyticsCount?: number;
  // Every response of a survey, test accounts included: a survey with any
  // response is never removed automatically.
  totalResponses?: number;
}

const SECTIONS: { type: EntityType; title: string; icon: typeof FileStack }[] = [
  { type: 'program', title: 'Programs', icon: Calendar },
  { type: 'material', title: 'Materials', icon: FileStack },
  { type: 'survey', title: 'Surveys', icon: ClipboardList },
  { type: 'user', title: 'Users', icon: Users },
];

export default function ArchiveScreen() {
  const { user: authUser, userName } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<EntityType, ArchivedRow[]>>({
    program: [],
    material: [],
    survey: [],
    user: [],
  });

  const [confirmTarget, setConfirmTarget] = useState<{ type: EntityType; row: ArchivedRow } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [anonymizeTarget, setAnonymizeTarget] = useState<ArchivedRow | null>(null);
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [settings, setSettings] = useState<RetentionSettings | null>(null);

  const fetchArchived = async () => {
    setLoading(true);
    try {
      try {
        setSettings(await fetchRetentionSettings());
      } catch {
        setSettings(null); // dates are simply not shown
      }

      const [programsRes, materialsRes, surveysRes, usersRes] = await Promise.all([
        supabase.from('programs').select('id, title, archived_at').not('archived_at', 'is', null),
        supabase.from('materials').select('id, title, archived_at, file_url, file_path, thumb_path, video_public_id, image_url, program_id').not('archived_at', 'is', null),
        supabase.from('surveys').select('id, title, archived_at').not('archived_at', 'is', null),
        supabase.from('users').select('id, name, email, role, is_test_account, archived_at, anonymized_at').not('archived_at', 'is', null),
      ]);

      if (programsRes.error) throw programsRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (surveysRes.error) throw surveysRes.error;
      if (usersRes.error) throw usersRes.error;

      const sortByArchivedDesc = (a: ArchivedRow, b: ArchivedRow) =>
        new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime();

      // How much analytics data hangs off each archived survey / real student.
      // Test accounts are exempt everywhere, so they are not counted.
      const surveyCounts = new Map<string, { real: number; total: number }>();
      await Promise.all(
        (surveysRes.data || []).map(async (s: any) => {
          const [real, total] = await Promise.all([
            supabase.from('survey_responses').select('id, users!inner(is_test_account)', { count: 'exact', head: true }).eq('survey_id', s.id).eq('users.is_test_account', false),
            supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', s.id),
          ]);
          surveyCounts.set(s.id, { real: real.count || 0, total: total.count || 0 });
        })
      );
      const studentCounts = new Map<number, number>();
      await Promise.all(
        (usersRes.data || [])
          .filter((u: any) => u.role === 'student' && u.is_test_account !== true)
          .map(async (u: any) => {
            const [answered, viewed] = await Promise.all([
              supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('user_id', u.id),
              supabase.from('material_views').select('material_id', { count: 'exact', head: true }).eq('user_id', u.id),
            ]);
            studentCounts.set(u.id, (answered.count || 0) + (viewed.count || 0));
          })
      );

      setRows({
        program: (programsRes.data || [])
          .map((p: any) => ({ id: p.id, label: p.title, archived_at: p.archived_at }))
          .sort(sortByArchivedDesc),
        material: (materialsRes.data || [])
          .map((m: any) => ({ id: m.id, label: m.title, archived_at: m.archived_at, file_url: m.file_url, file_path: m.file_path, thumb_path: m.thumb_path, video_public_id: m.video_public_id, image_url: m.image_url, program_id: m.program_id }))
          .sort(sortByArchivedDesc),
        survey: (surveysRes.data || [])
          .map((s: any) => ({ id: s.id, label: s.title, archived_at: s.archived_at, analyticsCount: surveyCounts.get(s.id)?.real || 0, totalResponses: surveyCounts.get(s.id)?.total || 0 }))
          .sort(sortByArchivedDesc),
        user: (usersRes.data || [])
          .map((u: any) => ({ id: u.id, label: u.name || u.email, archived_at: u.archived_at, role: u.role, anonymized_at: u.anonymized_at, analyticsCount: studentCounts.get(u.id) || 0 }))
          .sort(sortByArchivedDesc),
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fetch Error', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchived();
  }, []);

  const tableName = (type: EntityType) =>
    type === 'program' ? 'programs' : type === 'material' ? 'materials' : type === 'survey' ? 'surveys' : 'users';

  const handleRestore = async (type: EntityType, row: ArchivedRow) => {
    try {
      const { error } = await supabase.from(tableName(type)).update({ archived_at: null }).eq('id', row.id);
      if (error) throw error;

      logActivity({ actorEmail: authUser?.email, actorName: userName, action: 'update', entityType: type, entityId: row.id, entityLabel: row.label, details: type === 'program' ? NOTE_PUBLISHED : 'Restored from Archive' });

      setRows((prev) => ({ ...prev, [type]: prev[type].filter((r) => r.id !== row.id) }));
      toast({ title: 'Restored', description: `"${row.label}" is back in its regular list.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Restore Error', description: err.message });
    }
  };

  const parseStorageUrl = (url?: string | null): { bucket: string; path: string } | null => {
    if (!url) return null;
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  };

  // Best-effort: by the time this runs the rows are already gone, so a
  // storage hiccup just leaves an orphaned file, not a broken item shown
  // to anyone. One remove() call per bucket.
  const removeStorageFiles = async (urls: (string | null | undefined)[]) => {
    const byBucket = new Map<string, string[]>();
    for (const url of new Set(urls.filter(Boolean) as string[])) {
      const parsed = parseStorageUrl(url);
      if (!parsed) continue;
      byBucket.set(parsed.bucket, [...(byBucket.get(parsed.bucket) || []), parsed.path]);
    }
    for (const [bucket, paths] of byBucket) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) console.warn(`Storage cleanup failed in ${bucket}:`, error.message);
    }
  };

  // Everything a program owns in storage — cover, gallery, every timeline
  // entry's photos, and its handouts — plus its handout rows, which live
  // in `materials` (program_id) and are deleted here before the program.
  // Timeline entry rows go with the program (ON DELETE CASCADE).
  const collectProgramFiles = async (programId: number): Promise<string[]> => {
    const [programRes, entriesRes, handoutsRes] = await Promise.all([
      supabase.from('programs').select('image_url, gallery_urls').eq('id', programId).maybeSingle(),
      supabase.from('program_entries').select('image_urls').eq('program_id', programId),
      supabase.from('materials').select('file_url, image_url').eq('program_id', programId),
    ]);
    if (programRes.error) throw programRes.error;
    if (entriesRes.error) throw entriesRes.error;
    if (handoutsRes.error) throw handoutsRes.error;

    return [
      programRes.data?.image_url,
      ...(programRes.data?.gallery_urls || []),
      ...(entriesRes.data || []).flatMap((entry: any) => entry.image_urls || []),
      ...(handoutsRes.data || []).flatMap((handout: any) => [handout.file_url, handout.image_url]),
    ].filter(Boolean);
  };

  const handlePermanentDelete = async () => {
    if (!confirmTarget) return;
    const { type, row } = confirmTarget;

    try {
      setIsDeleting(true);

      if (type === 'user') {
        // Users need the service-role key to also clean up profiles and
        // the Auth identity — the same endpoint already built for this,
        // now only reachable from here instead of the regular Delete
        // button.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('No active session — please log in again.');

        const response = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ userId: row.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || 'Failed to delete user.');
      } else {
        // Gather a program's files before its rows disappear.
        const programFiles = type === 'program' ? await collectProgramFiles(row.id) : [];

        if (type === 'program') {
          const { error: handoutError } = await supabase.from('materials').delete().eq('program_id', row.id);
          if (handoutError) throw handoutError;
        }

        // A hosted video is removed from Cloudinary FIRST. If that fails the
        // row is kept (so nothing is orphaned) and the admin sees the error.
        if (type === 'material' && row.video_public_id) {
          await deleteHostedVideoForMaterial(row.id);
        }

        const { error } = await supabase.from(tableName(type)).delete().eq('id', row.id);
        if (error) throw error;

        if (type === 'program') await removeStorageFiles(programFiles);
        if (type === 'material') {
          await removeStorageFiles([row.file_url, row.image_url]);
          // The full file and its card thumbnail, both in the private bucket.
          const privateFiles = [row.file_path, row.thumb_path].filter((path): path is string => !!path);
          if (privateFiles.length > 0) {
            const { error: privateError } = await supabase.storage.from(PRIVATE_MATERIAL_BUCKET).remove(privateFiles);
            if (privateError) console.warn('Storage cleanup failed for', privateFiles.join(', '), privateError.message);
          }
        }

        logActivity({ actorEmail: authUser?.email, actorName: userName, action: 'delete', entityType: type, entityId: row.id, entityLabel: row.label, details: 'Permanently deleted from Archive' });
      }

      setRows((prev) => ({ ...prev, [type]: prev[type].filter((r) => r.id !== row.id) }));
      toast({ title: 'Permanently Deleted', description: `"${row.label}" is gone for good.` });
      setConfirmTarget(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete Error', description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAnonymize = async () => {
    if (!anonymizeTarget) return;
    try {
      setIsAnonymizing(true);
      await adminPost('/api/admin/anonymize-student', { userId: anonymizeTarget.id });
      toast({ title: 'Anonymized', description: 'The student can no longer be identified. Their answers still count in the statistics.' });
      setAnonymizeTarget(null);
      await fetchArchived();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Anonymize Error', description: err.message });
    } finally {
      setIsAnonymizing(false);
    }
  };

  // "Archived on …" plus when it will be removed, or why it will not be.
  const retentionLine = (type: EntityType, row: ArchivedRow): { text: string; soon: boolean } => {
    const archivedOn = `Archived on ${formatDay(row.archived_at)}`;
    if (type === 'user' && row.anonymized_at) return { text: `${archivedOn} · Anonymized`, soon: false };
    if (!settings) return { text: archivedOn, soon: false };
    const days = type === 'user' ? settings.archived_students_days : settings.archived_content_days;
    const manual = { text: `${archivedOn} · Kept until removed manually`, soon: false };
    if (type === 'user' && row.role !== 'student') return manual;
    if (type === 'material' && row.program_id != null) return manual;
    if (type === 'survey' && (row.totalResponses || 0) > 0) return { text: `${archivedOn} · Kept: has responses`, soon: false };
    const info = removalInfo(row.archived_at, days);
    if (!info) return manual;
    const verb = type === 'user' ? 'anonymized' : 'removed';
    return { text: `${archivedOn} · Will be ${verb} on ${formatDay(info.removeOn)}`, soon: info.soon };
  };

  const totalArchived = SECTIONS.reduce((sum, s) => sum + rows[s.type].length, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase mb-1">
          <ArchiveIcon className="inline w-7 h-7 mr-2 -mt-1 text-indigo-600" />
          Archive
        </h1>
        <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">
          Archived Programs, Materials, Surveys, and Users &middot; restore or permanently delete
        </p>
      </div>

      {loading ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2">
          <Loader2 className="animate-spin text-indigo-600" />
          <span className="text-[10px] font-black uppercase text-slate-400">Loading Archive...</span>
        </div>
      ) : totalArchived === 0 ? (
        <Card className="p-10 rounded-[2rem] border-none shadow-sm bg-white text-center">
          <ArchiveIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 font-black uppercase text-xs">Nothing archived</p>
        </Card>
      ) : (
        SECTIONS.map(({ type, title, icon: Icon }) => {
          const sectionRows = rows[type];
          if (sectionRows.length === 0) return null;

          return (
            <div key={type} className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Icon className="w-4 h-4 text-indigo-500" /> {title} ({sectionRows.length})
              </h2>

              <div className="space-y-2">
                {sectionRows.map((row) => {
                  const line = retentionLine(type, row);
                  const anonymized = type === 'user' && !!row.anonymized_at;
                  const blockedSurvey = type === 'survey' && (row.analyticsCount || 0) > 0;
                  const blockedStudent = type === 'user' && row.role === 'student' && !anonymized && (row.analyticsCount || 0) > 0;
                  const canAnonymize = type === 'user' && row.role === 'student' && !anonymized;
                  return (
                    <Card key={row.id} className="p-4 rounded-2xl border-none shadow-sm bg-white flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{row.label}</p>
                        <p className={`text-[11px] font-bold mt-0.5 ${line.soon ? 'text-amber-600' : 'text-slate-400'}`}>
                          {line.text}
                          {line.soon && ' · Removal is within 7 days. Restore it to cancel.'}
                        </p>
                        {blockedSurvey && (
                          <p className="text-[11px] text-slate-500 font-medium mt-1">
                            This survey has {row.analyticsCount} responses used in analytics. It can be archived, not deleted.
                          </p>
                        )}
                        {blockedStudent && (
                          <p className="text-[11px] text-slate-500 font-medium mt-1">
                            This student has {row.analyticsCount} responses used in analytics. Anonymize instead.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!anonymized && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRestore(type, row)}
                            className="h-9 rounded-xl font-black uppercase text-[10px]"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
                          </Button>
                        )}
                        {canAnonymize && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAnonymizeTarget(row)}
                            className="h-9 rounded-xl font-black uppercase text-[10px] border-indigo-200 text-indigo-700"
                          >
                            <UserX className="w-3.5 h-3.5 mr-1.5" /> Anonymize now
                          </Button>
                        )}
                        {!anonymized && !blockedSurvey && !blockedStudent && (
                          <Button
                            size="sm"
                            onClick={() => setConfirmTarget({ type, row })}
                            className="h-9 rounded-xl font-black uppercase text-[10px] bg-rose-600 hover:bg-rose-700 text-white"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Permanently
                          </Button>
                        )}
                        {anonymized && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Anonymized</span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ANONYMIZE CONFIRM */}
      <Dialog open={!!anonymizeTarget} onOpenChange={(open) => !open && !isAnonymizing && setAnonymizeTarget(null)}>
        <DialogContent className="max-w-md bg-white rounded-[2rem] p-6 border-none shadow-2xl font-sans text-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight text-center">
              Anonymize this student?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 text-slate-500 text-xs font-medium leading-relaxed px-2">
            <span className="font-bold text-slate-800">"{anonymizeTarget?.label}"</span> will lose their name, email, student ID and
            contact details for good, and can no longer sign in. Their answers stay in the combined statistics, with no name attached.
            This cannot be undone.
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button variant="ghost" disabled={isAnonymizing} onClick={() => setAnonymizeTarget(null)} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider text-slate-500 bg-slate-50 hover:bg-slate-100">
              Cancel
            </Button>
            <Button onClick={handleAnonymize} disabled={isAnonymizing} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
              {isAnonymizing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Anonymize'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PERMANENT DELETE CONFIRM */}
      <Dialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent className="max-w-md bg-white rounded-[2rem] p-6 border-none shadow-2xl font-sans text-center">
          <div className="mx-auto w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight text-center">
              Delete Permanently?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 text-slate-500 text-xs font-medium leading-relaxed px-2">
            You are about to permanently delete{' '}
            <span className="font-bold text-slate-800">"{confirmTarget?.row.label}"</span>.
            {confirmTarget?.type === 'program' && ' Its photos, timeline entries, and handouts will be deleted too.'}
            {confirmTarget?.type === 'material' && ' Its files will be deleted too.'}
            {' '}This cannot be undone.
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button variant="ghost" onClick={() => setConfirmTarget(null)} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider text-slate-500 bg-slate-50 hover:bg-slate-100">
              Cancel
            </Button>
            <Button onClick={handlePermanentDelete} disabled={isDeleting} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider bg-rose-600 hover:bg-rose-700 text-white shadow-md">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete Permanently'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
