import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Loader2, Save, FileText, User, Contact, Mail, Facebook, Phone, Eye } from 'lucide-react';

interface AboutContent {
  heading_title: string;
  hero_intro: string;
  director_name: string;
  director_title: string;
  collaborative_approach_text: string;
  contact_email: string;
  contact_facebook: string;
  contact_phone: string;
}

const EMPTY: AboutContent = {
  heading_title: '',
  hero_intro: '',
  director_name: '',
  director_title: '',
  collaborative_approach_text: '',
  contact_email: '',
  contact_facebook: '',
  contact_phone: '',
};

// Same initials logic as the public AboutPage.tsx, so the preview panel
// below matches exactly what visitors will see, not an approximation.
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
}

interface SectionCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ icon: Icon, title, description, children }) => (
  <Card className="p-6 md:p-7 rounded-[2rem] border-none shadow-sm bg-white space-y-5">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">{title}</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{description}</p>
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </Card>
);

export default function AboutContentManager() {
  const { toast } = useToast();

  const [content, setContent] = useState<AboutContent>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('about_content')
        .select('heading_title, hero_intro, director_name, director_title, collaborative_approach_text, contact_email, contact_facebook, contact_phone')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        toast({ variant: 'destructive', title: 'Fetch Error', description: error.message });
      } else if (data) {
        setContent(data as AboutContent);
      }
      setLoading(false);
    };

    fetchContent();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('about_content')
        .update({ ...content, updated_at: new Date().toISOString() })
        .eq('id', 1);

      if (error) throw error;

      toast({ title: 'Saved', description: 'The About page has been updated.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof AboutContent, value: string) =>
    setContent((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2">
        <Loader2 className="animate-spin text-indigo-600" />
        <span className="text-[10px] font-black uppercase text-slate-400">Loading About Content...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase mb-1">
            <FileText className="inline w-7 h-7 mr-2 -mt-1 text-indigo-600" />
            About Page Content
          </h1>
          <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">
            Edited here, shown on the public /about page and the student About link
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs shadow-md shrink-0">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">
        {/* FORM */}
        <div className="space-y-6">
          <SectionCard icon={FileText} title="Hero Section" description="The big heading and intro paragraph at the top">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Heading Title</Label>
              <Input value={content.heading_title} onChange={(e) => field('heading_title', e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Hero Introduction</Label>
              <Textarea value={content.hero_intro} onChange={(e) => field('hero_intro', e.target.value)} className="min-h-[110px] rounded-xl bg-slate-50 border-none p-4 text-sm resize-none" />
            </div>
          </SectionCard>

          <SectionCard icon={User} title="Director / Leadership" description="Shown as the profile card beside the heading">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Director Name</Label>
                <Input value={content.director_name} onChange={(e) => field('director_name', e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Director Title</Label>
                <Input value={content.director_title} onChange={(e) => field('director_title', e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-sm" />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Contact} title="Collaborative Approach" description="The sticky sidebar text under the hero">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Collaborative Approach Text</Label>
              <Textarea value={content.collaborative_approach_text} onChange={(e) => field('collaborative_approach_text', e.target.value)} className="min-h-[110px] rounded-xl bg-slate-50 border-none p-4 text-sm resize-none" />
            </div>
          </SectionCard>

          <SectionCard icon={Phone} title="Contact Information" description='Shown in the dark "Get in Touch" panel at the bottom'>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Contact Email</Label>
                <Input value={content.contact_email} onChange={(e) => field('contact_email', e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Facebook Page Name</Label>
                <Input value={content.contact_facebook} onChange={(e) => field('contact_facebook', e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Phone / Mobile</Label>
                <Input value={content.contact_phone} onChange={(e) => field('contact_phone', e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-sm" />
              </div>
            </div>
          </SectionCard>

          <div className="xl:hidden">
            <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs shadow-md">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>

        {/* LIVE PREVIEW — same layout/classes as the real hero section in
            AboutPage.tsx, driven by this form's current (unsaved) state,
            so an admin can see the effect of an edit before saving it. */}
        <div className="xl:sticky xl:top-6 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Eye className="w-4 h-4 text-indigo-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Preview</p>
          </div>
          <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white overflow-hidden">
            <Badge className="bg-indigo-100 text-indigo-600 border-none font-black px-3 py-1 rounded-full uppercase text-[8px] tracking-widest inline-block mb-4">
              About the Center
            </Badge>
            <h2 className="text-xl font-black uppercase text-slate-900 tracking-tighter leading-tight mb-4">
              {content.heading_title || 'Heading Title'}
            </h2>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-black text-white text-xs shrink-0 shadow-md">
                {getInitials(content.director_name || '?')}
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-900 uppercase tracking-tight text-xs leading-none truncate">{content.director_name || 'Director Name'}</h3>
                <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider mt-1 truncate">{content.director_title || 'Director Title'}</p>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 leading-relaxed mb-5">
              {content.hero_intro || 'Hero introduction text will appear here.'}
            </p>

            <div className="border-t border-slate-100 pt-5">
              <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 mb-2">A Collaborative Approach</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {content.collaborative_approach_text || 'Collaborative approach text will appear here.'}
              </p>
            </div>

            <div className="mt-5 bg-slate-950 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2.5 text-[10px] font-mono font-bold text-slate-200 lowercase">
                <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{content.contact_email || 'email@example.com'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[10px] font-bold text-slate-200">
                <Facebook className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{content.contact_facebook || 'Facebook Page'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[10px] font-mono font-bold text-slate-200">
                <Phone className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{content.contact_phone || 'Phone Number'}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
