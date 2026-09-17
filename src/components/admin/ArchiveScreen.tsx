import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/use-toast';
import { logActivity } from '../../lib/activityLog';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  Archive as ArchiveIcon,
  Calendar,
  FileStack,
  ClipboardList,
  Users,
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
  image_url?: string | null;
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

  const fetchArchived = async () => {
    setLoading(true);
    try {
      const [programsRes, materialsRes, surveysRes, usersRes] = await Promise.all([
        supabase.from('programs').select('id, title, archived_at').not('archived_at', 'is', null),
        supabase.from('materials').select('id, title, archived_at, file_url, image_url').not('archived_at', 'is', null),
        supabase.from('surveys').select('id, title, archived_at').not('archived_at', 'is', null),
        supabase.from('users').select('id, name, email, archived_at').not('archived_at', 'is', null),
      ]);

      if (programsRes.error) throw programsRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (surveysRes.error) throw surveysRes.error;
      if (usersRes.error) throw usersRes.error;

      const sortByArchivedDesc = (a: ArchivedRow, b: ArchivedRow) =>
        new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime();

      setRows({
        program: (programsRes.data || [])
          .map((p: any) => ({ id: p.id, label: p.title, archived_at: p.archived_at }))
          .sort(sortByArchivedDesc),
        material: (materialsRes.data || [])
          .map((m: any) => ({ id: m.id, label: m.title, archived_at: m.archived_at, file_url: m.file_url, image_url: m.image_url }))
          .sort(sortByArchivedDesc),
        survey: (surveysRes.data || [])
          .map((s: any) => ({ id: s.id, label: s.title, archived_at: s.archived_at }))
          .sort(sortByArchivedDesc),
        user: (usersRes.data || [])
          .map((u: any) => ({ id: u.id, label: u.name || u.email, archived_at: u.archived_at }))
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

      logActivity({ actorEmail: authUser?.email, actorName: userName, action: 'update', entityType: type, entityId: row.id, entityLabel: row.label, details: 'Restored from Archive' });

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
        const { error } = await supabase.from(tableName(type)).delete().eq('id', row.id);
        if (error) throw error;

        if (type === 'material') {
          // Best-effort — the row is already gone either way, so a
          // storage hiccup here just leaves an orphaned file, not a
          // broken material shown to anyone.
          const storageUrls = [...new Set([row.file_url, row.image_url].filter(Boolean))] as string[];
          for (const url of storageUrls) {
            const parsed = parseStorageUrl(url);
            if (!parsed) continue;
            const { error: storageError } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
            if (storageError) console.warn('Storage cleanup failed for', url, storageError.message);
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
                {sectionRows.map((row) => (
                  <Card key={row.id} className="p-4 rounded-2xl border-none shadow-sm bg-white flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{row.label}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        Archived {new Date(row.archived_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(type, row)}
                        className="h-9 rounded-xl font-black uppercase text-[10px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setConfirmTarget({ type, row })}
                        className="h-9 rounded-xl font-black uppercase text-[10px] bg-rose-600 hover:bg-rose-700 text-white"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Permanently
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}

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
            <span className="font-bold text-slate-800">"{confirmTarget?.row.label}"</span>. This cannot be undone.
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
