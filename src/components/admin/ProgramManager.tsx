import { useState, useEffect, useMemo, useRef, type DragEvent as ReactDragEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { compressImageFile } from '../../lib/imageCompress';
import { logActivity } from '../../lib/activityLog';
import { notifyStudents } from '../../lib/notifyStudents';
import { formatProgramDate } from '../../lib/formatProgramDate';
import { CAMPUSES, ALL_CAMPUSES_LABEL, campusLabel } from '../../lib/campuses';
import { getEffectiveProgramStatus, compareProgramsForDisplay } from '../../lib/programStatus';
import ProgramEntryTimeline from '../shared/ProgramEntryTimeline';
import PhotoViewer, { collectProgramPhotos, viewerAt, type PhotoViewerState } from '../shared/PhotoViewer';
import { useAuth } from '../../hooks/useAuth';
import { usePagination } from '../../hooks/usePagination';
import { PaginationControls } from '../../components/ui/pagination-controls';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useToast } from '../../hooks/use-toast';
import { Textarea } from '../../components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import {
  Plus, Search, Edit, Trash2,
  Loader2, Camera, ChevronDown, ChevronUp, AlertCircle, Eye,
  Star, X
} from 'lucide-react';

// One photo in the program's cover + gallery list. `file` is set until
// it's uploaded; `url` is then a local blob preview.
type CoverPhoto = { url: string; file?: File };

const PROGRAMS_PAGE_SIZE = 8;

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

// A request from the Content page header (New program) or its
// "Needs attention" list (open one program). n changes on every request.
type OpenRequest = { n: number; id?: number };

interface ProgramManagementProps {
  newRequest?: OpenRequest | null;
  editRequest?: OpenRequest | null;
  onChanged?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  upcoming: { label: 'Upcoming', className: 'bg-[#FEF3C7] text-[#92400E]' },
  ongoing: { label: 'Ongoing', className: 'bg-[#D1FAE5] text-[#065F46]' },
  completed: { label: 'Completed', className: 'bg-[#E2E8F0] text-[#1E293B]' },
};

const CHECK_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-[#D1FAE5] text-[#065F46]' },
  draft: { label: 'Draft', className: 'bg-[#FEF3C7] text-[#92400E]' },
  closed: { label: 'Closed', className: 'bg-[#E2E8F0] text-[#1E293B]' },
  none: { label: 'None', className: 'bg-[#F1F5F9] text-[#64748B]' },
};

export default function ProgramManagement({ newRequest, editRequest, onChanged }: ProgramManagementProps = {}) {
  const { toast } = useToast();
  const { user, userName } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [programs, setPrograms] = useState<any[]>([]);
  const [checkStatusByProgram, setCheckStatusByProgram] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteTargetTitle, setDeleteTargetTitle] = useState('');

  // Cover + gallery, in order: the first photo is the cover shown on
  // cards everywhere, the rest are the gallery. Adding photos appends;
  // each can be removed or made the cover individually.
  const [coverPhotos, setCoverPhotos] = useState<CoverPhoto[]>([]);

  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');

  const [formData, setFormData] = useState({
    title: '',
    date: '',
    date_display: '',
    duration_label: '',
    location: '',
    program_component: 'Group Guidance',
    guidance_service: 'Career Orientation',
    capacity: 0,
    status: 'upcoming',
    image_url: '',
    content: '',
    campus: ''
  });

  // Entries (timeline) for whichever program is open in the dialog.
  // A new, unsaved program has no id to attach entries to yet, so its
  // entries are drafts held here (negative id, photos as local files +
  // blob preview URLs) and saved by handleSave right after the program.
  const [entries, setEntries] = useState<any[]>([]);
  const [entryLabel, setEntryLabel] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryCaption, setEntryCaption] = useState('');
  const [entryFiles, setEntryFiles] = useState<File[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [showStudentPreview, setShowStudentPreview] = useState(false);
  const entryFileInputRef = useRef<HTMLInputElement>(null);

  // Thumbnails for the photos picked in the entry form (not uploaded
  // until Add/Update entry), same idea as the cover photo grid.
  const entryFilePreviews = useMemo(() => entryFiles.map((file) => URL.createObjectURL(file)), [entryFiles]);
  useEffect(() => () => entryFilePreviews.forEach((url) => URL.revokeObjectURL(url)), [entryFilePreviews]);

  // Drag and drop for the cover photos and the entry photos: dropping
  // image files on either area adds them, same as choosing them.
  const [dragTarget, setDragTarget] = useState<'cover' | 'entry' | null>(null);

  const addCoverFiles = (files: File[]) => {
    if (files.length === 0) return;
    setCoverPhotos((previous) => [...previous, ...files.map((file) => ({ url: URL.createObjectURL(file), file }))]);
  };

  const addEntryFiles = (files: File[]) => {
    if (files.length > 0) setEntryFiles((previous) => [...previous, ...files]);
  };

  const dropZone = (target: 'cover' | 'entry', onFiles: (files: File[]) => void) => ({
    onDragOver: (e: ReactDragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dragTarget !== target) setDragTarget(target);
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragTarget(null);
    },
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      setDragTarget(null);
      const images = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
      if (images.length === 0) {
        toast({ variant: "destructive", title: "Images Only", description: "Drop image files (JPG, PNG, WebP, GIF)." });
        return;
      }
      onFiles(images);
    },
  });

  // While the dialog is open, a file dropped anywhere outside the two
  // drop areas must not make the browser open it (and lose the form).
  useEffect(() => {
    if (!isDialogOpen) return;
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const reset = () => setDragTarget(null);
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    window.addEventListener('dragend', reset);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
      window.removeEventListener('dragend', reset);
    };
  }, [isDialogOpen]);

  const isDateOccupied = programs.some(p =>
    p.date === formData.date &&
    getEffectiveProgramStatus(p) !== 'completed' &&
    p.id !== editingId
  );

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('programs')
        .select(`
          *,
          program_entries (
            id,
            label,
            description,
            caption,
            image_urls,
            sort_order
          )
        `)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPrograms(data || []);

      // Read-only: each program's knowledge check status, for the list.
      const { data: checks } = await supabase
        .from('surveys')
        .select('program_id, status')
        .eq('type', 'knowledge')
        .not('program_id', 'is', null)
        .is('archived_at', null);
      const byProgram: Record<number, string> = {};
      (checks || []).forEach((c: any) => { byProgram[c.program_id] = c.status; });
      setCheckStatusByProgram(byProgram);
      onChanged?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fetch Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPrograms(); }, []);

  // Header "New program" and "Needs attention" links open the dialog here.
  const handledRequests = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!newRequest || handledRequests.current.has(newRequest.n)) return;
    handledRequests.current.add(newRequest.n);
    handleOpenDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRequest]);
  useEffect(() => {
    if (!editRequest || handledRequests.current.has(editRequest.n)) return;
    const program = programs.find((p) => p.id === editRequest.id);
    if (!program) return; // waits for the list to load
    handledRequests.current.add(editRequest.n);
    handleOpenDialog(program);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest, programs]);

  const formatTo12h = (time24: string) => {
    if (!time24) return "";
    const [hour, minute] = time24.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minute} ${ampm}`;
  };

  const handleOpenDialog = (program?: any) => {
    // Unsaved drafts from a previously abandoned dialog are discarded.
    revokeDraftPreviews(entries);
    coverPhotos.forEach((photo) => photo.file && URL.revokeObjectURL(photo.url));

    if (program) {
      setEditingId(program.id);
      setFormData({
        title: program.title || '',
        date: program.date || '',
        date_display: program.date_display || '',
        duration_label: program.duration_label || '',
        location: program.location || '',
        program_component: program.program_component || 'Group Guidance',
        guidance_service: program.guidance_service || 'Career Orientation',
        capacity: program.capacity || 0,
        status: program.status || 'upcoming',
        image_url: program.image_url || '',
        content: program.content || '',
        campus: program.campus || ''
      });
      setCoverPhotos(
        [program.image_url, ...(program.gallery_urls || [])]
          .filter(Boolean)
          .map((url: string) => ({ url }))
      );
      setEntries(
        (program.program_entries || [])
          .slice()
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
      );

      if (program.time_range && program.time_range.includes(' - ')) {
        const parts = program.time_range.split(' - ');
        setStartTime(parts[0] || '08:00');
        setEndTime(parts[1] || '17:00');
      }
    } else {
      setEditingId(null);
      setFormData({
        title: '', date: '', date_display: '', duration_label: '', location: '',
        program_component: 'Group Guidance', guidance_service: 'Career Orientation',
        capacity: 0, status: 'upcoming', image_url: '', content: '', campus: ''
      });
      setCoverPhotos([]);
      setEntries([]);
      setStartTime('08:00');
      setEndTime('17:00');
    }
    setShowStudentPreview(false);
    resetEntryForm();
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    // An entry typed into the entry form but never "Add entry"-ed used to
    // be silently dropped on save. Include it instead — or stop if it
    // can't be (no label) rather than lose it.
    let entryList = entries;
    if (isEntryFormDirty()) {
      if (!entryLabel.trim()) {
        toast({
          variant: "destructive",
          title: "Unfinished Entry",
          description: "The entry form has content but no label. Add a label (e.g. \"Week 1\") or clear it before saving.",
        });
        return;
      }

      if (entryFormIsDraft()) {
        entryList = withEntryFormAsDraft(entries);
        setEntries(entryList);
        resetEntryForm();
      } else if (!(await handleSaveEntry())) {
        return;
      }
    }

    try {
      setLoading(true);

      // Upload any newly added cover/gallery photos, keeping the order
      // the admin arranged. Posters are displayed a few hundred px wide —
      // resizing to 1280px max before upload cuts typical uploads by
      // 80-90% with no visible quality loss at display size.
      const savedPhotos: CoverPhoto[] = [];
      for (const photo of coverPhotos) {
        if (!photo.file) {
          savedPhotos.push(photo);
          continue;
        }
        const uploadFile = await compressImageFile(photo.file);
        const path = `posters/${Date.now()}_${uploadFile.name}`;
        // Path always includes Date.now(), so the same URL can never point
        // to different content later — safe to cache for a full year
        // instead of Supabase's 1 hour default.
        const { error: uploadError } = await supabase.storage.from('program-posters').upload(path, uploadFile, { cacheControl: '31536000' });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('program-posters').getPublicUrl(path);
        URL.revokeObjectURL(photo.url);
        savedPhotos.push({ url: data.publicUrl });
      }
      // Uploaded ones are now plain saved photos, so a retry after a later
      // failure doesn't upload them again.
      setCoverPhotos(savedPhotos);

      // First photo is the cover shown everywhere (cards, thumbnails);
      // the rest are the gallery.
      const finalImageUrl = savedPhotos[0]?.url ?? null;
      const finalGalleryUrls = savedPhotos.slice(1).map((photo) => photo.url);

      const combinedTime = `${formatTo12h(startTime)} - ${formatTo12h(endTime)}`;
      
      const payload = {
        title: formData.title,
        date: formData.date,
        date_display: formData.date_display.trim() || null,
        duration_label: formData.duration_label.trim() || null,
        location: formData.location,
        program_component: formData.program_component,
        guidance_service: formData.guidance_service,
        capacity: Number(formData.capacity),
        status: formData.status,
        image_url: finalImageUrl,
        gallery_urls: finalGalleryUrls.length > 0 ? finalGalleryUrls : null,
        content: formData.content,
        time_range: combinedTime,
        campus: formData.campus || null
      };

      let currentProgramId = editingId;
      let isNewProgram = false;

      if (editingId) {
        const { error } = await supabase.from('programs').update(payload).eq('id', editingId);
        if (error) throw error;
        logActivity({ actorEmail: user?.email, actorName: userName, action: 'update', entityType: 'program', entityId: editingId, entityLabel: payload.title });
      } else {
        const { data, error } = await supabase.from('programs').insert([payload]).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Failed to capture generated record primary key.");
        currentProgramId = data[0].id;
        isNewProgram = true;
        // From here on this dialog is editing the saved program, so if a
        // step below fails, pressing save again updates it instead of
        // creating a duplicate.
        setEditingId(currentProgramId);
        logActivity({ actorEmail: user?.email, actorName: userName, action: 'create', entityType: 'program', entityId: currentProgramId, entityLabel: payload.title });
      }

      // Draft entries added before the program existed. Students are
      // notified only after this, so a new program first appears with
      // its timeline already in place.
      try {
        if (currentProgramId) await saveDraftEntries(currentProgramId, entryList);
      } finally {
        if (isNewProgram) notifyStudents('program', payload.title, payload.content);
      }

      toast({ title: "Success", description: "Program metrics and structural items synced without cache conflicts." });
      setIsDialogOpen(false);
      fetchPrograms();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ENTRIES (timeline) — a separate, ordered set of sub-records under one
  // program (e.g. "Week 1", "Week 2" of a month-long campaign), each with
  // its own photos. For a saved program each entry is written as soon as
  // it's added. For a new program they're drafts (id < 0) until
  // handleSave creates the program and calls saveDraftEntries. A program
  // with zero entries saves exactly as it always has.
  const isDraftEntry = (entry: any) => entry.id < 0;

  const uploadEntryPhotos = async (files: File[]) => {
    const urls: string[] = [];
    for (const file of files) {
      // Same bucket and path convention the poster upload uses — no new
      // bucket, no new storage policy needed.
      const uploadFile = await compressImageFile(file);
      const path = `posters/${Date.now()}_${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage.from('program-posters').upload(path, uploadFile, { cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('program-posters').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const revokeDraftPreviews = (list: any[]) => {
    list
      .filter(isDraftEntry)
      .forEach((entry) => (entry.image_urls || []).forEach((url: string) => URL.revokeObjectURL(url)));
  };

  // Saves every draft entry, in list order, under programId. Each one is
  // swapped for its saved row as soon as it's written, so a failure part
  // way through leaves only the unsaved ones as drafts for a retry.
  const saveDraftEntries = async (programId: number, list: any[] = entries) => {
    for (let index = 0; index < list.length; index++) {
      const draft = list[index];
      if (!isDraftEntry(draft)) continue;

      const imageUrls = await uploadEntryPhotos(draft.pending_files || []);
      const { data, error } = await supabase
        .from('program_entries')
        .insert([{
          program_id: programId,
          label: draft.label,
          description: draft.description,
          caption: draft.caption,
          image_urls: imageUrls.length > 0 ? imageUrls : null,
          sort_order: index,
        }])
        .select();

      if (error) throw new Error(`Program saved, but entry "${draft.label}" failed: ${error.message}`);

      revokeDraftPreviews([draft]);
      setEntries((previous) => previous.map((entry) => (entry.id === draft.id ? data[0] : entry)));
    }
  };

  const isEntryFormDirty = () =>
    Boolean(entryLabel.trim() || entryDescription.trim() || entryCaption.trim() || entryFiles.length > 0);

  // Removes one photo from an entry. A draft's photos are still local
  // (image_urls[i] is the preview of pending_files[i]); a saved entry is
  // updated right away.
  const handleRemoveEntryPhoto = async (entry: any, photoIndex: number) => {
    const keep = (_: unknown, i: number) => i !== photoIndex;

    if (isDraftEntry(entry)) {
      URL.revokeObjectURL(entry.image_urls[photoIndex]);
      setEntries(entries.map((e) =>
        e.id === entry.id
          ? { ...e, image_urls: e.image_urls.filter(keep), pending_files: (e.pending_files || []).filter(keep) }
          : e
      ));
      return;
    }

    const remaining = (entry.image_urls || []).filter(keep);
    const { data, error } = await supabase
      .from('program_entries')
      .update({ image_urls: remaining.length > 0 ? remaining : null })
      .eq('id', entry.id)
      .select();

    if (error) {
      toast({ variant: "destructive", title: "Photo Not Removed", description: error.message });
      return;
    }
    setEntries(entries.map((e) => (e.id === entry.id ? data[0] : e)));
  };

  const resetEntryForm = () => {
    setEditingEntryId(null);
    setEntryLabel('');
    setEntryDescription('');
    setEntryCaption('');
    setEntryFiles([]);
    if (entryFileInputRef.current) entryFileInputRef.current.value = '';
  };

  // An entry that was saved with only text and no photos — a common
  // slip — is not a dead end: clicking it here loads it back into this
  // same form, and any newly-chosen photos are added on top of whatever
  // it already has, not swapped in for them.
  const handleEditEntryClick = (entry: any) => {
    setEditingEntryId(entry.id);
    setEntryLabel(entry.label || '');
    setEntryDescription(entry.description || '');
    setEntryCaption(entry.caption || '');
    setEntryFiles([]);
    if (entryFileInputRef.current) entryFileInputRef.current.value = '';
  };

  // Draft (new program, or an entry still waiting to be saved): kept
  // locally — nothing is uploaded until the program is saved. Returns
  // the entry list with the entry form applied as a draft.
  const withEntryFormAsDraft = (list: any[]) => {
    const previews = entryFiles.map((file) => URL.createObjectURL(file));
    const fields = {
      label: entryLabel.trim(),
      description: entryDescription.trim() || null,
      caption: entryCaption.trim() || null,
    };

    if (editingEntryId) {
      return list.map((entry) =>
        entry.id === editingEntryId
          ? {
              ...entry,
              ...fields,
              image_urls: [...(entry.image_urls || []), ...previews],
              pending_files: [...(entry.pending_files || []), ...entryFiles],
            }
          : entry
      );
    }

    return [
      ...list,
      {
        id: -Date.now(),
        ...fields,
        image_urls: previews,
        pending_files: entryFiles,
        sort_order: list.length,
      },
    ];
  };

  const entryFormIsDraft = () => {
    const editingEntry = entries.find((e) => e.id === editingEntryId);
    return !editingId || Boolean(editingEntry && isDraftEntry(editingEntry));
  };

  // Returns whether the entry was saved (or kept as a draft).
  const handleSaveEntry = async (): Promise<boolean> => {
    if (!entryLabel.trim()) {
      toast({ variant: "destructive", title: "Label required", description: "Give this entry a label, e.g. \"Week 1\"." });
      return false;
    }

    if (entryFormIsDraft()) {
      setEntries(withEntryFormAsDraft(entries));
      toast({
        title: editingEntryId ? "Entry updated" : "Entry added",
        description: "It will be saved with the program.",
      });
      resetEntryForm();
      return true;
    }

    try {
      setIsSavingEntry(true);

      const newImageUrls = await uploadEntryPhotos(entryFiles);

      if (editingEntryId) {
        const existing = entries.find((e) => e.id === editingEntryId);
        const combinedImageUrls = [...(existing?.image_urls || []), ...newImageUrls];

        const { data, error } = await supabase
          .from('program_entries')
          .update({
            label: entryLabel.trim(),
            description: entryDescription.trim() || null,
            caption: entryCaption.trim() || null,
            image_urls: combinedImageUrls.length > 0 ? combinedImageUrls : null,
          })
          .eq('id', editingEntryId)
          .select();

        if (error) throw error;

        setEntries(entries.map((e) => (e.id === editingEntryId ? data[0] : e)));
        toast({ title: "Entry updated" });
      } else {
        const { data, error } = await supabase
          .from('program_entries')
          .insert([{
            program_id: editingId,
            label: entryLabel.trim(),
            description: entryDescription.trim() || null,
            caption: entryCaption.trim() || null,
            image_urls: newImageUrls.length > 0 ? newImageUrls : null,
            sort_order: entries.length,
          }])
          .select();

        if (error) throw error;

        setEntries([...entries, data[0]]);
        toast({ title: "Entry added" });
      }

      resetEntryForm();
      return true;
    } catch (err: any) {
      toast({ variant: "destructive", title: "Entry Error", description: err.message });
      return false;
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    const target = entries.find((e) => e.id === entryId);
    if (target && isDraftEntry(target)) {
      revokeDraftPreviews([target]);
      setEntries(entries.filter((e) => e.id !== entryId));
      if (editingEntryId === entryId) resetEntryForm();
      return;
    }

    try {
      const { error } = await supabase.from('program_entries').delete().eq('id', entryId);
      if (error) throw error;
      setEntries(entries.filter((e) => e.id !== entryId));
      if (editingEntryId === entryId) resetEntryForm();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete Error", description: err.message });
    }
  };

  const handleMoveEntry = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= entries.length) return;

    const reordered = entries.slice();
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    // Persist new sort_order values for just the two swapped rows (drafts
    // get theirs when they're saved).
    try {
      await Promise.all(
        [index, targetIndex]
          .filter((i) => !isDraftEntry(reordered[i]))
          .map((i) => supabase.from('program_entries').update({ sort_order: i }).eq('id', reordered[i].id))
      );
      setEntries(reordered);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Reorder Error", description: err.message });
    }
  };

  const triggerDeleteConfirm = (id: number, title: string) => {
    setDeleteTargetId(id);
    setDeleteTargetTitle(title);
    setIsDeleteOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (!deleteTargetId) return;
    try {
      setLoading(true);
      // Archive, not delete — only the Archive screen can permanently
      // remove a program now.
      const { error } = await supabase.from('programs').update({ archived_at: new Date().toISOString() }).eq('id', deleteTargetId);
      if (error) throw error;
      logActivity({ actorEmail: user?.email, actorName: userName, action: 'delete', entityType: 'program', entityId: deleteTargetId, entityLabel: deleteTargetTitle, details: 'Archived' });

      toast({ title: "Archived", description: "Moved to Archive. Restore or permanently delete it from there." });
      setIsDeleteOpen(false);
      fetchPrograms();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredPrograms = programs
    .filter(p => p.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice()
    .sort(compareProgramsForDisplay);

  const {
    page: programsPage,
    setPage: setProgramsPage,
    totalPages: programsTotalPages,
    pageItems: pagedPrograms,
  } = usePagination(filteredPrograms, PROGRAMS_PAGE_SIZE);

  useEffect(() => {
    setProgramsPage(1);
  }, [searchQuery]);

  return (
    <div className="flex flex-col gap-5 w-full font-figtree text-[#1E293B]">

      {/* SEARCH (New program lives in the Content page header) */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
        <label htmlFor="program-search" className="sr-only">Search programs</label>
        <input
          id="program-search"
          type="search"
          placeholder="Search programs by title"
          className={`w-full h-[52px] pl-12 pr-4 rounded-2xl bg-white border-[1.5px] border-[#DDE1EE] text-[15px] text-[#1E293B] placeholder:text-[#8A91A6] ${focusRing}`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* PROGRAM LIST: a table from md up, cards below. */}
      <div className="rounded-[32px] bg-white overflow-hidden">
        <table className="hidden md:table w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#F5F6FB] text-left text-[#5B6477]">
              <th scope="col" className="py-4 pl-6 pr-3 font-semibold">Program</th>
              <th scope="col" className="py-4 px-3 font-semibold">Status</th>
              <th scope="col" className="py-4 px-3 font-semibold">Timeline</th>
              <th scope="col" className="py-4 px-3 font-semibold">Knowledge check</th>
              <th scope="col" className="py-4 pl-3 pr-6 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedPrograms.map((program) => {
              const effectiveStatus = getEffectiveProgramStatus(program);
              const statusBadge = STATUS_BADGE[effectiveStatus] || { label: effectiveStatus, className: 'bg-[#F1F5F9] text-[#475569]' };
              const checkBadge = CHECK_BADGE[checkStatusByProgram[program.id] || 'none'] || CHECK_BADGE.none;
              const entryCount = program.program_entries?.length || 0;
              const expanded = expandedId === program.id;
              const poster = program.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop';

              return (
                <FragmentRows key={program.id}>
                  <tr className="border-t border-[#EEF0FA] align-middle">
                    <td className="py-3.5 pl-6 pr-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => setPhotoViewer(viewerAt(collectProgramPhotos(program), poster, program.title))}
                          aria-label={`View photos of ${program.title}`}
                          className={`w-14 h-14 shrink-0 rounded-2xl overflow-hidden bg-[#E0E7FF] ${focusRing}`}
                        >
                          <img src={poster} alt="" className="w-full h-full object-cover" />
                        </button>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-bold text-[15px] text-[#1E1B4B] line-clamp-2">{program.title}</span>
                          <span className="text-[13px] text-[#5B6477]">
                            {formatProgramDate(program)}{program.duration_label && ` · ${program.duration_label}`} · {campusLabel(program.campus)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`inline-block px-[11px] py-[5px] rounded-full font-bold text-xs whitespace-nowrap ${statusBadge.className}`}>{statusBadge.label}</span>
                    </td>
                    <td className="py-3.5 px-3 text-[#334155] whitespace-nowrap">{entryCount} {entryCount === 1 ? 'entry' : 'entries'}</td>
                    <td className="py-3.5 px-3">
                      <span className={`inline-block px-[11px] py-[5px] rounded-full font-bold text-xs ${checkBadge.className}`}>{checkBadge.label}</span>
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : program.id)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Hide' : 'Show'} details of ${program.title}`}
                          className={`w-11 h-11 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white flex items-center justify-center text-[#1E1B4B] hover:border-[#A5B4FC] ${focusRing}`}
                        >
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDialog(program)}
                          aria-label={`Edit ${program.title}`}
                          className={`h-11 px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[13px] hover:border-[#A5B4FC] ${focusRing}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDeleteConfirm(program.id, program.title)}
                          aria-label={`Archive ${program.title}`}
                          className={`w-11 h-11 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white flex items-center justify-center text-rose-500 hover:border-rose-300 hover:bg-rose-50 ${focusRing}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-[#F5F6FB]/60">
                      <td colSpan={5} className="px-6 py-5">
                        <ProgramDetails program={program} />
                      </td>
                    </tr>
                  )}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>

        {/* Cards below md */}
        <ul className="md:hidden m-0 p-0 list-none divide-y divide-[#EEF0FA]">
          {pagedPrograms.map((program) => {
            const effectiveStatus = getEffectiveProgramStatus(program);
            const statusBadge = STATUS_BADGE[effectiveStatus] || { label: effectiveStatus, className: 'bg-[#F1F5F9] text-[#475569]' };
            const checkBadge = CHECK_BADGE[checkStatusByProgram[program.id] || 'none'] || CHECK_BADGE.none;
            const entryCount = program.program_entries?.length || 0;
            const expanded = expandedId === program.id;
            const poster = program.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop';
            return (
              <li key={program.id} className="p-4 flex flex-col gap-3">
                <div className="flex gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setPhotoViewer(viewerAt(collectProgramPhotos(program), poster, program.title))}
                    aria-label={`View photos of ${program.title}`}
                    className={`w-16 h-16 shrink-0 rounded-2xl overflow-hidden bg-[#E0E7FF] ${focusRing}`}
                  >
                    <img src={poster} alt="" className="w-full h-full object-cover" />
                  </button>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-bold text-[15px] text-[#1E1B4B] break-words">{program.title}</span>
                    <span className="text-[13px] text-[#5B6477]">{formatProgramDate(program)} · {campusLabel(program.campus)}</span>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${statusBadge.className}`}>{statusBadge.label}</span>
                      <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${checkBadge.className}`}>Check: {checkBadge.label}</span>
                    </div>
                    <span className="text-[13px] text-[#5B6477]">
                      {entryCount} timeline {entryCount === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : program.id)}
                    aria-expanded={expanded}
                    className={`flex-1 h-11 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[13px] flex items-center justify-center gap-1.5 ${focusRing}`}
                  >
                    Details {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenDialog(program)}
                    className={`flex-1 h-11 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[13px] ${focusRing}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDeleteConfirm(program.id, program.title)}
                    aria-label={`Archive ${program.title}`}
                    className={`w-11 h-11 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white flex items-center justify-center text-rose-500 ${focusRing}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {expanded && <ProgramDetails program={program} />}
              </li>
            );
          })}
        </ul>

        {pagedPrograms.length === 0 && (
          <p className="m-0 px-6 py-10 text-center text-[15px] text-[#5B6477]">
            {loading ? 'Loading programs...' : searchQuery ? 'No programs match your search.' : 'No programs yet.'}
          </p>
        )}
      </div>

      <PaginationControls
        variant="admin"
        page={programsPage}
        totalPages={programsTotalPages}
        totalItems={filteredPrograms.length}
        pageSize={PROGRAMS_PAGE_SIZE}
        onPageChange={setProgramsPage}
        className="bg-white p-4 rounded-[24px]"
      />

      {/* CREATE MODAL */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-[2rem] p-5 md:p-8 max-h-[92vh] overflow-y-auto border-none shadow-2xl font-figtree text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="font-bricolage font-extrabold text-2xl md:text-3xl tracking-[-0.02em] text-[#1E1B4B]">
              {editingId ? 'Edit program' : 'New program'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-5 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold ml-1 text-slate-400">Poster &amp; photos</Label>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={(e) => {
                    addCoverFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }} />

                  {/* Drop area: drag image files here to add them. */}
                  <div
                    {...dropZone('cover', addCoverFiles)}
                    className={`relative rounded-xl md:rounded-2xl transition-shadow ${dragTarget === 'cover' ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
                  >
                  {dragTarget === 'cover' && (
                    <div className="absolute inset-0 z-10 rounded-xl md:rounded-2xl bg-indigo-50/90 border-2 border-dashed border-indigo-400 flex items-center justify-center pointer-events-none">
                      <span className="text-[13px] font-semibold text-indigo-600">Drop photos here</span>
                    </div>
                  )}
                  {coverPhotos.length === 0 ? (
                    <div onClick={() => fileInputRef.current?.click()} className="aspect-video bg-slate-50 hover:bg-slate-100/70 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden relative transition-colors">
                      <div className="text-center p-4">
                        <Camera className="mx-auto text-slate-300 mb-1 w-6 h-6"/>
                        <span className="text-[13px] font-semibold text-slate-400 block">Upload event poster</span>
                        <span className="text-[13px] font-bold text-slate-400 block mt-0.5">or drag photos here</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {coverPhotos.map((photo, index) => (
                        <div key={photo.url} className={`relative aspect-square rounded-xl overflow-hidden bg-slate-100 ${index === 0 ? 'ring-2 ring-indigo-500' : ''}`}>
                          <img src={photo.url} className="w-full h-full object-cover" alt="" />

                          {index === 0 ? (
                            <span className="absolute left-1 top-1 px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[13px] font-semibold">
                              Cover
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCoverPhotos((previous) => [previous[index], ...previous.filter((_, i) => i !== index)])}
                              className="absolute left-1 top-1 w-6 h-6 rounded-full bg-black/55 hover:bg-indigo-600 text-white flex items-center justify-center transition-colors"
                              aria-label="Make this the cover"
                              title="Make cover"
                            >
                              <Star className="w-3 h-3" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (photo.file) URL.revokeObjectURL(photo.url);
                              setCoverPhotos((previous) => previous.filter((_, i) => i !== index));
                            }}
                            className="absolute right-1 top-1 w-6 h-6 rounded-full bg-black/55 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                            aria-label="Remove photo"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>

                          {photo.file && (
                            <span className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-amber-950 text-[13px] font-semibold">
                              New
                            </span>
                          )}
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center text-slate-400 transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-[13px] font-semibold mt-1">Add</span>
                      </button>
                    </div>
                  )}
                  </div>

                  <p className="text-[13px] font-bold text-slate-400 ml-1 leading-relaxed">
                    The first photo is the cover shown on cards; the rest are the gallery. You can also drag photos in.
                    {' '}<Star className="inline w-2.5 h-2.5 -mt-0.5" /> makes a photo the cover. Changes apply when you save.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold ml-1 text-slate-400">Activity title</Label>
                  <Input value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-4 text-slate-700 text-sm focus-visible:ring-2 focus-visible:ring-[#A5B4FC]" placeholder="e.g., Mental Health Orientation" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">Extended description logistics</Label>
                <Textarea 
                  value={formData.content} 
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  placeholder="Outline full timeline coordinates, scope context information notes here..."
                  className="h-[150px] md:h-[210px] rounded-xl md:rounded-2xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] p-4 font-medium text-slate-600 text-xs md:text-sm resize-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] leading-relaxed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className={`text-[13px] font-semibold ml-1 ${isDateOccupied ? 'text-rose-500' : 'text-slate-400'}`}>Target calendar date</Label>
                <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className={`rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-3 text-xs text-slate-700 transition-all focus-visible:ring-2 focus-visible:ring-[#A5B4FC] ${isDateOccupied ? 'ring-2 ring-rose-500 bg-rose-50/60' : ''}`} />
                {isDateOccupied && <p className="text-[13px] text-rose-500 font-semibold flex items-center gap-1 ml-1 animate-bounce"><AlertCircle className="w-3 h-3 shrink-0" /> Date occupied</p>}
                <Label className="text-[13px] font-semibold ml-1 text-slate-400 block pt-1">Display date (optional)</Label>
                <Input value={formData.date_display} onChange={(e) => setFormData({...formData, date_display: e.target.value})} placeholder="e.g. February 18-19, 2026" className="rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-3 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-[#A5B4FC]" />
                <Label className="text-[13px] font-semibold ml-1 text-slate-400 block pt-1">Duration label (optional)</Label>
                <Input value={formData.duration_label} onChange={(e) => setFormData({...formData, duration_label: e.target.value})} placeholder="e.g. 1 Month" className="rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-3 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-[#A5B4FC]" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">Start event</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-3 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-[#A5B4FC]" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">End session</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-3 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-[#A5B4FC]" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">Program component</Label>
                <select value={formData.program_component} onChange={(e) => setFormData({...formData, program_component: e.target.value})} className="w-full h-12 rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] px-4 font-bold text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  <option value="Group Guidance">Group Guidance</option>
                  <option value="Individual Student Planning">Individual Student Planning</option>
                  <option value="Responsive Services">Responsive Services</option>
                  <option value="System Support">System Support</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">Guidance service</Label>
                <select value={formData.guidance_service} onChange={(e) => setFormData({...formData, guidance_service: e.target.value})} className="w-full h-12 rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] px-4 font-bold text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  <option value="Information Services">Information Services</option>
                  <option value="Individual Inventory">Individual Inventory</option>
                  <option value="Research and Evaluation">Research and Evaluation</option>
                  <option value="Career Orientation">Career Orientation</option>
                  <option value="Testing Services">Testing Services</option>
                  <option value="Counseling Services">Counseling Services</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">Location venue anchor</Label>
                <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} className="rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-4 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-[#A5B4FC]" placeholder="e.g., Campus Gym / Social Hall" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">Seat capacity limit</Label>
                <Input type="number" value={formData.capacity} onChange={(e) => setFormData({...formData, capacity: Number(e.target.value)})} className="rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-bold px-4 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-[#A5B4FC]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold ml-1 text-slate-400">Campus</Label>
              <select value={formData.campus} onChange={(e) => setFormData({...formData, campus: e.target.value})} className="w-full h-12 rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] px-4 font-bold text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                <option value="">{ALL_CAMPUSES_LABEL}</option>
                {CAMPUSES.map((campus) => (
                  <option key={campus} value={campus}>{campus} only</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold ml-1 text-slate-400">Runtime status track</Label>
              <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} className="w-full h-12 rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] px-4 font-bold text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {/* ENTRIES (TIMELINE) — available while creating too: a new
                program's entries are drafts, saved together with it. */}
            <div className="space-y-3 border-t border-slate-100 pt-5">
              <div>
                <Label className="text-[13px] font-semibold ml-1 text-slate-400">Entries (timeline)</Label>
                <p className="text-[13px] text-slate-400 ml-1 mt-0.5">
                  For a multi-part program (e.g. a month-long campaign) — one entry per week, day, or milestone.
                  {!editingId && ' Entries you add here are saved when you publish the program.'}
                </p>
              </div>

              {entries.length > 0 && (
                <div className="space-y-2">
                  {entries.map((entry, index) => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-3 p-3 rounded-xl ${editingEntryId === entry.id ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-slate-50'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">
                          {entry.label}
                          {isDraftEntry(entry) && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[13px] font-semibold align-middle">
                              Not saved yet
                            </span>
                          )}
                        </p>
                        {entry.description && (
                          <p className="text-[13px] text-slate-500 line-clamp-2 mt-0.5">{entry.description}</p>
                        )}
                        {entry.image_urls?.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {entry.image_urls.map((url: string, photoIndex: number) => (
                              <div key={`${url}-${photoIndex}`} className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-200 shrink-0">
                                <img src={url} className="w-full h-full object-cover" alt="" />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEntryPhoto(entry, photoIndex)}
                                  className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                                  aria-label={`Remove photo ${photoIndex + 1} from ${entry.label}`}
                                  title="Remove photo"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[13px] font-bold text-amber-500 mt-0.5">No photos yet</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" onClick={() => handleMoveEntry(index, -1)} disabled={index === 0} className="text-slate-400 hover:text-indigo-600 disabled:opacity-20">
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleMoveEntry(index, 1)} disabled={index === entries.length - 1} className="text-slate-400 hover:text-indigo-600 disabled:opacity-20">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <button type="button" onClick={() => handleEditEntryClick(entry)} className="text-slate-400 hover:text-indigo-600 shrink-0" aria-label={`Edit ${entry.label}`}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDeleteEntry(entry.id)} className="text-slate-300 hover:text-rose-500 shrink-0" aria-label={`Delete ${entry.label}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={`p-4 bg-white border-2 border-dashed rounded-xl space-y-2 ${editingEntryId ? 'border-indigo-300' : 'border-slate-200'}`}>
                {editingEntryId && (
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-indigo-500">Editing entry</p>
                    <button type="button" onClick={resetEntryForm} className="text-[13px] font-semibold text-slate-400 hover:text-slate-600">
                      Cancel
                    </button>
                  </div>
                )}
                <Input value={entryLabel} onChange={(e) => setEntryLabel(e.target.value)} placeholder='Label, e.g. "Week 1"' className="rounded-lg bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-10 font-bold px-3 text-xs" />
                <Textarea value={entryDescription} onChange={(e) => setEntryDescription(e.target.value)} placeholder="Description (optional)" className="h-16 rounded-lg bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] p-3 text-xs resize-none" />
                <Input value={entryCaption} onChange={(e) => setEntryCaption(e.target.value)} placeholder="Caption (optional)" className="rounded-lg bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-10 font-bold px-3 text-xs" />
                {/* Photos: thumbnails like the cover grid. Picking more
                    adds to the selection instead of replacing it. */}
                <input
                  type="file"
                  ref={entryFileInputRef}
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    addEntryFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
                {/* Drop area: drag image files here to add them. */}
                <div
                  {...dropZone('entry', addEntryFiles)}
                  className={`relative rounded-xl transition-shadow ${dragTarget === 'entry' ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
                >
                {dragTarget === 'entry' && (
                  <div className="absolute inset-0 z-10 min-h-10 rounded-xl bg-indigo-50/90 border-2 border-dashed border-indigo-400 flex items-center justify-center pointer-events-none">
                    <span className="text-[13px] font-semibold text-indigo-600">Drop photos here</span>
                  </div>
                )}
                {(() => {
                  const editingEntry = editingEntryId !== null ? entries.find((e) => e.id === editingEntryId) : null;
                  const savedPhotos: string[] = editingEntry?.image_urls || [];

                  if (savedPhotos.length === 0 && entryFiles.length === 0) {
                    return (
                      <div onClick={() => entryFileInputRef.current?.click()} className="h-10 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center px-3 cursor-pointer text-slate-600 text-xs">
                        <Camera className="w-4 h-4 text-indigo-500 mr-2 shrink-0" />
                        <span className="truncate flex-1 font-bold">
                          {editingEntryId ? 'Add more photos...' : 'Choose photos...'}
                          <span className="font-medium text-slate-400"> or drag them here</span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {savedPhotos.map((url, photoIndex) => (
                          <div key={`saved-${url}-${photoIndex}`} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                            <img src={url} className="w-full h-full object-cover" alt="" />
                            <button
                              type="button"
                              onClick={() => handleRemoveEntryPhoto(editingEntry, photoIndex)}
                              className="absolute right-1 top-1 w-6 h-6 rounded-full bg-black/55 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                              aria-label={`Remove photo ${photoIndex + 1}`}
                              title="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}

                        {entryFilePreviews.map((url, fileIndex) => (
                          <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                            <img src={url} className="w-full h-full object-cover" alt="" />
                            <button
                              type="button"
                              onClick={() => setEntryFiles((previous) => previous.filter((_, i) => i !== fileIndex))}
                              className="absolute right-1 top-1 w-6 h-6 rounded-full bg-black/55 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                              aria-label={`Remove new photo ${fileIndex + 1}`}
                              title="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <span className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-amber-950 text-[13px] font-semibold">
                              New
                            </span>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => entryFileInputRef.current?.click()}
                          className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center text-slate-400 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                          <span className="text-[13px] font-semibold mt-1">Add</span>
                        </button>
                      </div>
                      {entryFiles.length > 0 && (
                        <p className="text-[13px] font-bold text-slate-400 ml-1">
                          New photos are added when you click {editingEntryId ? 'Update entry' : 'Add entry'}.
                        </p>
                      )}
                    </div>
                  );
                })()}
                </div>
                <Button type="button" onClick={handleSaveEntry} disabled={isSavingEntry} variant="outline" className="w-full h-10 rounded-lg font-semibold text-[13px]">
                  {isSavingEntry ? (
                    <Loader2 className="animate-spin h-4 w-4 mx-auto" />
                  ) : editingEntryId ? (
                    <><Edit className="w-3.5 h-3.5 mr-2" /> Update entry</>
                  ) : (
                    <><Plus className="w-3.5 h-3.5 mr-2" /> Add entry</>
                  )}
                </Button>
              </div>

              {/* Same rendering component the student's Programs page
                  uses — not a lookalike, the literal same one, so this
                  can never drift from what students actually see. */}
              {entries.length > 0 && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowStudentPreview(!showStudentPreview)}
                    className="w-full h-10 rounded-lg font-semibold text-[13px] text-indigo-600 hover:bg-indigo-50"
                  >
                    <Eye className="w-3.5 h-3.5 mr-2" />
                    {showStudentPreview ? 'Hide' : 'Preview as students see it'}
                  </Button>
                  {showStudentPreview && (
                    <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <ProgramEntryTimeline
                        entries={entries}
                        onImageClick={(url, title) =>
                          setPhotoViewer(viewerAt(collectProgramPhotos({ title: formData.title, program_entries: entries }), url, title))
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2">
              <Button onClick={handleSave} disabled={loading || isDateOccupied} className="w-full h-14 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-2xl font-bold text-[15px]">
                {loading ? <Loader2 className="animate-spin h-5 h-5 mx-auto" /> : isDateOccupied ? 'Date conflict: choose another date' : (editingId ? 'Save changes' : 'Publish program')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE MODAL */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md bg-white rounded-[2rem] p-6 border-none shadow-2xl font-sans text-center">
          <div className="mx-auto w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <DialogHeader><DialogTitle className="text-xl font-semibold text-slate-900 tracking-tight text-center">Move to archive?</DialogTitle></DialogHeader>
          <div className="mt-3 text-slate-500 text-xs font-medium leading-relaxed px-2">You are about to archive <span className="font-bold text-slate-800">"{deleteTargetTitle}"</span>. It will disappear from this list, but you can restore it or delete it permanently from the Archive screen.</div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)} className="h-12 rounded-xl font-semibold text-[13px] text-slate-500 bg-slate-50 hover:bg-slate-100">Cancel</Button>
            <Button onClick={handleExecuteDelete} className="h-12 rounded-xl font-semibold text-[13px] bg-rose-600 text-white shadow-md">Move to archive</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* POSTER / PHOTO PREVIEW — same viewer students get */}
      <PhotoViewer state={photoViewer} onChange={setPhotoViewer} />

    </div>
  );
}

// Groups a program's row and its optional details row in the table.
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// The expandable details of one program: its description.
function ProgramDetails({ program }: { program: any }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-[#5B6477]">Description</span>
      <p className="m-0 text-sm leading-relaxed text-[#334155] whitespace-pre-wrap">
        {program.content || 'No description yet.'}
      </p>
    </div>
  );
}
