import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, ClipboardList, Calendar,
  Loader2, ArrowRight, MapPin, FileText
} from 'lucide-react';

export default function DashboardOverview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Student');
  const [userCampus, setUserCampus] = useState('San Jose Campus');
  const [activeSurveys, setActiveSurveys] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [latestMaterials, setLatestMaterials] = useState<any[]>([]);
  const [stats, setStats] = useState([
    { label: 'Programs Available', value: '0', icon: Calendar, color: 'text-indigo-600' },
    { label: 'Surveys Published', value: '0', icon: ClipboardList, color: 'text-emerald-600' },
    { label: 'Materials Online', value: '0', icon: BookOpen, color: 'text-purple-600' },
  ]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Get Auth Session User
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (user) {
        // profiles.id is the Supabase Auth user's uuid, unlike users.id
        // (an unrelated bigint), so this is the one that can actually be
        // matched against the session user's id.
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, campus')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.full_name) {
          setUserName(profile.full_name.split(' ')[0]);
        } else if (user.user_metadata?.full_name) {
          setUserName(user.user_metadata.full_name.split(' ')[0]);
        }

        if (profile?.campus) {
          setUserCampus(profile.campus);
        }
      }

      // 2. Fetch Real Stats & Data from Database
      const [progRes, surveyRes, matRes, latestMatRes] = await Promise.all([
        supabase.from('programs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(3),
        supabase.from('surveys').select('*', { count: 'exact' }).eq('status', 'active').limit(3),
        supabase.from('materials').select('*', { count: 'exact', head: true }),
        supabase
          .from('materials')
          .select('id, title, file_url, created_at')
          .not('title', 'ilike', 'CERTIFICATE_TEMPLATE:%')
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      if (progRes.data) setPrograms(progRes.data);
      if (surveyRes.data) setActiveSurveys(surveyRes.data);
      if (latestMatRes.data) setLatestMaterials(latestMatRes.data);

      setStats([
        { label: 'Programs Available', value: (progRes.count || 0).toString(), icon: Calendar, color: 'text-indigo-600' },
        { label: 'Surveys Published', value: (surveyRes.count || 0).toString(), icon: ClipboardList, color: 'text-emerald-600' },
        { label: 'Materials Online', value: (matRes.count || 0).toString(), icon: BookOpen, color: 'text-purple-600' },
      ]);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
        <p className="text-slate-500 font-bold italic animate-pulse text-center uppercase tracking-widest text-[10px]">
          Syncing with OMSC Hub...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-10 w-full overflow-hidden">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 pb-6 border-slate-100">
        <div className="space-y-1">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tighter italic uppercase leading-none">
            Mabuhay, <span className="text-indigo-600">{userName}!</span>
          </h1>
          <p className="text-slate-400 text-[10px] md:text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2 pt-2">
            <MapPin className="h-3 w-3 md:h-4 md:w-4 text-red-500 shrink-0" /> {userCampus} Student Portal
          </p>
        </div>
        <div className="bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] shadow-xl text-white min-w-[160px] md:min-w-[200px] w-full md:w-auto">
          <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Academic Year</p>
          <p className="text-lg md:text-xl font-black italic">2025 - 2026</p>
        </div>
      </div>

      {/* Real Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-6 md:p-8 border-none shadow-sm bg-white rounded-2xl md:rounded-[3rem] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-tight">{stat.label}</p>
                <p className="text-3xl md:text-4xl font-black text-slate-900">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-slate-50 flex items-center justify-center transition-all ${stat.color}`}>
                <stat.icon className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2.5} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        
        {/* Latest Programs & Materials Section */}
        <Card className="lg:col-span-2 p-5 sm:p-8 md:p-12 rounded-2xl md:rounded-[4rem] border-none shadow-sm bg-white space-y-10">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-10">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 italic uppercase tracking-tight">Latest Guidance Programs</h2>
              <Button variant="ghost" onClick={() => navigate('/student/programs')} className="text-indigo-600 font-black uppercase text-[10px] tracking-widest p-0 sm:p-2 self-start sm:self-auto">
                Explore All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {programs.length > 0 ? (
                programs.map((program) => (
                  <div key={program.id} className="p-4 sm:p-6 md:p-8 bg-slate-50 rounded-xl md:rounded-[2.5rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300">
                    <div className="space-y-1">
                      <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase italic leading-tight">{program.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {program.created_at ? new Date(program.created_at).toLocaleDateString() : 'N/A'}
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span>{program.campus || userCampus}</span>
                      </div>
                    </div>
                    <Button onClick={() => navigate('/student/programs')} className="bg-slate-900 text-white hover:bg-indigo-600 rounded-xl h-12 px-6 font-black uppercase text-[10px] tracking-widest w-full sm:w-auto transition-colors">
                      View
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-100">
                  <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">No posted guidance programs yet.</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t-2 border-slate-100 pt-8 md:pt-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-10">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 italic uppercase tracking-tight">Latest IEC Materials</h2>
              <Button variant="ghost" onClick={() => navigate('/student/materials')} className="text-indigo-600 font-black uppercase text-[10px] tracking-widest p-0 sm:p-2 self-start sm:self-auto">
                Explore All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {latestMaterials.length > 0 ? (
                latestMaterials.map((material) => (
                  <div key={material.id} className="p-4 sm:p-6 md:p-8 bg-slate-50 rounded-xl md:rounded-[2.5rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase italic leading-tight truncate">{material.title}</h3>
                    </div>
                    <Button onClick={() => navigate('/student/materials')} className="bg-slate-900 text-white hover:bg-indigo-600 rounded-xl h-12 px-6 font-black uppercase text-[10px] tracking-widest w-full sm:w-auto transition-colors">
                      View
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-100">
                  <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">No posted IEC materials yet.</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Real Active Surveys Section */}
        <Card className="p-6 sm:p-8 md:p-12 rounded-2xl md:rounded-[4rem] border-none shadow-2xl bg-indigo-600 text-white flex flex-col justify-between overflow-hidden relative min-h-[350px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
          
          <div className="relative z-10 space-y-6 md:space-y-10 w-full">
            <h2 className="text-2xl md:text-3xl font-black italic tracking-tight uppercase leading-none">Awareness<br/>Surveys</h2>
            
            <div className="space-y-6">
              {activeSurveys.length > 0 ? (
                activeSurveys.map((survey) => (
                  <div key={survey.id} className="space-y-2 group cursor-pointer" onClick={() => navigate('/student/survey')}>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-widest text-indigo-100 group-hover:text-white transition-colors line-clamp-1">{survey.title}</span>
                      <span className="text-[8px] font-black bg-white/20 px-1.5 py-0.5 rounded shrink-0">NEW</span>
                    </div>
                    <Progress value={0} className="h-1 bg-indigo-800" />
                  </div>
                ))
              ) : (
                <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest">No pending surveys at the moment.</p>
              )}
            </div>
          </div>

          <Button 
            onClick={() => navigate('/student/survey')}
            className="w-full mt-8 h-14 bg-white text-indigo-600 font-black rounded-xl hover:bg-slate-900 hover:text-white transition-all duration-300 uppercase tracking-widest text-[10px] relative z-10"
          >
            Take Surveys
          </Button>
        </Card>
      </div>

      {/* Community Banner Block */}
      <Card className="relative h-[300px] md:h-[450px] rounded-3xl md:rounded-[5rem] border-none overflow-hidden group shadow-2xl">
        <img
          src="https://c.animaapp.com/mljmun0txvpkRP/img/ai_1.png"
          alt="OMSC Campus Highlight"
          className="absolute inset-0 w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-[2000ms]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6 md:bottom-16 md:left-16 md:right-16 text-white space-y-3 md:space-y-4">
          <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-[8px] md:text-[10px]">Community Highlight</p>
          <h2 className="text-2xl md:text-6xl font-black italic uppercase leading-none">Campus Life<br/>at OMSC {userCampus.replace('Campus', '')}</h2>
          <Button onClick={() => navigate('/student/materials')} className="bg-white text-slate-900 hover:bg-indigo-600 hover:text-white h-12 md:h-14 px-6 md:px-10 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all w-full sm:w-auto">
            See Awareness Materials
          </Button>
        </div>
      </Card>
    </div>
  );
}