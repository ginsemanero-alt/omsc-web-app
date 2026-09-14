import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  Search, Calendar, MapPin, Loader2, Clock, ChevronDown, ChevronUp, ZoomIn, FileText, Download, Eye, HardDrive,
} from 'lucide-react';
import { formatProgramDate } from '../../lib/formatProgramDate';
import { getEffectiveProgramStatus, compareProgramsForDisplay } from '../../lib/programStatus';

// Lazy: pdfjs-dist is a large library (~500KB+) — no reason to ship it in
// this chunk unless someone actually opens a handout PDF preview.
const PdfPreview = lazy(() => import('../shared/PdfPreview'));

const GUIDANCE_SERVICES = [
  'Information Services',
  'Individual Inventory',
  'Research and Evaluation',
  'Career Orientation',
  'Testing Services',
  'Counseling Services',
];

const PROGRAM_COMPONENTS = [
  'Group Guidance',
  'Individual Student Planning',
  'Responsive Services',
  'System Support',
];

interface Program {
  id: number;
  title: string;
  date: string;
  time_range: string;
  location: string;
  category: string;
  guidance_service: string;
  program_component: string;
  capacity: number;
  registered: number;
  status: string;
  image_url?: string;
  content?: string;
  date_display?: string;
  materials?: { id: number; title: string; file_url: string }[];
}

export default function ProgramsActivities() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [guidanceServiceFilter, setGuidanceServiceFilter] = useState('all');
  const [programComponentFilter, setProgramComponentFilter] = useState('all');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [previewHandout, setPreviewHandout] = useState<{ url: string; title: string } | null>(null);

  // Handouts open in an in-app preview first — downloading is a separate,
  // explicit action inside that preview, not the default click behavior.
  const downloadHandout = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.location.href = url;
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: programsData, error: programsError } = await supabase
        .from('programs')
        .select('*, materials(id, title, file_url)')
        .order('date', { ascending: true });

      if (programsError) throw programsError;
      if (programsData) setPrograms(programsData);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      toast({
        variant: "destructive",
        title: "SYNC ERROR",
        description: err.message || "Failed to connect to database.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredPrograms = programs
    .filter((p) => {
      const matchesSearch = p.title?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGuidanceService =
        guidanceServiceFilter === 'all' || p.guidance_service === guidanceServiceFilter;
      const matchesProgramComponent =
        programComponentFilter === 'all' || p.program_component === programComponentFilter;
      return matchesSearch && matchesGuidanceService && matchesProgramComponent;
    })
    .sort(compareProgramsForDisplay);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Syncing Cloud Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-6 pb-20 max-w-7xl mx-auto font-sans w-full overflow-hidden animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight uppercase mb-1">
          Programs & <span className="text-indigo-600">Activities</span>
        </h1>
        <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">Guidance and development events console</p>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Filter active activity titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold text-xs md:text-sm text-slate-700 dark:text-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-100 w-full"
          />
        </div>
        <Select value={guidanceServiceFilter} onValueChange={setGuidanceServiceFilter}>
          <SelectTrigger className="w-full sm:w-56 h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-widest">
            <SelectValue placeholder="Guidance Service" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-none shadow-xl bg-white dark:bg-slate-900">
            <SelectItem value="all">All Guidance Services</SelectItem>
            {GUIDANCE_SERVICES.map((service) => (
              <SelectItem key={service} value={service}>{service}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={programComponentFilter} onValueChange={setProgramComponentFilter}>
          <SelectTrigger className="w-full sm:w-56 h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-widest">
            <SelectValue placeholder="Program Component" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-none shadow-xl bg-white dark:bg-slate-900">
            <SelectItem value="all">All Program Components</SelectItem>
            {PROGRAM_COMPONENTS.map((component) => (
              <SelectItem key={component} value={component}>{component}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* RENDER CARDS GRID LOOP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {filteredPrograms.map((program) => {
          const effectiveStatus = getEffectiveProgramStatus(program);
          return (
          <Card key={program.id} className="rounded-2xl md:rounded-[2.5rem] border-none shadow-sm bg-white dark:bg-slate-900 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col gap-6 border-b-4 border-b-slate-100 dark:border-b-slate-800">

            <div
              className="aspect-video w-full bg-slate-900 relative shrink-0 cursor-pointer group/poster"
              onClick={() => setPreviewImage({
                url: program.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop',
                title: program.title,
              })}
            >
              <img
                src={program.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop'}
                className="absolute inset-0 w-full h-full object-cover"
                alt={program.title}
              />
              <div className="absolute inset-0 bg-black/0 group-hover/poster:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover/poster:opacity-100 transition-opacity" />
              </div>
              <div className={`absolute top-4 right-4 px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm
                ${effectiveStatus === 'ongoing' ? 'bg-emerald-500 text-white animate-pulse' : effectiveStatus === 'completed' ? 'bg-slate-700 text-white' : 'bg-indigo-600 text-white'}`}>
                {effectiveStatus}
              </div>
            </div>

            <div className="px-6 md:px-8 space-y-3 -mt-2">
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-md inline-block">
                  {program.guidance_service || 'General Guidance'}
                </span>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest rounded-md inline-block">
                  {program.program_component || 'General'}
                </span>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase leading-tight max-w-[85%]">
                {program.title}
              </h3>
            </div>

            <div className="px-6 md:px-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100/30 dark:border-slate-700/30">
                <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{formatProgramDate(program)}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100/30 dark:border-slate-700/30">
                <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{program.time_range || 'All Day Schedule'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100/30 dark:border-slate-700/30 sm:col-span-2">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{program.location}</span>
              </div>
            </div>

            <div className="px-6 md:px-8 pb-6 md:pb-8">
              <Button
                variant="ghost"
                className="w-full border-t border-dashed rounded-none pt-4 justify-between text-indigo-600 hover:text-indigo-700 hover:bg-transparent px-0 font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-colors"
                onClick={() => setExpandedId(expandedId === program.id ? null : program.id)}
              >
                {expandedId === program.id ? 'Hide Details' : 'View Details'}
                {expandedId === program.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>

              {expandedId === program.id && (() => {
                const handouts = program.materials?.filter((m) => !m.title?.startsWith('CERTIFICATE_TEMPLATE:')) || [];
                return (
                  <div className="mt-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
                    <div className="bg-slate-50/70 dark:bg-slate-800/40 p-4 md:p-6 rounded-2xl text-slate-600 dark:text-slate-300 text-xs md:text-sm leading-relaxed border border-slate-100/30 dark:border-slate-700/30 font-medium whitespace-pre-wrap">
                      {program.content || 'No additional details provided for this activity.'}
                    </div>

                    {handouts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase text-indigo-500 tracking-widest ml-1">Downloadable Handouts</p>
                        {handouts.map((mat) => (
                          <button
                            key={mat.id}
                            type="button"
                            onClick={() => setPreviewHandout({ url: mat.file_url, title: mat.title.replace('HANDOUT: ', '') })}
                            className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 hover:border-indigo-500 rounded-xl transition-all shadow-sm group/handout text-left"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                              <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 truncate uppercase tracking-tight">
                                {mat.title.replace('HANDOUT: ', '')}
                              </span>
                            </div>
                            <Eye className="w-3.5 h-3.5 text-slate-400 group-hover/handout:text-indigo-600 transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

          </Card>
          );
        })}
      </div>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:text-white [&>button]:opacity-100">
          {previewImage && (
            <img src={previewImage.url} alt={previewImage.title} className="w-full max-h-[85vh] object-contain" />
          )}
        </DialogContent>
      </Dialog>

      {/* HANDOUT PREVIEW — opens in-app first; downloading is a separate,
          explicit action below, not the default click behavior. */}
      <Dialog open={!!previewHandout} onOpenChange={(open) => !open && setPreviewHandout(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl flex flex-col">
          <DialogHeader className="p-5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between shrink-0">
            <DialogTitle className="font-black uppercase tracking-tighter text-base text-slate-900 dark:text-white truncate pr-8">
              {previewHandout?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 w-full bg-slate-900/50 flex items-center justify-center overflow-hidden relative">
            {previewHandout && /\.pdf(\?.*)?$/i.test(previewHandout.url) ? (
              <Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading PDF...</p>
                  </div>
                }
              >
                <PdfPreview url={previewHandout.url} />
              </Suspense>
            ) : previewHandout && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(previewHandout.url) ? (
              <div className="p-4 w-full h-full flex items-center justify-center">
                <img src={previewHandout.url} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt={previewHandout.title} />
              </div>
            ) : (
              <div className="text-center px-6">
                <HardDrive className="w-16 h-16 text-slate-700 dark:text-slate-200 mx-auto" />
                <p className="font-bold text-slate-500 dark:text-slate-400 mt-4 uppercase text-xs">Preview not available for this file type</p>
                <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-1">Download it below to open it.</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={() => setPreviewHandout(null)} className="rounded-xl font-bold uppercase text-[10px]">Close</Button>
            <Button
              onClick={() => previewHandout && downloadHandout(previewHandout.url, previewHandout.title)}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-black uppercase text-[10px] px-6 text-white"
            >
              <Download className="w-3.5 h-3.5 mr-2" /> Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}