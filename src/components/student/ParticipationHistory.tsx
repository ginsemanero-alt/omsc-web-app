import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';
import { 
  Bell, 
  Calendar, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  ArrowRight,
  BookOpen,
  Megaphone
} from 'lucide-react';

interface NotificationItem {
  id: string;
  type: 'program' | 'material';
  title: string;
  description: string;
  created_at: string;
  dateOrCategory?: string;
  linkUrl?: string;
}

export default function StudentNotifications() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'program' | 'material'>('all');

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);

      // 1. Fetch mga bagong Programs
      const { data: programs, error: progError } = await supabase
        .from('programs')
        .select('id, title, location, category, date, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (progError) throw progError;

      // 2. Fetch mga bagong Materials (i-exclude ang certificate templates)
      const { data: materials, error: matError } = await supabase
        .from('materials')
        .select('id, title, file_url, created_at')
        .not('title', 'ilike', 'CERTIFICATE_TEMPLATE:%')
        .order('created_at', { ascending: false })
        .limit(10);

      if (matError) throw matError;

      // 3. Format at pagsamahin (Merge) ang parehong listahan
      const formattedPrograms: NotificationItem[] = (programs || []).map((p: any) => ({
        id: `prog-${p.id}`,
        type: 'program',
        title: p.title || 'New Guidance Program Available',
        description: `New event scheduled at ${p.location || 'OMSC Campus'}. Category: ${p.category || 'General'}`,
        created_at: p.created_at || new Date().toISOString(),
        dateOrCategory: p.date ? `Event Date: ${p.date}` : undefined
      }));

      const formattedMaterials: NotificationItem[] = (materials || []).map((m: any) => ({
        id: `mat-${m.id}`,
        type: 'material',
        title: m.title || 'New Guidance Resource Material',
        description: 'Counselors uploaded new reading or reference material for students.',
        created_at: m.created_at || new Date().toISOString(),
        linkUrl: m.file_url
      }));

      // Combine at i-sort base sa pinakabagong date (`created_at`)
      const combined = [...formattedPrograms, ...formattedMaterials].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setNotifications(combined);
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      toast({
        variant: "destructive",
        title: "NOTIFICATION FETCH FAILED",
        description: error.message || "Failed to load recent updates."
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredNotifications = notifications.filter(item => {
    if (filter === 'program') return item.type === 'program';
    if (filter === 'material') return item.type === 'material';
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 w-full font-sans p-2 animate-in fade-in duration-300">
      
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900 p-6 md:p-10 rounded-2xl md:rounded-[3rem] text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-400/30 font-black text-[9px] uppercase tracking-widest px-3 py-1">
              Live Guidance Board
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter uppercase italic leading-none">
            System <span className="text-indigo-400">Notifications</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase text-[8px] md:text-[10px] tracking-widest leading-normal">
            Stay updated with newly posted programs and educational materials from Guidance Counselors
          </p>
        </div>
        <Bell className="absolute right-[-20px] top-[-20px] h-32 w-32 md:h-48 md:w-48 text-white/5 -rotate-12 pointer-events-none hidden sm:block" />
      </div>

      {/* FILTER TABS */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => setFilter('all')}
          className={`h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
            filter === 'all' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'
          }`}
        >
          All Updates ({notifications.length})
        </Button>
        <Button
          onClick={() => setFilter('program')}
          className={`h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
            filter === 'program' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 mr-1.5" /> Programs & Seminars
        </Button>
        <Button
          onClick={() => setFilter('material')}
          className={`h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
            filter === 'material' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Learning Materials
        </Button>
      </div>

      {/* NOTIFICATION FEED */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white rounded-3xl border shadow-sm">
          <Loader2 className="animate-spin text-indigo-600 w-10 h-10 mb-2" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Latest Feeds...</p>
        </div>
      ) : filteredNotifications.length > 0 ? (
        <div className="space-y-4">
          {filteredNotifications.map((item) => {
            const isProgram = item.type === 'program';

            return (
              <Card
                key={item.id}
                className="p-5 md:p-7 border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-2xl md:rounded-[2.5rem] bg-white group relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-l-4 md:border-l-8"
                style={{
                  borderLeftColor: isProgram ? '#4f46e5' : '#10b981'
                }}
              >
                <div className="flex items-start gap-4 flex-1">
                  {/* ICON BADGE */}
                  <div className={`p-3.5 rounded-2xl shrink-0 ${
                    isProgram ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {isProgram ? <Megaphone className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                  </div>

                  {/* DETAILS */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full ${
                        isProgram ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isProgram ? 'New Program' : 'New Resource Material'}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {new Date(item.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight leading-snug">
                      {item.title}
                    </h3>

                    <p className="text-xs font-medium text-slate-500 leading-relaxed">
                      {item.description}
                    </p>

                    {item.dateOrCategory && (
                      <p className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wide pt-1">
                        {item.dateOrCategory}
                      </p>
                    )}
                  </div>
                </div>

                {/* ACTION BUTTON */}
                <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {isProgram ? (
                    <Button 
                      onClick={() => toast({ title: "PROGRAM AVAILABLE", description: "You can register for this program in the Guidance Programs tab." })}
                      className="w-full sm:w-auto h-11 px-6 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                      View Details <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  ) : item.linkUrl ? (
                    <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto block">
                      <Button 
                        className="w-full sm:w-auto h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-colors shadow-sm flex items-center justify-center gap-2"
                      >
                        Download Material <FileText className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  ) : (
                    <Button disabled className="w-full sm:w-auto h-11 px-6 bg-slate-100 text-slate-400 rounded-xl font-black uppercase text-[10px]">
                      No File Link
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">No notifications or updates found.</p>
        </div>
      )}

    </div>
  );
}