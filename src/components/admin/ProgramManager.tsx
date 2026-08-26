import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useToast } from '../../hooks/use-toast';
import { Textarea } from '../../components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { 
  Plus, Search, Edit, Trash2, Calendar, MapPin, 
  Loader2, Camera, FileText, ChevronDown, ChevronUp, Download, Clock, AlertCircle
} from 'lucide-react';

export default function ProgramManagement() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const materialRef = useRef<HTMLInputElement>(null);

  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteTargetTitle, setDeleteTargetTitle] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [materialFile, setMaterialFile] = useState<File | null>(null);

  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');

  const [formData, setFormData] = useState({
    title: '', 
    date: '', 
    location: '', 
    program_component: 'Group Guidance',
    guidance_service: 'Career Orientation',
    capacity: 0, 
    status: 'upcoming', 
    image_url: '',
    content: '' 
  });

  const isSystemLocked = programs.some(p => p.status === 'ongoing');

  const isDateOccupied = programs.some(p => 
    p.date === formData.date && 
    p.status !== 'completed' && 
    p.id !== editingId
  );

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('programs')
        .select(`
          *,
          materials (
            id,
            title,
            file_url
          )
        `)
        .order('created_at', { ascending: false }); 

      if (error) throw error;
      setPrograms(data || []);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fetch Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPrograms(); }, []);

  const formatTo12h = (time24: string) => {
    if (!time24) return "";
    const [hour, minute] = time24.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minute} ${ampm}`;
  };

  const handleOpenDialog = (program?: any) => {
    if (program) {
      setEditingId(program.id);
      setFormData({
        title: program.title || '', 
        date: program.date || '',
        location: program.location || '', 
        program_component: program.program_component || 'Group Guidance',
        guidance_service: program.guidance_service || 'Career Orientation',
        capacity: program.capacity || 0, 
        status: program.status || 'upcoming',
        image_url: program.image_url || '', 
        content: program.content || ''
      });
      setPreviewUrl(program.image_url || '');
      
      if (program.time_range && program.time_range.includes(' - ')) {
        const parts = program.time_range.split(' - ');
        setStartTime(parts[0] || '08:00');
        setEndTime(parts[1] || '17:00');
      }
    } else {
      setEditingId(null);
      setFormData({ 
        title: '', date: '', location: '', 
        program_component: 'Group Guidance', guidance_service: 'Career Orientation',
        capacity: 0, status: 'upcoming', image_url: '', content: ''
      });
      setPreviewUrl('');
      setStartTime('08:00');
      setEndTime('17:00');
    }
    setMaterialFile(null);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingId && isSystemLocked) {
      toast({ variant: "destructive", title: "Action Blocked", description: "Close the ongoing program first." });
      return;
    }

    try {
      setLoading(true);
      let finalImageUrl = formData.image_url;

      if (selectedFile) {
        const path = `posters/${Date.now()}_${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage.from('program-posters').upload(path, selectedFile);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('program-posters').getPublicUrl(path);
        finalImageUrl = data.publicUrl;
      }

      const combinedTime = `${formatTo12h(startTime)} - ${formatTo12h(endTime)}`;
      
      const payload = { 
        title: formData.title,
        date: formData.date,
        location: formData.location,
        program_component: formData.program_component,
        guidance_service: formData.guidance_service,
        capacity: Number(formData.capacity),
        status: formData.status,
        image_url: finalImageUrl,
        content: formData.content,
        time_range: combinedTime
      };

      let currentProgramId = editingId;

      if (editingId) {
        const { error } = await supabase.from('programs').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('programs').insert([payload]).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Failed to capture generated record primary key.");
        currentProgramId = data[0].id;
      }

      if (materialFile && currentProgramId) {
        const matPath = `${currentProgramId}/handout_${Date.now()}_${materialFile.name}`;
        const { error: storageError } = await supabase.storage.from('materials').upload(matPath, materialFile);
        if (storageError) throw storageError;
        const { data: matUrl } = supabase.storage.from('materials').getPublicUrl(matPath);
        
        await supabase.from('materials').insert([{
          program_id: currentProgramId,
          title: `HANDOUT: ${materialFile.name}`,
          file_url: matUrl.publicUrl
        }]);
      }

      toast({ title: "Success", description: "Program metrics and structural items synced without cache conflicts." });
      setIsDialogOpen(false);
      fetchPrograms();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const triggerDeleteConfirm = (id: number, title: string) => {
    setDeleteTargetId(id);
    setDeleteTargetTitle(title);
    setIsDeleteOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (!deleteTargetId) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('programs').delete().eq('id', deleteTargetId);
      if (error) throw error;
      
      toast({ title: "Purged Successfully", description: "The guidance folder element was unlinked." });
      setIsDeleteOpen(false);
      fetchPrograms();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-6 pb-20 max-w-[1400px] mx-auto font-sans w-full overflow-hidden animate-in fade-in duration-300">
      
      {/* HEADER ROW ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-100">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase">
            Programs <span className="text-indigo-600">Portal</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest mt-1">Institutional Admin Deck</p>
        </div>
        
        <Button 
          onClick={() => handleOpenDialog()} 
          disabled={isSystemLocked}
          className={`rounded-xl md:rounded-2xl h-12 px-6 md:px-8 font-black uppercase text-[10px] tracking-wider transition-all w-full sm:w-auto ${
            isSystemLocked ? "bg-slate-200 text-slate-400 cursor-not-allowed border-none" : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {isSystemLocked ? (
            <> <Clock className="w-4 h-4 mr-2 shrink-0" /> Deck Locked (Ongoing Event) </>
          ) : (
            <> <Plus className="w-4 h-4 mr-2 shrink-0" /> Create New Program </>
          )}
        </Button>
      </div>

      {/* FILTER SEARCH */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input 
          placeholder="Filter guidance tracks, categories or seminars..." 
          className="pl-12 h-14 rounded-2xl bg-white border-none shadow-sm font-medium text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-100 transition-all"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 gap-4 md:gap-6">
        {programs.filter(p => p.title?.toLowerCase().includes(searchQuery.toLowerCase())).map((program) => {
          const normalHandouts = program.materials?.filter((m: any) => !m.title?.startsWith('CERTIFICATE_TEMPLATE:')) || [];

          return (
            <Card key={program.id} className="overflow-hidden rounded-2xl md:rounded-[2rem] border-none shadow-sm bg-white hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col md:flex-row">
              <div className="md:w-72 h-48 md:h-auto bg-slate-900 relative shrink-0">
                <img src={program.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop'} className="w-full h-full object-cover" alt="" />
                <div className="absolute top-4 left-4">
                  <span className={`text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md ${
                    program.status === 'ongoing' ? 'bg-emerald-500 animate-pulse' : program.status === 'completed' ? 'bg-slate-700' : 'bg-indigo-600'
                  }`}>
                    {program.status}
                  </span>
                </div>
              </div>

              <div className="p-6 md:p-8 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                      <div className="flex flex-wrap gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 font-black uppercase text-[8px] tracking-wider rounded">
                          {program.program_component || 'Group Guidance'}
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 font-black uppercase text-[8px] tracking-wider rounded">
                          {program.guidance_service || 'Career Orientation'}
                        </span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight mt-1 mb-2 leading-tight">
                        {program.title}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> {program.date}</span>
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> {program.time_range || 'N/A'}</span>
                        <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> {program.location}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-1 self-end sm:self-auto">
                      <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl hover:bg-slate-50" onClick={() => handleOpenDialog(program)}>
                        <Edit className="w-4 h-4 text-slate-600"/>
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl hover:bg-rose-50 text-rose-500" onClick={() => triggerDeleteConfirm(program.id, program.title)}>
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <Button 
                    variant="ghost" 
                    className="w-full border-t border-dashed rounded-none pt-4 justify-between text-indigo-600 hover:text-indigo-700 hover:bg-transparent px-0 font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-colors"
                    onClick={() => setExpandedId(expandedId === program.id ? null : program.id)}
                  >
                    {expandedId === program.id ? 'Hide Details' : 'View Details & Materials'}
                    {expandedId === program.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>

                  {expandedId === program.id && (
                    <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-slate-50/70 p-4 md:p-6 rounded-2xl text-slate-600 text-xs md:text-sm leading-relaxed border border-slate-100/40">
                        <Label className="text-[8px] md:text-[9px] font-black uppercase text-indigo-500 block mb-2 tracking-widest">Description Manual Context</Label>
                        <p className="font-medium whitespace-pre-wrap">{program.content || "No extended descriptions mapped for this entry."}</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[8px] md:text-[9px] font-black uppercase text-indigo-500 block mb-1 tracking-widest">Downloadable Handouts Ledger</Label>
                        {normalHandouts.length > 0 ? (
                          <div className="space-y-2">
                            {normalHandouts.map((mat: any) => (
                              <a key={mat.id} href={mat.file_url} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3.5 bg-white border border-slate-100 hover:border-indigo-500 rounded-xl transition-all shadow-sm group/item">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                  <span className="text-[11px] font-black text-slate-700 truncate max-w-[180px] uppercase tracking-tight">{mat.title.replace('HANDOUT: ', '')}</span>
                                </div>
                                <Download className="w-3.5 h-3.5 text-slate-400 group-hover/item:text-indigo-600 transition-colors shrink-0" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[9px] text-slate-400 font-bold italic uppercase tracking-wider ml-1">No file attachments bound to slot.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* CREATE MODAL */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-2xl md:rounded-[2.5rem] p-5 md:p-8 max-h-[92vh] overflow-y-auto border-none shadow-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="text-2xl md:text-3xl font-black uppercase italic tracking-tight text-slate-900">
              Setup <span className="text-indigo-600">Program Manual</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-5 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Poster Cover Asset</Label>
                  <div onClick={() => fileInputRef.current?.click()} className="aspect-video bg-slate-50 hover:bg-slate-100/70 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden relative transition-colors">
                    {previewUrl ? (
                      <img src={previewUrl} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <div className="text-center p-4">
                        <Camera className="mx-auto text-slate-300 mb-1 w-6 h-6"/>
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest block">Upload Event Poster</span>
                      </div>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if(file) { setSelectedFile(file); setPreviewUrl(URL.createObjectURL(file)); }
                    }} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Activity Title</Label>
                  <Input value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-slate-700 text-sm focus-visible:ring-2 focus-visible:ring-indigo-100" placeholder="e.g., Mental Health Orientation" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Extended Description Logistics</Label>
                <Textarea 
                  value={formData.content} 
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  placeholder="Outline full timeline coordinates, scope context information notes here..."
                  className="h-[150px] md:h-[210px] rounded-xl md:rounded-2xl bg-slate-50 border-none p-4 font-medium text-slate-600 text-xs md:text-sm resize-none focus-visible:ring-2 focus-visible:ring-indigo-100 leading-relaxed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className={`text-[9px] md:text-[10px] font-black uppercase tracking-wider ml-1 ${isDateOccupied ? 'text-rose-500' : 'text-slate-400'}`}>Target Calendar Date</Label>
                <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className={`rounded-xl bg-slate-50 border-none h-12 font-bold px-3 text-xs text-slate-700 transition-all focus-visible:ring-2 focus-visible:ring-indigo-100 ${isDateOccupied ? 'ring-2 ring-rose-500 bg-rose-50/60' : ''}`} />
                {isDateOccupied && <p className="text-[8px] text-rose-500 font-black uppercase flex items-center gap-1 ml-1 tracking-wider animate-bounce"><AlertCircle className="w-3 h-3 shrink-0" /> Date occupied</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Start Event</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-3 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-100" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">End Session</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-3 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-100" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Program Component</Label>
                <select value={formData.program_component} onChange={(e) => setFormData({...formData, program_component: e.target.value})} className="w-full h-12 rounded-xl bg-slate-50 border-none px-4 font-bold text-xs uppercase text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  <option value="Group Guidance">Group Guidance</option>
                  <option value="Individual Student Planning">Individual Student Planning</option>
                  <option value="Responsive Services">Responsive Services</option>
                  <option value="System Support">System Support</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Guidance Service</Label>
                <select value={formData.guidance_service} onChange={(e) => setFormData({...formData, guidance_service: e.target.value})} className="w-full h-12 rounded-xl bg-slate-50 border-none px-4 font-bold text-xs uppercase text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  <option value="Information Services">Information Services</option>
                  <option value="Individual Inventory">Individual Inventory</option>
                  <option value="Research and Evaluation">Research and Evaluation</option>
                  <option value="Career Orientation">Career Orientation</option>
                  <option value="Testing Services">Testing Services</option>
                  <option value="Counseling Services">Counseling Services</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Location Venue Anchor</Label>
                <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-100" placeholder="e.g., Campus Gym / Social Hall" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Seat Capacity Limit</Label>
                <Input type="number" value={formData.capacity} onChange={(e) => setFormData({...formData, capacity: Number(e.target.value)})} className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-xs text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-100" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Session Handouts File</Label>
              <div onClick={() => materialRef.current?.click()} className="h-12 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center px-4 cursor-pointer border-none text-slate-600 text-xs">
                <FileText className="w-4 h-4 text-indigo-500 mr-2 shrink-0" />
                <span className="truncate flex-1 font-bold">{materialFile ? materialFile.name : 'Choose Handouts...'}</span>
                <input type="file" ref={materialRef} className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => setMaterialFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[9px] md:text-[10px] font-black uppercase ml-1 text-slate-400 tracking-wider">Runtime Status Track</Label>
              <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} className="w-full h-12 rounded-xl bg-slate-50 border-none px-4 font-bold text-xs uppercase text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="pt-2">
              <Button onClick={handleSave} disabled={loading || isDateOccupied} className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-xs shadow-md">
                {loading ? <Loader2 className="animate-spin h-5 h-5 mx-auto" /> : isDateOccupied ? 'Date Conflict Lock Active' : (editingId ? 'Save & Sync Updates' : 'Confirm & Publish Event')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE MODAL */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md bg-white rounded-[2rem] p-6 border-none shadow-2xl font-sans text-center">
          <div className="mx-auto w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <DialogHeader><DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight text-center">Purge Guidance Element?</DialogTitle></DialogHeader>
          <div className="mt-3 text-slate-500 text-xs font-medium leading-relaxed px-2">You are about to unregister <span className="font-bold text-slate-800 uppercase">"{deleteTargetTitle}"</span>. This action cannot be undone.</div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider text-slate-500 bg-slate-50 hover:bg-slate-100">Cancel</Button>
            <Button onClick={handleExecuteDelete} className="h-12 rounded-xl font-black uppercase text-[10px] tracking-wider bg-rose-600 text-white shadow-md">Confirm Deletion</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}