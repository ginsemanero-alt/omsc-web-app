import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  Clock,
  Contact,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Facebook,
  MapPin,
  Phone,
  Plus,
  Save,
  Target,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../hooks/useAuth';
import { logActivity } from '../../lib/activityLog';
import {
  ABOUT_BUCKET,
  ABOUT_IMAGE_TYPES,
  ABOUT_IMAGE_TYPES_LABEL,
  DEFAULT_OBJECTIVES,
  aboutImageUrl,
  checkAboutImage,
  normalizeAboutContent,
  safeHttpsUrl,
  type AboutContent,
} from '../../lib/aboutContent';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';
const inputClass = `rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] h-12 font-semibold px-4 text-sm text-[#1E293B] ${focusRing}`;
const textareaClass = `rounded-xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] p-4 text-sm text-[#1E293B] resize-y ${focusRing}`;
const labelClass = 'text-sm font-semibold text-[#1E1B4B]';
const hintClass = 'm-0 text-[13px] text-[#5B6477]';

const MAX_OBJECTIVES = 6;

// Which section of the editor each field belongs to (the card titles below).
// Only these names go into the Activity Log, never the text itself.
type LoggedKey = keyof AboutContent;
const SECTION_OF_FIELD: Partial<Record<LoggedKey, string>> = {
  heading_title: 'Hero section',
  hero_intro: 'Hero section',
  hero_image_path: 'Hero section',
  vision: 'Vision and mission',
  mission: 'Vision and mission',
  director_name: 'Director / leadership',
  director_title: 'Director / leadership',
  collaborative_approach_text: 'Collaborative approach',
  objectives: 'Quality policy objectives',
  org_chart_path: 'Organizational chart',
  office_location: 'Visit us',
  office_hours: 'Visit us',
  system_credits: 'About this system',
  contact_email: 'Contact information',
  contact_facebook: 'Contact information',
  contact_facebook_url: 'Contact information',
  contact_phone: 'Contact information',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
}

const asComparable = (value: unknown) => (value === null || value === undefined ? '' : JSON.stringify(value));

interface SectionCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ icon: Icon, title, description, children }) => (
  <Card className="p-6 md:p-7 rounded-[28px] border-none shadow-none bg-white space-y-5">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#EEF0FA] text-[#4F46E5] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div>
        <h2 className="m-0 text-lg font-bold text-[#1E1B4B]">{title}</h2>
        <p className={`${hintClass} mt-0.5`}>{description}</p>
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </Card>
);

// A picture slot: choose, preview, replace, remove. Nothing is uploaded until
// "Save changes" (so one save is one logged change).
interface ImageFieldProps {
  id: string;
  label: string;
  hint: string;
  savedUrl: string | null;
  file: File | null;
  removed: boolean;
  onPick: (file: File | null) => void;
  onRemove: () => void;
  onUndo: () => void;
  error: string | null;
}

const ImageField: React.FC<ImageFieldProps> = ({ id, label, hint, savedUrl, file, removed, onPick, onRemove, onUndo, error }) => {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const shown = preview ?? (removed ? null : savedUrl);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={labelClass}>{label}</Label>
      <p className={hintClass}>{hint}</p>
      {shown ? (
        <div className="rounded-2xl bg-[#F5F6FB] p-3 flex flex-col sm:flex-row gap-3 sm:items-center">
          <img src={shown} alt="" className="w-full sm:w-44 h-32 object-contain rounded-xl bg-white" />
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={id}
              className={`min-h-[44px] px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-sm flex items-center cursor-pointer hover:border-[#A5B4FC] ${focusRing}`}
            >
              Replace image
            </label>
            <button
              type="button"
              onClick={onRemove}
              className={`min-h-[44px] px-4 rounded-xl border-[1.5px] border-[#FECDD3] bg-white text-[#BE123C] font-bold text-sm flex items-center gap-1.5 hover:bg-[#FFF1F2] ${focusRing}`}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove image
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-[1.5px] border-dashed border-[#C9CEE3] bg-[#F5F6FB] p-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className={hintClass}>{removed ? 'The image will be removed when you save.' : 'No image yet. This part stays hidden on the public page until you add one.'}</p>
          <div className="flex gap-2">
            {removed && (
              <button type="button" onClick={onUndo} className={`min-h-[44px] px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white font-bold text-sm text-[#1E1B4B] ${focusRing}`}>
                Undo
              </button>
            )}
            <label
              htmlFor={id}
              className={`min-h-[44px] px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm flex items-center gap-2 cursor-pointer ${focusRing}`}
            >
              <ImageIcon className="w-4 h-4" aria-hidden="true" /> Choose image
            </label>
          </div>
        </div>
      )}
      <input
        id={id}
        type="file"
        accept={ABOUT_IMAGE_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {error && <p role="alert" className="m-0 text-sm font-semibold text-[#BE123C]">{error}</p>}
    </div>
  );
};

const extOf = (file: File) => (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');

export default function AboutContentManager() {
  const { toast } = useToast();
  const { user, userName } = useAuth();

  const [content, setContent] = useState<AboutContent>(normalizeAboutContent(null));
  const [objectives, setObjectives] = useState<string[]>(DEFAULT_OBJECTIVES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // What is saved right now, to tell which sections an edit changed.
  const savedContent = useRef<AboutContent>(normalizeAboutContent(null));

  // Pending picture changes (applied on Save).
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroRemoved, setHeroRemoved] = useState(false);
  const [heroError, setHeroError] = useState<string | null>(null);
  const [chartFile, setChartFile] = useState<File | null>(null);
  const [chartRemoved, setChartRemoved] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('about_content').select('*').eq('id', 1).maybeSingle();

      if (error) {
        toast({ variant: 'destructive', title: 'Fetch Error', description: error.message });
      } else if (data) {
        const normalized = normalizeAboutContent(data as Record<string, unknown>);
        setContent(normalized);
        setObjectives(normalized.objectives ?? DEFAULT_OBJECTIVES);
        savedContent.current = normalized;
      }
      setLoading(false);
    };

    fetchContent();
  }, []);

  const field = <K extends keyof AboutContent>(key: K, value: AboutContent[K]) =>
    setContent((prev) => ({ ...prev, [key]: value }));

  const pickImage = (file: File | null, set: (f: File | null) => void, setRemoved: (r: boolean) => void, setError: (e: string | null) => void) => {
    if (!file) return;
    const problem = checkAboutImage(file);
    setError(problem);
    if (problem) return;
    set(file);
    setRemoved(false);
  };

  const moveObjective = (index: number, delta: number) =>
    setObjectives((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const handleSave = async () => {
    const facebookUrl = content.contact_facebook_url.trim();
    if (facebookUrl && !safeHttpsUrl(facebookUrl)) {
      toast({ variant: 'destructive', title: 'Check the Facebook link', description: 'The link must start with https:// (for example https://www.facebook.com/yourpage).' });
      return;
    }
    const cleanObjectives = objectives.map((o) => o.trim()).filter(Boolean).slice(0, MAX_OBJECTIVES);
    const objectivesValue = cleanObjectives.length === 0 || JSON.stringify(cleanObjectives) === JSON.stringify(DEFAULT_OBJECTIVES) ? null : cleanObjectives;

    const uploaded: string[] = [];
    try {
      setSaving(true);

      const upload = async (file: File, kind: 'hero' | 'org-chart') => {
        const path = `about/${kind}-${Date.now()}.${extOf(file)}`;
        const { error } = await supabase.storage.from(ABOUT_BUCKET).upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
        if (error) throw error;
        uploaded.push(path);
        return path;
      };

      const saved = savedContent.current;
      let heroPath: string | null = saved.hero_image_path;
      if (heroFile) heroPath = await upload(heroFile, 'hero');
      else if (heroRemoved) heroPath = null;
      let chartPath: string | null = saved.org_chart_path;
      if (chartFile) chartPath = await upload(chartFile, 'org-chart');
      else if (chartRemoved) chartPath = null;

      const emptyToNull = (value: string) => (value.trim() ? value.trim() : null);
      const updatedAt = new Date().toISOString();
      const row = {
        heading_title: content.heading_title.trim(),
        hero_intro: content.hero_intro.trim(),
        director_name: content.director_name.trim(),
        director_title: content.director_title.trim(),
        collaborative_approach_text: content.collaborative_approach_text.trim(),
        contact_email: content.contact_email.trim(),
        contact_facebook: content.contact_facebook.trim(),
        contact_phone: content.contact_phone.trim(),
        vision: emptyToNull(content.vision),
        mission: emptyToNull(content.mission),
        office_location: emptyToNull(content.office_location),
        office_hours: emptyToNull(content.office_hours),
        system_credits: emptyToNull(content.system_credits),
        contact_facebook_url: emptyToNull(content.contact_facebook_url),
        objectives: objectivesValue,
        hero_image_path: heroPath,
        org_chart_path: chartPath,
        updated_at: updatedAt,
      };

      const { error } = await supabase.from('about_content').update(row).eq('id', 1);
      if (error) throw error;

      // The row now points at the new pictures: the replaced / removed files can go.
      const stale = [
        saved.hero_image_path && saved.hero_image_path !== heroPath ? saved.hero_image_path : null,
        saved.org_chart_path && saved.org_chart_path !== chartPath ? saved.org_chart_path : null,
      ].filter((p): p is string => !!p);
      if (stale.length > 0) {
        const { error: removeError } = await supabase.storage.from(ABOUT_BUCKET).remove(stale);
        if (removeError) console.warn('About image cleanup failed:', removeError.message);
      }

      const next: AboutContent = normalizeAboutContent({ ...row, objectives: objectivesValue });
      const changedSections = Array.from(
        new Set(
          (Object.keys(SECTION_OF_FIELD) as LoggedKey[])
            .filter((key) => asComparable(next[key]) !== asComparable(saved[key]))
            .map((key) => SECTION_OF_FIELD[key] as string)
        )
      );
      savedContent.current = next;
      setContent(next);
      setObjectives(next.objectives ?? DEFAULT_OBJECTIVES);
      setHeroFile(null); setHeroRemoved(false); setChartFile(null); setChartRemoved(false);

      if (changedSections.length > 0) {
        logActivity({
          actorEmail: user?.email,
          actorName: userName,
          action: 'update',
          entityType: 'about',
          entityId: 1,
          entityLabel: 'About page',
          details: `Changed: ${changedSections.join(', ')}`,
        });
      }

      toast({ title: 'Saved', description: 'The About page has been updated.' });
    } catch (err: any) {
      // Nothing points at a picture that was uploaded for this failed save.
      if (uploaded.length > 0) await supabase.storage.from(ABOUT_BUCKET).remove(uploaded).catch(() => {});
      toast({ variant: 'destructive', title: 'Save Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const heroSavedUrl = aboutImageUrl(content.hero_image_path, content.updated_at);
  const chartSavedUrl = aboutImageUrl(content.org_chart_path, content.updated_at);
  const heroPreviewUrl = useMemo(() => (heroFile ? URL.createObjectURL(heroFile) : null), [heroFile]);
  useEffect(() => () => { if (heroPreviewUrl) URL.revokeObjectURL(heroPreviewUrl); }, [heroPreviewUrl]);
  const heroShown = heroPreviewUrl ?? (heroRemoved ? null : heroSavedUrl);

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2">
        <Loader2 className="animate-spin text-[#4F46E5]" aria-hidden="true" />
        <span className="text-sm font-semibold text-[#5B6477]">Loading the About page…</span>
      </div>
    );
  }

  const saveButton = (
    <Button onClick={handleSave} disabled={saving} className={`h-12 px-8 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm shrink-0 ${focusRing}`}>
      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> : <Save className="w-4 h-4 mr-2" aria-hidden="true" />}
      Save changes
    </Button>
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 max-w-[1400px] font-figtree text-[#1E293B]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-bricolage font-extrabold text-[36px] md:text-[44px] leading-[1.05] tracking-[-0.025em] text-[#1E1B4B]">
            About page
          </h1>
          <p className="m-0 text-base text-[#5B6477]">
            Edited here and shown on the public About page and the student About link. Empty optional parts are hidden.
          </p>
        </div>
        {saveButton}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">
        {/* FORM */}
        <div className="space-y-6">
          <SectionCard icon={FileText} title="Hero section" description="The big heading, intro paragraph, and an optional photo at the top">
            <div className="space-y-1.5">
              <Label htmlFor="about-heading" className={labelClass}>Heading</Label>
              <Input id="about-heading" value={content.heading_title} onChange={(e) => field('heading_title', e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="about-intro" className={labelClass}>Introduction</Label>
              <Textarea id="about-intro" value={content.hero_intro} onChange={(e) => field('hero_intro', e.target.value)} className={`min-h-[110px] ${textareaClass}`} />
            </div>
            <ImageField
              id="about-hero-image"
              label="Hero photo (optional)"
              hint={`Shown above the director card. ${ABOUT_IMAGE_TYPES_LABEL}, up to 5 MB. Hidden if empty.`}
              savedUrl={heroSavedUrl}
              file={heroFile}
              removed={heroRemoved}
              onPick={(f) => pickImage(f, setHeroFile, setHeroRemoved, setHeroError)}
              onRemove={() => { setHeroFile(null); setHeroRemoved(true); setHeroError(null); }}
              onUndo={() => setHeroRemoved(false)}
              error={heroError}
            />
          </SectionCard>

          <SectionCard icon={Target} title="Vision and mission" description="Two short statements. Leave one empty to hide it.">
            <div className="space-y-1.5">
              <Label htmlFor="about-vision" className={labelClass}>Vision</Label>
              <Textarea id="about-vision" value={content.vision} onChange={(e) => field('vision', e.target.value)} className={`min-h-[90px] ${textareaClass}`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="about-mission" className={labelClass}>Mission</Label>
              <Textarea id="about-mission" value={content.mission} onChange={(e) => field('mission', e.target.value)} className={`min-h-[90px] ${textareaClass}`} />
            </div>
          </SectionCard>

          <SectionCard icon={User} title="Director / leadership" description="Shown as the profile card beside the heading">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="about-director-name" className={labelClass}>Director name</Label>
                <Input id="about-director-name" value={content.director_name} onChange={(e) => field('director_name', e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="about-director-title" className={labelClass}>Director title</Label>
                <Input id="about-director-title" value={content.director_title} onChange={(e) => field('director_title', e.target.value)} className={inputClass} />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Contact} title="Collaborative approach" description="The text beside the list of services">
            <div className="space-y-1.5">
              <Label htmlFor="about-collab" className={labelClass}>Collaborative approach text</Label>
              <Textarea id="about-collab" value={content.collaborative_approach_text} onChange={(e) => field('collaborative_approach_text', e.target.value)} className={`min-h-[110px] ${textareaClass}`} />
            </div>
          </SectionCard>

          <SectionCard icon={BookOpenCheck} title="Quality policy objectives" description={`Up to ${MAX_OBJECTIVES}. If you remove them all, the standard three are shown.`}>
            <ol className="m-0 p-0 list-none space-y-3">
              {objectives.map((text, index) => (
                <li key={index} className="rounded-2xl bg-[#F5F6FB] p-3 flex flex-col gap-2">
                  <Label htmlFor={`about-objective-${index}`} className={labelClass}>Objective {index + 1}</Label>
                  <Textarea
                    id={`about-objective-${index}`}
                    value={text}
                    onChange={(e) => setObjectives((list) => list.map((o, i) => (i === index ? e.target.value : o)))}
                    className={`min-h-[80px] bg-white ${textareaClass}`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => moveObjective(index, -1)} disabled={index === 0} aria-label={`Move objective ${index + 1} up`} className={`min-w-[44px] min-h-[44px] rounded-xl border-[1.5px] border-[#DDE1EE] bg-white flex items-center justify-center disabled:opacity-40 ${focusRing}`}>
                      <ArrowUp className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => moveObjective(index, 1)} disabled={index === objectives.length - 1} aria-label={`Move objective ${index + 1} down`} className={`min-w-[44px] min-h-[44px] rounded-xl border-[1.5px] border-[#DDE1EE] bg-white flex items-center justify-center disabled:opacity-40 ${focusRing}`}>
                      <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setObjectives((list) => list.filter((_, i) => i !== index))} aria-label={`Remove objective ${index + 1}`} className={`min-h-[44px] px-4 rounded-xl border-[1.5px] border-[#FECDD3] bg-white text-[#BE123C] font-bold text-sm flex items-center gap-1.5 ${focusRing}`}>
                      <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setObjectives((list) => [...list, ''])}
              disabled={objectives.length >= MAX_OBJECTIVES}
              className={`min-h-[44px] px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white font-bold text-sm text-[#1E1B4B] flex items-center gap-1.5 disabled:opacity-40 hover:border-[#A5B4FC] ${focusRing}`}
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Add an objective
            </button>
          </SectionCard>

          <SectionCard icon={Users} title="Organizational chart" description="An image of the Center's structure. With no image, this section is not shown on the public page.">
            <ImageField
              id="about-org-chart"
              label="Organizational chart image"
              hint={`${ABOUT_IMAGE_TYPES_LABEL}, up to 5 MB. Visitors can open it and zoom in, so use a large, clear image.`}
              savedUrl={chartSavedUrl}
              file={chartFile}
              removed={chartRemoved}
              onPick={(f) => pickImage(f, setChartFile, setChartRemoved, setChartError)}
              onRemove={() => { setChartFile(null); setChartRemoved(true); setChartError(null); }}
              onUndo={() => setChartRemoved(false)}
              error={chartError}
            />
          </SectionCard>

          <SectionCard icon={MapPin} title="Visit us" description="Where to find the office and when it is open. Leave a field empty to hide it.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="about-location" className={labelClass}>Office location / room</Label>
                <Textarea id="about-location" value={content.office_location} onChange={(e) => field('office_location', e.target.value)} className={`min-h-[80px] ${textareaClass}`} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="about-hours" className={labelClass}>Office hours</Label>
                <Textarea id="about-hours" value={content.office_hours} onChange={(e) => field('office_hours', e.target.value)} className={`min-h-[80px] ${textareaClass}`} />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Contact} title="About this system" description="The purpose and the three steps are fixed. Add the credits here; empty hides them.">
            <div className="space-y-1.5">
              <Label htmlFor="about-credits" className={labelClass}>Credits (developers and adviser)</Label>
              <Textarea id="about-credits" value={content.system_credits} onChange={(e) => field('system_credits', e.target.value)} className={`min-h-[100px] ${textareaClass}`} />
            </div>
          </SectionCard>

          <SectionCard icon={Phone} title="Contact information" description="Shown in the dark panel at the bottom, and the phone numbers in the help box. Email, phone, and Facebook become links.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="about-email" className={labelClass}>Contact email</Label>
                <Input id="about-email" type="email" value={content.contact_email} onChange={(e) => field('contact_email', e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="about-phone" className={labelClass}>Phone / mobile</Label>
                <Input id="about-phone" value={content.contact_phone} onChange={(e) => field('contact_phone', e.target.value)} className={inputClass} />
                <p className={hintClass}>Separate several numbers with a slash ( / ).</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="about-fb-name" className={labelClass}>Facebook page name</Label>
                <Input id="about-fb-name" value={content.contact_facebook} onChange={(e) => field('contact_facebook', e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="about-fb-url" className={labelClass}>Facebook page link</Label>
                <Input id="about-fb-url" inputMode="url" placeholder="https://www.facebook.com/yourpage" value={content.contact_facebook_url} onChange={(e) => field('contact_facebook_url', e.target.value)} className={inputClass} />
                <p className={hintClass}>Must start with https://. Without a link, the page name shows as plain text.</p>
              </div>
            </div>
          </SectionCard>

          <div className="xl:hidden">{saveButton}</div>
        </div>

        {/* LIVE PREVIEW of the hero, driven by this form's current (unsaved) state. */}
        <div className="xl:sticky xl:top-6 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Eye className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />
            <p className="m-0 text-sm font-semibold text-[#5B6477]">Live preview</p>
          </div>
          <Card className="p-6 rounded-[28px] border-none shadow-none bg-white overflow-hidden">
            <span className="inline-block px-3 py-1 rounded-full bg-[#FBBF24] text-[#1E1B4B] font-bold text-sm mb-4">About the Center</span>
            <h2 className="m-0 font-bricolage font-extrabold text-2xl text-[#1E1B4B] leading-tight mb-4 break-words">
              {content.heading_title || 'Heading'}
            </h2>

            {heroShown && <img src={heroShown} alt="" className="w-full aspect-[4/3] object-cover rounded-2xl mb-4" />}

            <div className="bg-[#F5F6FB] p-4 rounded-2xl flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#4F46E5] flex items-center justify-center font-bricolage font-extrabold text-white text-base shrink-0">
                {getInitials(content.director_name || '?')}
              </div>
              <div className="min-w-0">
                <p className="m-0 font-bold text-[#1E1B4B] text-[15px] truncate">{content.director_name || 'Director name'}</p>
                <p className="m-0 text-[13px] font-semibold text-[#4338CA] truncate">{content.director_title || 'Director title'}</p>
              </div>
            </div>

            <p className="m-0 text-sm text-[#5B6477] leading-relaxed mb-5">{content.hero_intro || 'The introduction will appear here.'}</p>

            <div className="border-t border-[#EEF0FA] pt-5">
              <h3 className="m-0 font-bold text-[#1E1B4B] text-base mb-2">A collaborative approach</h3>
              <p className="m-0 text-sm text-[#5B6477] leading-relaxed">{content.collaborative_approach_text || 'The collaborative approach text will appear here.'}</p>
            </div>

            <div className="mt-5 bg-[#1E1B4B] rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2.5 text-[13px] font-semibold text-white">
                <Mail className="w-4 h-4 text-[#FBBF24] shrink-0" aria-hidden="true" />
                <span className="truncate">{content.contact_email || 'Email'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[13px] font-semibold text-white">
                <Facebook className="w-4 h-4 text-[#FBBF24] shrink-0" aria-hidden="true" />
                <span className="truncate">{content.contact_facebook || 'Facebook page'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[13px] font-semibold text-white">
                <Phone className="w-4 h-4 text-[#FBBF24] shrink-0" aria-hidden="true" />
                <span className="truncate">{content.contact_phone || 'Phone number'}</span>
              </div>
              {content.office_hours.trim() && (
                <div className="flex items-center gap-2.5 text-[13px] font-semibold text-white">
                  <Clock className="w-4 h-4 text-[#FBBF24] shrink-0" aria-hidden="true" />
                  <span className="truncate">{content.office_hours.split('\n')[0]}</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
