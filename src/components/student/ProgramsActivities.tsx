import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle 
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { 
  Search, Calendar, MapPin, Users, Loader2, Clock, 
  CheckCircle2, XCircle, Star, MessageSquare 
} from 'lucide-react';
import { ToastAction } from "../../components/ui/toast";

interface Program {
  id: number;
  title: string;
  date: string;
  time_range: string;
  location: string;
  category: string;
  capacity: number;
  registered: number;
  status: string;
}

// Model layout mapping directly matching active user slots
interface UserRegistration {
  program_id: number;
  status: string;
}

export default function ProgramsActivities() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRegistrations, setUserRegistrations] = useState<UserRegistration[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<number | null>(null);

  // --- FEEDBACK SUBSYSTEM STATES ---
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [activeFeedbackProg, setActiveFeedbackProg] = useState<Program | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const getUserIdFromStorage = () => {
    const id = localStorage.getItem("userId");
    return (id && id !== "undefined" && id !== "null") ? id : null;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const userId = getUserIdFromStorage();
    try {
      const { data: programsData, error: programsError } = await supabase
        .from('programs')
        .select('*')
        .order('date', { ascending: true });

      if (programsError) throw programsError;
      if (programsData) setPrograms(programsData);

      if (userId) {
        // Hinihila ang program_id kasama ang realtime attendance validation status string
        const { data: regs, error: regError } = await supabase
          .from('program_registrations')
          .select('program_id, status')
          .eq('user_id', userId);
        
        if (regError) throw regError;
        if (regs) {
          setUserRegistrations(regs.map(r => ({
            program_id: Number(r.program_id),
            status: r.status || 'pending'
          })));
        }
      }
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

  const handleRegister = async (programId: number) => {
    const userIdForAction = getUserIdFromStorage();
    if (!userIdForAction) {
      toast({ 
        variant: "destructive", 
        title: "SESSION EXPIRED", 
        description: "Please log in again.",
      });
      return;
    }

    setIsSubmitting(programId);
    try {
      const { error } = await supabase
        .from('program_registrations')
        .insert([{ program_id: programId, user_id: userIdForAction, status: 'pending' }]);

      if (error) throw error;

      toast({
        title: "REGISTRATION SUCCESSFUL",
        description: "You're now listed for this activity.",
        className: "bg-emerald-600 text-white font-black border-none rounded-2xl shadow-2xl",
      });

      fetchData(); 
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "REGISTRATION FAILED",
        description: err.message,
      });
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleUnregister = (programId: number) => {
    const userIdForAction = getUserIdFromStorage();
    if (!userIdForAction) return;

    toast({
      title: "CANCEL REGISTRATION?",
      description: "Are you sure? This action will release your slot.",
      className: "bg-slate-900 text-white font-black border-none rounded-2xl shadow-2xl p-6",
      action: (
        <div className="flex gap-2">
          <ToastAction 
            altText="No" 
            className="bg-slate-700 hover:bg-slate-600 text-white border-none font-black rounded-xl px-4 py-2 text-[10px] uppercase"
          >
            No, Keep it
          </ToastAction>

          <ToastAction 
            altText="Yes"
            className="bg-red-600 hover:bg-red-700 text-white border-none font-black rounded-xl px-4 py-2 text-[10px] uppercase"
            onClick={async () => {
              setIsSubmitting(programId);
              try {
                const { error } = await supabase
                  .from('program_registrations')
                  .delete()
                  .eq('program_id', programId)
                  .eq('user_id', userIdForAction);

                if (error) throw error;

                toast({
                  title: "REGISTRATION CANCELLED",
                  description: "Slot successfully released.",
                  className: "bg-slate-800 text-white font-black border-none rounded-2xl",
                });

                fetchData();
              } catch (err: any) {
                toast({
                  variant: "destructive",
                  title: "ERROR",
                  description: "Cancellation failed.",
                });
              } finally {
                setIsSubmitting(null);
              }
            }}
          >
            Yes, Cancel
          </ToastAction>
        </div>
      ),
    });
  };

  // --- SUBMIT COMPILATION INTERACTION PANEL TO SURVEY RESPONSES ---
  const handleOpenFeedbackModal = (program: Program) => {
    setActiveFeedbackProg(program);
    setRatingScore(5);
    setFeedbackText('');
    setIsFeedbackOpen(true);
  };

  const handlePublishFeedback = async () => {
    const userId = getUserIdFromStorage();
    if (!activeFeedbackProg || !userId) return;

    try {
      setIsSubmittingFeedback(true);

      // Kumokonekta sa static survey container space para sa counselor visualization matrix mo
      const { error } = await supabase
        .from('survey_responses')
        .insert([{
          survey_id: 1, // Default tracking key para sa global program reviews
          user_id: userId,
          answers: {
            target_program_id: activeFeedbackProg.id,
            target_program_title: activeFeedbackProg.title,
            rating: ratingScore,
            comment_text: feedbackText,
            evaluated_at: new Date().toISOString()
          }
        }]);

      if (error) throw error;

      toast({
        title: "EVALUATION SUBMITTED",
        description: "Thank you! Your feedback has calibrated our analytics charts.",
        className: "bg-blue-600 text-white font-black rounded-2xl border-none shadow-2xl"
      });

      setIsFeedbackOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "SUBMISSION ERROR", description: err.message });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const filteredPrograms = programs.filter((p) => {
    const matchesSearch = p.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
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
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase mb-1">
          Programs & <span className="text-indigo-600">Activities</span>
        </h1>
        <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">Guidance and development events console</p>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Filter active activity titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-slate-50 border-none rounded-xl font-bold text-xs md:text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-100 w-full"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-56 h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-600 uppercase text-[10px] tracking-widest">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-none shadow-xl bg-white">
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="Group Guidance">Group Guidance</SelectItem>
            <SelectItem value="Individual Student Planning">Individual Planning</SelectItem>
            <SelectItem value="Responsive Services">Responsive Services</SelectItem>
            <SelectItem value="System Support">System Support</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* RENDER CARDS GRID LOOP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {filteredPrograms.map((program) => {
          // Hinahanap ang enrollment token parameters ng bata
          const matchedReg = userRegistrations.find(r => r.program_id === Number(program.id));
          const isRegistered = !!matchedReg;
          const attendanceStatus = matchedReg?.status?.toLowerCase() || 'pending';
          const isFull = (program.registered || 0) >= (program.capacity || 0);

          return (
            <Card key={program.id} className="p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border-none shadow-sm bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col justify-between gap-6 border-b-4 border-b-slate-100">
              
              <div>
                <div className={`absolute top-0 right-0 px-5 py-1.5 rounded-bl-xl text-[8px] font-black uppercase tracking-widest shadow-sm
                  ${program.status === 'ongoing' ? 'bg-emerald-500 text-white animate-pulse' : program.status === 'completed' ? 'bg-slate-700 text-white' : 'bg-indigo-600 text-white'}`}>
                  {program.status}
                </div>

                <div className="space-y-3">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-md inline-block">
                    {program.category || 'General Guidance'}
                  </span>
                  <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight uppercase leading-tight max-w-[85%]">
                    {program.title}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100/30">
                    <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>{program.date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100/30">
                    <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="truncate">{program.time_range || 'All Day Schedule'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100/30 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="truncate">{program.location}</span>
                  </div>
                </div>
              </div>

              {/* DYNAMIC ACTION LAYOUT MODULE GATEWAY CONTAINER */}
              <div className="space-y-2">
                {isRegistered ? (
                  <div className="space-y-2 w-full">
                    
                    {/* DYNAMIC FEEDBACK ENGINE ACTIVATOR CELL */}
                    {attendanceStatus === 'attended' ? (
                      <Button 
                        onClick={() => handleOpenFeedbackModal(program)}
                        className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[10px] tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        <Star className="w-4 h-4 fill-white" /> Rate & Leave Seminar Feedback
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleUnregister(Number(program.id))}
                        disabled={isSubmitting === program.id}
                        className="w-full h-12 rounded-xl font-black uppercase transition-all shadow-sm bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 text-[10px] tracking-wider group/btn"
                      >
                        {isSubmitting === program.id ? (
                          <Loader2 className="w-4 h-4 anonymity animate-spin" />
                        ) : (
                          <>
                            <span className="flex group-hover/btn:hidden items-center justify-center gap-1.5 w-full">
                              <CheckCircle2 className="w-4 h-4" /> Enrolled Slot (Pending Review)
                            </span>
                            <span className="hidden group-hover/btn:flex items-center justify-center gap-1.5 w-full">
                              <XCircle className="w-4 h-4" /> Revoke Seminar Seat Booking
                            </span>
                          </>
                        )}
                      </Button>
                    )}
                    
                  </div>
                ) : (
                  <Button 
                    onClick={() => handleRegister(Number(program.id))}
                    disabled={isFull || isSubmitting === program.id || program.status === 'completed'}
                    className={`w-full h-12 rounded-xl font-black uppercase transition-all text-[10px] tracking-wider shadow-md 
                      ${(isFull || program.status === 'completed') ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-none shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    {isSubmitting === program.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : program.status === 'completed' ? (
                      'Activity Concluded'
                    ) : isFull ? (
                      'Max Seat Limit Reached'
                    ) : (
                      'Reserve My Slot Now'
                    )}
                  </Button>
                )}
              </div>

            </Card>
          );
        })}
      </div>

      {/* --- RATING & FEEDBACK SYSTEM DIALOG PANEL MODAL --- */}
      <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
        <DialogContent className="max-w-md bg-white rounded-2xl p-6 md:p-8 border-none shadow-2xl font-sans text-center">
          <div className="mx-auto w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-2">
            <MessageSquare className="w-6 h-6" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900 text-center">
              Evaluate Seminar Track
            </DialogTitle>
          </DialogHeader>
          <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wide px-2 leading-normal">
            How would you rate your overall learning experience with <span className="text-indigo-600 font-black">"{activeFeedbackProg?.title}"</span>?
          </div>
          
          {/* Interactive Core Selection Stars */}
          <div className="flex justify-center gap-2 my-5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button 
                key={star} 
                type="button"
                onClick={() => setRatingScore(star)} 
                className="transition-transform active:scale-90 hover:scale-110 p-1"
              >
                <Star className={`w-8 h-8 ${star <= ratingScore ? 'text-amber-500 fill-amber-500' : 'text-slate-200'}`} />
              </button>
            ))}
          </div>

          <div className="space-y-1 text-left">
            <Label className="text-[9px] font-black uppercase text-slate-400 ml-1">Write Suggestions / Constructive Review</Label>
            <textarea 
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="What did you learn from the resource speaker or presentation materials? (Optional)"
              className="w-full rounded-xl bg-slate-50 border-none p-4 font-medium text-xs md:text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-indigo-100 text-slate-700 transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mt-6">
            <Button 
              variant="ghost" 
              onClick={() => setIsFeedbackOpen(false)}
              className="h-11 rounded-xl font-black uppercase text-[10px] tracking-wider text-slate-400 bg-slate-50 hover:bg-slate-100"
            >
              Close Manual
            </Button>
            <Button 
              onClick={handlePublishFeedback} 
              disabled={isSubmittingFeedback}
              className="h-11 rounded-xl font-black uppercase text-[10px] tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100"
            >
              {isSubmittingFeedback ? <Loader2 className="animate-spin w-4 h-4 mx-auto" /> : "Publish Feedback"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}