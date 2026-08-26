import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';
import { 
  User, ShieldCheck, Loader2, Save, GraduationCap 
} from 'lucide-react';

export default function StudentProfile() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Profile Form States
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [program, setProgram] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState<number | string>('');
  const [isPwd, setIsPwd] = useState<boolean>(false);
  const [isIp, setIsIp] = useState<boolean>(false);

  // Fetch Student Profile Data
  const fetchProfileData = useCallback(async (userId: string) => {
    try {
      setFetching(true);

      // Kunan din ng email mula sa Supabase Auth Session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setEmail(session.user.email);
      }

      // Query sa 'profiles' table
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setFullName(data.full_name || '');
        setProgram(data.program || '');
        setYearLevel(data.year_level || '');
        setGender(data.gender || '');
        setAge(data.age || '');
        setIsPwd(!!data.is_pwd);
        setIsIp(!!data.is_ip);
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error.message);
      toast({
        variant: "destructive",
        title: "Error Loading Profile",
        description: error.message
      });
    } finally {
      setFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const id = session?.user?.id ?? null;
      setCurrentUserId(id);
      if (id) {
        fetchProfileData(id);
      } else {
        setFetching(false);
      }
    }
    init();
  }, [fetchProfileData]);

  // Save / Update Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName || !program || !yearLevel || !gender || !age) {
      toast({
        title: "Validation Warning",
        description: "Mangyaring kumpletuhin ang lahat ng kinakailangang impormasyon.",
        variant: "destructive"
      });
      return;
    }

    if (!currentUserId) return;

    setLoading(true);
    try {
      // Payload na tumutugma sa 'profiles' table columns
      const payload = {
        id: currentUserId,
        full_name: fullName,
        program: program,
        year_level: yearLevel,
        gender: gender,
        age: Number(age),
        is_pwd: isPwd,
        is_ip: isIp,
        user_role: 'student'
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      toast({
        title: "PROFILE UPDATED",
        description: "Matagumpay na na-update ang iyong profile information.",
        className: "bg-emerald-600 text-white font-bold rounded-2xl"
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "UPDATE FAILED",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 md:space-y-10 font-sans w-full overflow-hidden animate-in fade-in duration-300">
      
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b pb-6 border-slate-200">
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
            Student <span className="text-indigo-600">Profile</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase text-[9px] md:text-[10px] tracking-widest mt-2 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" /> Demographics & Academic Profile Setup
          </p>
        </div>
      </div>

      {fetching ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white rounded-2xl border shadow-sm">
          <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
        </div>
      ) : (
        <Card className="p-6 md:p-10 border-none shadow-xl bg-white rounded-2xl md:rounded-[3rem] relative overflow-hidden border-t-4 border-t-indigo-600 shadow-slate-100">
          <form onSubmit={handleSaveProfile} className="space-y-8">
            
            {/* SECTION 1: ACADEMIC INFORMATION */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-black uppercase italic tracking-tight text-slate-800">
                  Academic Information
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Email Address
                  </Label>
                  <Input 
                    type="email" 
                    value={email} 
                    disabled 
                    className="h-12 bg-slate-100 border-none rounded-xl font-bold px-4 text-xs text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Full Name
                  </Label>
                  <Input 
                    type="text" 
                    placeholder="Juan Dela Cruz" 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    required 
                    className="h-12 bg-slate-50 border-none rounded-xl font-bold px-4 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Course / Program
                  </Label>
                  <Select value={program} onValueChange={setProgram} required>
                    <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold px-4 text-xs">
                      <SelectValue placeholder="Select Course" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-2xl bg-white">
                      <SelectItem value="BSIT">BSIT - Bachelor of Science in Information Technology</SelectItem>
                      <SelectItem value="BSBA">BSBA - Bachelor of Science in Business Administration</SelectItem>
                      <SelectItem value="BSED">BSED - Bachelor of Secondary Education</SelectItem>
                      <SelectItem value="BEED">BEED - Bachelor of Elementary Education</SelectItem>
                      <SelectItem value="BSHM">BSHM - Bachelor of Science in Hospitality Management</SelectItem>
                      <SelectItem value="BSAgri">BSAgri - Bachelor of Science in Agriculture</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Year Level
                  </Label>
                  <Select value={yearLevel} onValueChange={setYearLevel} required>
                    <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold px-4 text-xs">
                      <SelectValue placeholder="Select Year Level" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-2xl bg-white">
                      <SelectItem value="1st Year">1st Year</SelectItem>
                      <SelectItem value="2nd Year">2nd Year</SelectItem>
                      <SelectItem value="3rd Year">3rd Year</SelectItem>
                      <SelectItem value="4th Year">4th Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* SECTION 2: DEMOGRAPHICS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <User className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-black uppercase italic tracking-tight text-slate-800">
                  Demographics & Diversity
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Gender
                  </Label>
                  <Select value={gender} onValueChange={setGender} required>
                    <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold px-4 text-xs">
                      <SelectValue placeholder="Select Gender" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-2xl bg-white">
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Age
                  </Label>
                  <Input 
                    type="number" 
                    placeholder="e.g. 20" 
                    min={15} 
                    max={100} 
                    value={age} 
                    onChange={(e) => setAge(e.target.value)} 
                    required 
                    className="h-12 bg-slate-50 border-none rounded-xl font-bold px-4 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* PWD / IP Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div 
                  onClick={() => setIsPwd(!isPwd)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                    isPwd ? 'bg-indigo-50 border-indigo-500 text-indigo-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-xs">Person with Disability (PWD)</p>
                    <p className="text-[10px] text-slate-400 font-medium">Are you a registered PWD student?</p>
                  </div>
                  <Badge className={`uppercase text-[9px] font-black px-3 py-1 ${isPwd ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {isPwd ? 'YES' : 'NO'}
                  </Badge>
                </div>

                <div 
                  onClick={() => setIsIp(!isIp)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                    isIp ? 'bg-indigo-50 border-indigo-500 text-indigo-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-xs">Indigenous People (IP)</p>
                    <p className="text-[10px] text-slate-400 font-medium">Do you belong to an IP community?</p>
                  </div>
                  <Badge className={`uppercase text-[9px] font-black px-3 py-1 ${isIp ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {isIp ? 'YES' : 'NO'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <Button 
              type="submit" 
              disabled={loading || !currentUserId} 
              className="w-full h-14 bg-slate-900 hover:bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save & Update Profile
                </>
              )}
            </Button>

          </form>
        </Card>
      )}

    </div>
  );
}