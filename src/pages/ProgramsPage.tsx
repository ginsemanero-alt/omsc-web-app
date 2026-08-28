import React, { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Calendar, MapPin, Users, Loader2, Search } from "lucide-react";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { supabase } from "../lib/supabase"; // 🌟 Ligtas na backend fallback core pipeline

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
  description: string;
  location: string;
  date: string;
  participants?: number;
  status: string;
  guidance_service?: string;
  program_component?: string;
}

const ProgramsPage: React.FC = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [guidanceServiceFilter, setGuidanceServiceFilter] = useState("all");
  const [programComponentFilter, setProgramComponentFilter] = useState("all");

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        setIsLoading(true);

        const { data: sbPrograms, error } = await supabase
          .from('programs')
          .select('*')
          .order('id', { ascending: false });

        if (!error && sbPrograms) {
          const mappedPrograms = sbPrograms.map((p: any) => ({
            id: p.id,
            title: p.title || "Untitled Seminar Event",
            description: p.description || "No description provided.",
            location: p.location || "OMSC Main Venue",
            date: p.date || p.scheduled_date || new Date().toISOString(),
            participants: p.participants || p.max_slots || 0,
            status: p.status || "upcoming",
            guidance_service: p.guidance_service || "",
            program_component: p.program_component || "",
          }));

          setPrograms(mappedPrograms);
        } else if (error) {
          console.error("Error fetching programs from Supabase:", error.message);
        }
      } catch (err) {
        console.error("Error fetching programs master matrix data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPrograms();
  }, []);

  const filteredPrograms = programs.filter((p) => {
    const matchesSearch =
      p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGuidanceService =
      guidanceServiceFilter === "all" || p.guidance_service === guidanceServiceFilter;
    const matchesProgramComponent =
      programComponentFilter === "all" || p.program_component === programComponentFilter;
    return matchesSearch && matchesGuidanceService && matchesProgramComponent;
  });

  return (
    <div className="w-full py-8 md:py-20 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        
        {/* --- HEADER (Stacked on Mobile) --- */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 md:mb-12 gap-6">
          <div className="space-y-4 text-center md:text-left">
            <Badge className="bg-indigo-100 text-indigo-600 border-none font-black px-4 py-1 rounded-full uppercase text-[9px] md:text-[10px] tracking-widest inline-block">
              OMSC Guidance
            </Badge>
            <h1 className="text-3xl md:text-6xl font-black uppercase text-slate-900 tracking-tighter leading-none">
              Guidance <br className="hidden md:block" /> Programs
            </h1>
            <p className="text-slate-500 font-medium max-w-md mx-auto md:mx-0 text-sm leading-relaxed">
              Explore upcoming orientation structures, events, and developmental seminars designed for the growth of OMSC students.
            </p>
          </div>

          {/* Search Bar (Full width on mobile) */}
          <div className="relative w-full lg:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search programs..."
              className="pl-12 h-14 rounded-2xl border-none shadow-sm font-bold bg-white w-full focus:ring-2 focus:ring-indigo-100 text-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Guidance Service / Program Component Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8 md:mb-10">
          <Select value={guidanceServiceFilter} onValueChange={setGuidanceServiceFilter}>
            <SelectTrigger className="w-full sm:w-64 h-12 rounded-2xl border-none shadow-sm bg-white font-bold text-slate-600 uppercase text-[10px] tracking-widest">
              <SelectValue placeholder="Guidance Service" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-none shadow-xl bg-white">
              <SelectItem value="all">All Guidance Services</SelectItem>
              {GUIDANCE_SERVICES.map((service) => (
                <SelectItem key={service} value={service}>{service}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={programComponentFilter} onValueChange={setProgramComponentFilter}>
            <SelectTrigger className="w-full sm:w-64 h-12 rounded-2xl border-none shadow-sm bg-white font-bold text-slate-600 uppercase text-[10px] tracking-widest">
              <SelectValue placeholder="Program Component" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-none shadow-xl bg-white">
              <SelectItem value="all">All Program Components</SelectItem>
              {PROGRAM_COMPONENTS.map((component) => (
                <SelectItem key={component} value={component}>{component}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* --- CONTENT GRID --- */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              Loading Programs Data Matrix...
            </p>
          </div>
        ) : filteredPrograms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {filteredPrograms.map((program) => (
              <Card
                key={program.id}
                className="group p-6 md:p-8 bg-white rounded-[2rem] md:rounded-[2.5rem] border-none shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 cursor-pointer relative overflow-hidden border border-slate-100/60"
              >
                <div className="absolute top-0 left-0 w-1.5 md:w-2 h-full bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {program.guidance_service && (
                        <Badge className="rounded-lg px-2.5 py-1 font-black uppercase text-[8px] tracking-wider border-none bg-indigo-100 text-indigo-600">
                          {program.guidance_service}
                        </Badge>
                      )}
                      {program.program_component && (
                        <Badge className="rounded-lg px-2.5 py-1 font-black uppercase text-[8px] tracking-wider border-none bg-purple-100 text-purple-600">
                          {program.program_component}
                        </Badge>
                      )}
                    </div>

                    <Badge
                      className={`shrink-0 rounded-lg px-3 py-1 font-black uppercase text-[8px] md:text-[9px] tracking-wider border-none ${
                        new Date(program.date) > new Date()
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {new Date(program.date) > new Date() ? "● Upcoming" : "Completed"}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter leading-tight text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                      {program.title}
                    </h3>
                    <p className="text-xs md:text-sm font-medium text-slate-400 leading-relaxed line-clamp-3">
                      {program.description || "No description provided."}
                    </p>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-100/80">
                    {/* Item: Location */}
                    <div className="flex items-center space-x-3 text-[10px] md:text-[11px] font-black uppercase text-slate-400 tracking-wide">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors shrink-0">
                        <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 text-indigo-600" />
                      </div>
                      <span className="truncate">{program.location}</span>
                    </div>

                    {/* Item: Date */}
                    <div className="flex items-center space-x-3 text-[10px] md:text-[11px] font-black uppercase text-slate-400 tracking-wide">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors shrink-0">
                        <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4 text-indigo-600" />
                      </div>
                      <span>
                        {new Date(program.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Item: Participants */}
                    <div className="flex items-center space-x-3 text-[10px] md:text-[11px] font-black uppercase text-slate-400 tracking-wide">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors shrink-0">
                        <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-indigo-600" />
                      </div>
                      <span>
                        {program.participants
                          ? `${program.participants} Slots`
                          : "Open to All"}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 md:py-24 bg-white rounded-[2rem] md:rounded-[3rem] shadow-sm border-2 border-dashed border-slate-200 px-6">
            <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs md:text-sm">
              No programs match your search.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgramsPage;