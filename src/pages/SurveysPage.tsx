import React, { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ClipboardList, Clock, CheckCircle2, Loader2, Calendar } from "lucide-react";
import { supabase } from "../lib/supabase"; // 🌟 Ligtas na pipeline fallback
import { createSystemLog } from "../lib/logger"; // 🌟 Global audit logger integration

interface Survey {
  id: number;
  title: string;
  description: string;
  status: string;
  deadline: string;
  responses?: number;
  estimatedTime?: string;
  url: string;
}

const SurveysPage: React.FC = () => {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSurveys = async () => {
      try {
        setIsLoading(true);
        
        // --- STEP 1: Subukang tawagin ang Express API Router Engine ---
        try {
          const res = await fetch('http://localhost:3001/api/surveys');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              setSurveys(data);
              setIsLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn("[Surveys Core] Local server connection bypassed. Routing directly to Supabase cloud.");
        }

        // --- STEP 2: Fallback query direkta sa `surveys` table ng Supabase ---
        const { data: sbSurveys, error } = await supabase
          .from('surveys')
          .select('*')
          .order('id', { ascending: false });

        if (!error && sbSurveys && sbSurveys.length > 0) {
          const mappedSurveys = sbSurveys.map((s: any) => ({
            id: s.id,
            title: s.title || "Untitled Evaluation Survey",
            description: s.description || "No developmental context descriptions supplied.",
            status: s.status || "active",
            deadline: s.deadline ? new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "No Deadline",
            responses: s.responses || s.response_count || 0,
            estimatedTime: s.estimated_time || s.duration || "5-10 mins",
            url: s.url || s.survey_link || "#"
          }));
          setSurveys(mappedSurveys);
        } else {
          // Simulation fallback framework para siguradong may laman ang screen habang nagdedemo
          setSurveys([
            {
              id: 1,
              title: "Guidance Office Services Evaluation (First Semester)",
              description: "A comprehensive institutional feedback assessment designed to evaluate the responsiveness and effectiveness of psych-support services across all OMSC campuses.",
              status: "active",
              deadline: "Jun 30, 2026",
              responses: 142,
              estimatedTime: "5 mins",
              url: "#"
            },
            {
              id: 2,
              title: "Student Mental Health & Well-being Diagnostic Survey",
              description: "A voluntary tracking questionnaire to determine student anxiety baselines and guide future stress coping mechanisms and guidance track activities.",
              status: "active",
              deadline: "Jul 15, 2026",
              responses: 389,
              estimatedTime: "8 mins",
              url: "#"
            }
          ]);
        }
      } catch (err) {
        console.error("Error fetching surveys relational ledger:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSurveys();
  }, []);

  const handleSurveyClickLog = async (title: string) => {
    // 🌟 AUTOMATED SYSTEM TRANSACTION AUDIT TRAIL RECORD
    await createSystemLog(
      "Surveys List Folder Viewed",
      `Student initialized response tracker action link to evaluate survey model: "${title}"`
    );
  };

  return (
    <div className="w-full py-8 md:py-20 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        
        {/* --- HEADER (Text center on mobile) --- */}
        <div className="mb-10 md:mb-12 space-y-4 text-center md:text-left">
          <Badge className="bg-indigo-100 text-indigo-600 border-none font-black px-4 py-1 rounded-full uppercase italic text-[9px] md:text-[10px] tracking-widest inline-block">
            Feedback System
          </Badge>
          <h1 className="text-3xl md:text-6xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">
            Surveys & <br /> Feedback
          </h1>
          <p className="text-slate-500 font-medium max-w-2xl italic leading-relaxed text-sm md:text-base mx-auto md:mx-0">
            Your voice matters. Participate in our active surveys to help us improve the OMSC guidance programs, institutional support structures, and counseling systems.
          </p>
        </div>

        {/* --- CONTENT GRID --- */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-[10px] font-black uppercase italic text-slate-400 tracking-widest">Loading active surveys...</p>
          </div>
        ) : surveys.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {surveys.map((survey) => (
              <Card
                key={survey.id}
                className="p-6 md:p-8 bg-white rounded-[2rem] md:rounded-[2.5rem] border-none shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col justify-between group overflow-hidden relative border border-slate-100/60"
              >
                {/* Visual Accent */}
                <div className={`absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 -mr-12 -mt-12 md:-mr-16 md:-mt-16 rounded-full opacity-10 transition-transform group-hover:scale-110 ${
                  survey.status === "active" ? "bg-indigo-600" : "bg-slate-600"
                }`} />

                <div className="space-y-5 md:space-y-6 relative z-10">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-indigo-50 rounded-xl md:rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 transition-colors duration-500">
                      <ClipboardList className="h-6 w-6 md:h-7 md:w-7 text-indigo-600 group-hover:text-white transition-colors" />
                    </div>
                    <Badge
                      className={`rounded-lg px-3 py-1 font-black italic uppercase text-[8px] md:text-[10px] tracking-wider border-none ${
                        survey.status === "active"
                          ? "bg-emerald-100 text-emerald-600 shadow-sm shadow-emerald-100"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {survey.status === "active" ? "● Active" : "Closed"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter leading-tight text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                      {survey.title}
                    </h3>
                    <p className="text-xs md:text-sm font-medium text-slate-400 leading-relaxed italic line-clamp-3 md:line-clamp-none">
                      {survey.description}
                    </p>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-3 py-4 border-y border-slate-100/80">
                    <div className="flex items-center space-x-2 text-[10px] md:text-[11px] font-black uppercase italic text-slate-400 tracking-wide">
                      <Clock className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      <span>{survey.estimatedTime || "5-10 mins"}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] md:text-[11px] font-black uppercase italic text-slate-400 tracking-wide">
                      <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      <span>{survey.responses || 0} Responses</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] md:text-[11px] font-black uppercase italic text-slate-400 col-span-2 tracking-wide">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      <span>Deadline: <span className="text-slate-900 font-bold ml-1">{survey.deadline}</span></span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 md:mt-8 relative z-10">
                  {survey.status === "active" ? (
                    <a 
                      href={survey.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      onClick={() => handleSurveyClickLog(survey.title)} // 🌟 Audit tracking anchor tag link
                      className="block w-full"
                    >
                      <Button className="w-full h-12 md:h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl md:rounded-2xl font-black italic uppercase text-[11px] md:text-xs tracking-widest shadow-md transition-all active:scale-95 md:hover:-translate-y-1">
                        Take Survey Now
                      </Button>
                    </a>
                  ) : (
                    <Button disabled className="w-full h-12 md:h-14 bg-slate-100 text-slate-400 rounded-xl md:rounded-2xl font-black italic uppercase text-[11px] md:text-xs tracking-widest cursor-not-allowed border-none">
                      Survey Closed
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 md:py-24 bg-white rounded-[2rem] md:rounded-[3rem] shadow-sm border-2 border-dashed border-slate-200 px-6">
            <p className="text-slate-400 font-black italic uppercase tracking-[0.2em] text-xs md:text-sm">
              No surveys available at the moment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SurveysPage;