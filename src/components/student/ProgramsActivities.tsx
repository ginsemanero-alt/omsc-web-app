import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Search, Calendar, MapPin, Loader2, Clock,
} from 'lucide-react';

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
}

export default function ProgramsActivities() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [guidanceServiceFilter, setGuidanceServiceFilter] = useState('all');
  const [programComponentFilter, setProgramComponentFilter] = useState('all');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: programsData, error: programsError } = await supabase
        .from('programs')
        .select('*')
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

  const filteredPrograms = programs.filter((p) => {
    const matchesSearch = p.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGuidanceService =
      guidanceServiceFilter === 'all' || p.guidance_service === guidanceServiceFilter;
    const matchesProgramComponent =
      programComponentFilter === 'all' || p.program_component === programComponentFilter;
    return matchesSearch && matchesGuidanceService && matchesProgramComponent;
  });

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
        {filteredPrograms.map((program) => (
          <Card key={program.id} className="p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border-none shadow-sm bg-white dark:bg-slate-900 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col gap-6 border-b-4 border-b-slate-100 dark:border-b-slate-800">

            <div className={`absolute top-0 right-0 px-5 py-1.5 rounded-bl-xl text-[8px] font-black uppercase tracking-widest shadow-sm
              ${program.status === 'ongoing' ? 'bg-emerald-500 text-white animate-pulse' : program.status === 'completed' ? 'bg-slate-700 text-white' : 'bg-indigo-600 text-white'}`}>
              {program.status}
            </div>

            <div className="space-y-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100/30 dark:border-slate-700/30">
                <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{program.date}</span>
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

          </Card>
        ))}
      </div>

    </div>
  );
}