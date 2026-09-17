import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Loader2, Save, FileText } from 'lucide-react';

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
    <div className="space-y-6 animate-in fade-in duration-300 max-w-3xl">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase mb-1">
          <FileText className="inline w-7 h-7 mr-2 -mt-1 text-indigo-600" />
          About Page Content
        </h1>
        <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">
          Edited here, shown on the public /about page and the student About link
        </p>
      </div>

      <Card className="p-6 md:p-8 rounded-[2rem] border-none shadow-sm bg-white space-y-5">
        <div className="space-y-1.5">
          <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Heading Title</Label>
          <Input value={content.heading_title} onChange={(e) => field('heading_title', e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Hero Introduction</Label>
          <Textarea value={content.hero_intro} onChange={(e) => field('hero_intro', e.target.value)} className="min-h-[110px] rounded-xl bg-slate-50 border-none p-4 text-sm resize-none" />
        </div>

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

        <div className="space-y-1.5">
          <Label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Collaborative Approach Text</Label>
          <Textarea value={content.collaborative_approach_text} onChange={(e) => field('collaborative_approach_text', e.target.value)} className="min-h-[110px] rounded-xl bg-slate-50 border-none p-4 text-sm resize-none" />
        </div>

        <div className="border-t border-slate-100 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving} className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs shadow-md">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
