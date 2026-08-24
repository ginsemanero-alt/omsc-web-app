import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ToastAction } from "../../components/ui/toast";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '../../components/ui/dialog';
import { 
  Loader2, Users, Calendar, AlertCircle, 
  Search, CheckCircle, XCircle, Trash2 
} from 'lucide-react';

export default function ProgramRegistrations() {
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Custom Deletion Confirmation States
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteName, setDeleteName] = useState('');

  useEffect(() => {
    fetchRegistrations();
  }, []);

  async function fetchRegistrations() {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      // STEP 1: Fetch core registrations
      const { data: regs, error: regsErr } = await supabase
        .from('program_registrations')
        .select('id, created_at, status, program_id, user_id')
        .order('created_at', { ascending: false });

      if (regsErr) throw regsErr;

      // STEP 2: Fetch referenced programs
      const { data: progs, error: progsErr } = await supabase
        .from('programs')
        .select('id, title, date, time_range');

      if (progsErr) throw progsErr;

      // STEP 3: Fetch referenced profiles
      const { data: profs, error: profsErr } = await supabase
        .from('profiles')
        .select('id, full_name, student_id');

      if (profsErr) throw profsErr;

      if (regs && progs && profs) {
        // STEP 4: Merge client-side data
        const mergedData = regs.map((r: any) => {
          const matchedProgram = progs.find((p: any) => Number(p.id) === Number(r.program_id));
          const matchedProfile = profs.find((p: any) => p.id === r.user_id);

          return {
            ...r,
            programs: matchedProgram || { title: 'Guidance Activity Track', date: 'N/A', time_range: 'N/A' },
            profiles: matchedProfile || { full_name: 'Anonymous Student File', student_id: 'O-00000' }
          };
        });

        setRegistrations(mergedData);
      }
    } catch (err: any) {
      console.error("Fetch Error in Manual Client Merge:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Toggle Attendance
  const toggleStatus = (id: number, currentStatus: string) => {
    const isAttended = currentStatus?.toLowerCase() === 'attended';
    const newStatus = isAttended ? 'pending' : 'attended';
    const actionLabel = isAttended ? 'PENDING' : 'ATTENDED';

    toast({
      title: `MARK AS ${actionLabel}?`,
      description: `Change this student's status to ${newStatus.toUpperCase()}?`,
      className: "bg-slate-900 text-white font-black rounded-2xl border-none p-6 shadow-2xl",
      action: (
        <div className="flex gap-2">
          <ToastAction 
            altText="No" 
            className="bg-slate-700 hover:bg-slate-600 text-white border-none font-black rounded-xl px-4 py-2 text-[10px] uppercase"
          >
            No
          </ToastAction>
          <ToastAction 
            altText="Yes"
            className="bg-indigo-600 hover:bg-indigo-700 text-white border-none font-black rounded-xl px-4 py-2 text-[10px] uppercase"
            onClick={async () => {
              try {
                const { error } = await supabase
                  .from('program_registrations')
                  .update({ status: newStatus })
                  .eq('id', id);

                if (error) throw error;
                
                setRegistrations(prev => prev.map(reg => 
                  reg.id === id ? { ...reg, status: newStatus } : reg
                ));

                toast({
                  title: "STATUS UPDATED",
                  description: `Success! Marked as ${newStatus.toUpperCase()}.`,
                  className: "bg-emerald-600 text-white font-black border-none rounded-2xl",
                });
              } catch (err: any) {
                toast({
                  variant: "destructive",
                  title: "UPDATE FAILED",
                  description: err.message,
                });
              }
            }}
          >
            Yes, Update
          </ToastAction>
        </div>
      ),
    });
  };

  const triggerDeleteModal = (id: number, studentName: string) => {
    setDeleteId(id);
    setDeleteName(studentName);
    setIsDeleteOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from('program_registrations')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;
      setRegistrations(prev => prev.filter(reg => reg.id !== deleteId));
      setIsDeleteOpen(false);
      
      toast({
        title: "REMOVED",
        description: "Registrant successfully purged from the portal files.",
        className: "bg-slate-800 text-white font-black border-none rounded-2xl",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "DELETE FAILED",
        description: err.message,
      });
    }
  };

  const filteredRegistrations = registrations.filter(reg => {
    const studentName = reg.profiles?.full_name || '';
    const programTitle = reg.programs?.title || '';
    const studentIdStr = reg.profiles?.student_id || '';
    
    return (
      studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      programTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      studentIdStr.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center">
      <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8 animate-in fade-in duration-700 font-sans w-full overflow-hidden max-w-[1400px] mx-auto">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4 border-slate-100">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">
            Event <span className="text-indigo-600">Registrants</span>
          </h1>
          <p className="text-slate-400 font-black uppercase text-[8px] md:text-[10px] tracking-widest mt-2">
            Institutional Attendance Registry Portal
          </p>
        </div>
        <div className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs shadow-xl self-stretch sm:self-auto text-center">
          Total Mapped: {filteredRegistrations.length}
        </div>
      </div>

      {/* SEARCH INPUT */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input 
          placeholder="Filter logs by student full name, core ID number, or seminar track title..."
          className="pl-12 h-14 bg-white border-none rounded-2xl shadow-sm font-bold text-xs md:text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-100 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="text-rose-500 w-5 h-5 shrink-0" />
          <p className="text-rose-700 text-[10px] font-black uppercase tracking-wider">Cache Exception Blocked: {errorMsg}</p>
        </div>
      )}

      {/* REGISTRATIONS TABLE */}
      <Card className="rounded-2xl md:rounded-[2.5rem] border-none shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-4 md:p-6 font-black uppercase text-[9px] md:text-[10px] tracking-widest text-slate-400">Student Profiles Ledger</th>
                <th className="p-4 md:p-6 font-black uppercase text-[9px] md:text-[10px] tracking-widest text-slate-400">Guidance Activity Track</th>
                <th className="p-4 md:p-6 font-black uppercase text-[9px] md:text-[10px] tracking-widest text-slate-400">Status</th>
                <th className="p-4 md:p-6 font-black uppercase text-[9px] md:text-[10px] tracking-widest text-slate-400 text-right">Actions Deck</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRegistrations.length > 0 ? (
                filteredRegistrations.map((reg) => {
                  const studentName = reg.profiles?.full_name || 'Anonymous Student File';
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/50 transition-all group">
                      <td className="p-4 md:p-6">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 uppercase tracking-tight text-xs md:text-sm">
                            {studentName}
                          </span>
                          <span className="text-[9px] md:text-[10px] text-indigo-600 font-black uppercase mt-0.5">
                            ID: {reg.profiles?.student_id || 'O-00000'}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 md:p-6">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-700 text-xs uppercase tracking-tight max-w-[280px] truncate">
                            {reg.programs?.title || 'System Program Pillar Slot'}
                          </span>
                          <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-bold text-slate-400 uppercase mt-1">
                            <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> 
                            {reg.programs?.date || 'N/A'} ({reg.programs?.time_range || 'All Day'})
                          </div>
                        </div>
                      </td>

                      <td className="p-4 md:p-6">
                        <Badge className={`rounded-md px-2.5 py-1 font-black uppercase text-[8px] md:text-[9px] border-none shadow-sm ${
                          reg.status?.toLowerCase() === 'attended' 
                          ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-100/80' 
                          : 'bg-amber-100 text-amber-600 hover:bg-amber-100/80'
                        }`}>
                          {reg.status || 'pending'}
                        </Badge>
                      </td>

                      <td className="p-4 md:p-6 text-right">
                        <div className="flex justify-end items-center gap-1.5">
                          <Button 
                            onClick={() => toggleStatus(reg.id, reg.status)}
                            className={`rounded-xl h-9 w-9 p-0 transition-colors shadow-none shrink-0 ${
                              reg.status?.toLowerCase() === 'attended' 
                              ? 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white' 
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                            }`}
                          >
                            {reg.status?.toLowerCase() === 'attended' ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          </Button>

                          <Button 
                            onClick={() => triggerDeleteModal(reg.id, studentName)}
                            className="bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl h-9 w-9 p-0 transition-colors shadow-none shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 opacity-30">
                      <Users className="w-10 h-10" />
                      <p className="font-black uppercase text-[10px] tracking-widest">No matching registrant records found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* CONFIRMATION DELETE MODAL */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md bg-white rounded-[2rem] p-6 border-none shadow-2xl font-sans text-center">
          <div className="mx-auto w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 uppercase tracking-tight text-center">
              Unlink Student From Event?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 text-slate-500 text-xs font-bold leading-relaxed px-1">
            Are you sure you want to remove <span className="font-black text-slate-800 uppercase">"{deleteName}"</span> from this guidance registry track log?
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button 
              variant="ghost" 
              onClick={() => setIsDeleteOpen(false)}
              className="h-11 rounded-xl font-black uppercase text-[10px] tracking-wider text-slate-400 bg-slate-50 hover:bg-slate-100"
            >
              Cancel Operation
            </Button>
            <Button 
              onClick={handleExecuteDelete}
              className="h-11 rounded-xl font-black uppercase text-[10px] tracking-wider bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-100"
            >
              Confirm Removal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}