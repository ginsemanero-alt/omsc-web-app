import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import NotificationSettings from './NotificationSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  adminPost,
  fetchRetentionSettings,
  formatDay,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  type RetentionSettings,
} from '../../lib/retention';

interface Preview {
  content: {
    programs: { archived: number; due: number };
    materials: { archived: number; due: number };
    surveys: { archived: number; due: number; keptHasResponses: number };
  };
  students: { archived: number; due: number };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function PrivacySettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<RetentionSettings | null>(null);

  const [contentOn, setContentOn] = useState(false);
  const [contentDays, setContentDays] = useState('');
  const [studentsOn, setStudentsOn] = useState(false);
  const [studentsDays, setStudentsDays] = useState('');
  const [dpoName, setDpoName] = useState('');
  const [dpoEmail, setDpoEmail] = useState('');

  const [formError, setFormError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const s = await fetchRetentionSettings();
      setSaved(s);
      setContentOn(!!s?.archived_content_days);
      setContentDays(s?.archived_content_days ? String(s.archived_content_days) : '');
      setStudentsOn(!!s?.archived_students_days);
      setStudentsDays(s?.archived_students_days ? String(s.archived_students_days) : '');
      setDpoName(s?.dpo_name || '');
      setDpoEmail(s?.dpo_email || '');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not load the settings', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseDays = (on: boolean, text: string, label: string): number | null | 'bad' => {
    if (!on) return null;
    const n = Number(text);
    if (!Number.isInteger(n) || n < MIN_RETENTION_DAYS || n > MAX_RETENTION_DAYS) {
      setFormError(`${label}: enter a whole number of days from ${MIN_RETENTION_DAYS} to ${MAX_RETENTION_DAYS}, or choose Off.`);
      return 'bad';
    }
    return n;
  };

  const body = () => {
    const c = parseDays(contentOn, contentDays, 'Archived content');
    if (c === 'bad') return null;
    const s = parseDays(studentsOn, studentsDays, 'Archived student accounts');
    if (s === 'bad') return null;
    return { archivedContentDays: c, archivedStudentsDays: s, dpoName: dpoName.trim(), dpoEmail: dpoEmail.trim() };
  };

  const dirty = () => {
    const b = body();
    if (!b || !saved) return true;
    return (
      (saved.archived_content_days || null) !== b.archivedContentDays ||
      (saved.archived_students_days || null) !== b.archivedStudentsDays ||
      (saved.dpo_name || '') !== b.dpoName ||
      (saved.dpo_email || '') !== b.dpoEmail
    );
  };

  // Step 1: check the form, then show what saving would do right now.
  const review = async () => {
    setFormError('');
    const b = body();
    if (!b) return;
    if (!dirty()) {
      toast({ title: 'No changes', description: 'These are already the saved settings.' });
      return;
    }
    setChecking(true);
    try {
      setPreview(await adminPost<Preview>('/api/admin/retention-preview', b));
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setChecking(false);
    }
  };

  // Step 2: the administrator confirmed.
  const confirmSave = async () => {
    const b = body();
    if (!b) return;
    setSaving(true);
    try {
      await adminPost('/api/admin/retention-settings', b);
      setPreview(null);
      await load();
      toast({ title: 'Settings saved', description: 'The change was recorded in the Activity Log.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const c = parseInt(contentDays, 10);
  const s = parseInt(studentsDays, 10);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase mb-1">
          <ShieldCheck className="inline w-7 h-7 mr-2 -mt-1 text-indigo-600" />
          Privacy &amp; Retention
        </h1>
        <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">
          How long archived items are kept &middot; shown to students in the Privacy Notice
        </p>
      </div>

      {loading ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2">
          <Loader2 className="animate-spin text-indigo-600" />
          <span className="text-[10px] font-black uppercase text-slate-400">Loading...</span>
        </div>
      ) : (
        <>
          <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Archived content</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Programs, IEC materials and surveys you archive. When a number of days is set, an archived item is permanently
              deleted that many days after it was archived, together with its files and videos. A survey that has responses is
              never deleted automatically. Restoring an item before its date cancels the removal.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="radio" name="content" checked={!contentOn} onChange={() => setContentOn(false)} /> Off — keep until I remove it
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="radio" name="content" checked={contentOn} onChange={() => setContentOn(true)} /> Remove after
              </label>
              <Input
                type="number"
                inputMode="numeric"
                min={MIN_RETENTION_DAYS}
                max={MAX_RETENTION_DAYS}
                value={contentDays}
                disabled={!contentOn}
                onChange={(e) => setContentDays(e.target.value)}
                aria-label="Days before archived content is removed"
                className="w-28 bg-white"
              />
              <span className="text-sm font-bold text-slate-700">days</span>
            </div>
          </Card>

          <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Archived student accounts</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              When a number of days is set, an archived student account is anonymized that many days after it was archived:
              the name, email, student ID and contact details are removed and cannot be recovered. Answers and combined
              statistics keep counting, with no name attached. Administrator accounts are never removed this way.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="radio" name="students" checked={!studentsOn} onChange={() => setStudentsOn(false)} /> Off — keep until I anonymize
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="radio" name="students" checked={studentsOn} onChange={() => setStudentsOn(true)} /> Anonymize after
              </label>
              <Input
                type="number"
                inputMode="numeric"
                min={MIN_RETENTION_DAYS}
                max={MAX_RETENTION_DAYS}
                value={studentsDays}
                disabled={!studentsOn}
                onChange={(e) => setStudentsDays(e.target.value)}
                aria-label="Days before an archived student account is anonymized"
                className="w-28 bg-white"
              />
              <span className="text-sm font-bold text-slate-700">days</span>
            </div>
          </Card>

          <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Data Protection Officer</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Shown in the Privacy Notice under &ldquo;Who to contact&rdquo;. Leave empty if there is none yet; nothing is shown then.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-600 space-y-1">
                Name
                <Input value={dpoName} onChange={(e) => setDpoName(e.target.value)} maxLength={200} className="bg-white" />
              </label>
              <label className="text-xs font-bold text-slate-600 space-y-1">
                Email
                <Input type="email" value={dpoEmail} onChange={(e) => setDpoEmail(e.target.value)} maxLength={254} className="bg-white" />
              </label>
            </div>
          </Card>

          {formError && (
            <p role="alert" className="text-sm font-bold text-rose-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {formError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={review} disabled={checking} className="h-11 rounded-xl font-black uppercase text-[11px] tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Review and save'}
            </Button>
            {saved?.retention_updated_at && (
              <span className="text-xs text-slate-400 font-bold">Retention last saved {formatDay(saved.retention_updated_at)}</span>
            )}
          </div>
        </>
      )}

      <NotificationSettings />

      <Dialog open={!!preview} onOpenChange={(open) => !open && !saving && setPreview(null)}>
        <DialogContent className="max-w-lg bg-white rounded-[2rem] p-6 border-none shadow-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">Confirm these settings</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="mt-2 space-y-4 text-sm text-slate-600 leading-relaxed">
              <div>
                <p className="font-bold text-slate-800">Archived content</p>
                {contentOn ? (
                  <>
                    <p>
                      Items are permanently deleted {c} days after they were archived (files and videos included). This cannot be undone.
                    </p>
                    <p className="mt-1">
                      Right now this affects{' '}
                      <strong>
                        {plural(preview.content.programs.due, 'program')}, {plural(preview.content.materials.due, 'material')} and{' '}
                        {plural(preview.content.surveys.due, 'survey')}
                      </strong>{' '}
                      of the {preview.content.programs.archived + preview.content.materials.archived + preview.content.surveys.archived}{' '}
                      archived. They are removed at the next daily cleanup (about 3:00 AM).
                      {preview.content.surveys.keptHasResponses > 0 &&
                        ` ${plural(preview.content.surveys.keptHasResponses, 'survey')} with responses will be kept.`}
                    </p>
                  </>
                ) : (
                  <p>Off. Archived content is kept until you delete it yourself.</p>
                )}
              </div>
              <div>
                <p className="font-bold text-slate-800">Archived student accounts</p>
                {studentsOn ? (
                  <>
                    <p>
                      Accounts are anonymized {s} days after they were archived. The name, email, student ID and contact details are
                      removed for good; combined statistics keep counting.
                    </p>
                    <p className="mt-1">
                      Right now this affects <strong>{plural(preview.students.due, 'student')}</strong> of the {preview.students.archived} archived,
                      at the next daily cleanup.
                    </p>
                  </>
                ) : (
                  <p>Off. Archived students are kept until you anonymize or delete them yourself.</p>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Anything you restore before its date is not removed. Every change to these settings is recorded in the Activity Log.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button variant="ghost" disabled={saving} onClick={() => setPreview(null)} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider text-slate-500 bg-slate-50 hover:bg-slate-100">
              Cancel
            </Button>
            <Button onClick={confirmSave} disabled={saving} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm and save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
