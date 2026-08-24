import React, { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { FileText, Video, Image as ImageIcon, Download, Loader2, Search } from "lucide-react";
import { Input } from "../components/ui/input";
import { supabase } from "../lib/supabase"; // 🌟 Ligtas na pipeline fallback
import { createSystemLog } from "../lib/logger"; // 🌟 Global audit log connection

interface Material {
  id: number;
  title: string;
  type: string;
  description: string;
  thumbnail: string;
  url: string;
  downloads?: number;
}

const MaterialsPage: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setIsLoading(true);
        
        // --- STEP 1: Subukang tawagin ang Express API Endpoint ---
        try {
          const res = await fetch('http://localhost:3001/api/materials');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              setMaterials(data);
              setIsLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn("[Materials Hub] Local server bypassed, routing directly to Supabase.");
        }

        // --- STEP 2: Fallback query direkta sa `materials` table ng Supabase ---
        const { data: sbMaterials, error } = await supabase
          .from('materials')
          .select('*')
          .order('id', { ascending: false });

        if (!error && sbMaterials) {
          // I-map ang database format kung iba man ang columns mo (e.g., file_url -> url)
          const mappedMaterials = sbMaterials.map((m: any) => ({
            id: m.id,
            title: m.title || m.name || "Untitled Resource",
            type: m.type || m.file_type || "document",
            description: m.description || "No description provided.",
            thumbnail: m.thumbnail || m.preview_url || "",
            url: m.url || m.file_url || "#",
            downloads: m.downloads || m.view_count || 0
          }));
          
          setMaterials(mappedMaterials);
        } else {
          // Simulation fallback kung bago pa ang database at wala pang in-upload si counselor
          setMaterials([
            {
              id: 1,
              title: "Mental Health Awareness Handbook",
              type: "document",
              description: "A comprehensive guide on managing stress and academic anxiety for OMSC students.",
              thumbnail: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=400",
              url: "#",
              downloads: 42
            },
            {
              id: 2,
              title: "Overcoming Academic Burnout Orientation",
              type: "video",
              description: "Recorded video seminar tracking effective self-care routines during examination weeks.",
              thumbnail: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=400",
              url: "#",
              downloads: 89
            }
          ]);
        }
      } catch (err) {
        console.error("Error fetching materials master workflow:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMaterials();
  }, []);

  const handleOpenFileLog = async (title: string) => {
    // 🌟 AUTOMATIC TRANSACTION AUDIT LOG: Itatala kapag binuksan ang handout file
    await createSystemLog(
      "Information Service Catalog Viewed", 
      `Student accessed and downloaded reference resource handout asset: "${title}"`
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "document": return FileText;
      case "video": return Video;
      case "image": return ImageIcon;
      default: return FileText;
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "document": return "bg-blue-100 text-blue-600";
      case "video": return "bg-red-100 text-red-600";
      case "image": return "bg-emerald-100 text-emerald-600";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  const filteredMaterials = materials.filter(m =>
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full py-8 md:py-20 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        
        {/* --- HEADER (Mobile Optimized) --- */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 md:mb-12 gap-6">
          <div className="space-y-3 text-center md:text-left">
            <Badge className="bg-indigo-100 text-indigo-600 border-none font-black px-4 py-1 rounded-full uppercase italic text-[9px] md:text-[10px] tracking-widest inline-block">
              Resources Library
            </Badge>
            <h1 className="text-3xl md:text-6xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">
              IEC <br className="hidden md:block" /> Materials
            </h1>
            <p className="text-slate-500 font-medium max-w-md italic mx-auto md:mx-0 text-sm leading-relaxed">
              Access educational and information materials for your personal development and guidance support.
            </p>
          </div>

          <div className="relative w-full lg:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input 
              placeholder="Search materials by title or keyword..." 
              className="pl-12 h-14 rounded-2xl border-none shadow-sm font-bold bg-white w-full focus:ring-2 focus:ring-indigo-100 text-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* --- CONTENT GRID --- */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-[10px] font-black uppercase italic text-slate-400 tracking-widest">Fetching Library...</p>
          </div>
        ) : filteredMaterials.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {filteredMaterials.map((material) => {
              const TypeIcon = getTypeIcon(material.type);
              return (
                <a 
                  key={material.id} 
                  href={material.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={() => handleOpenFileLog(material.title)} // 🌟 Kinabit ang log activator sa click event
                  className="group block no-underline"
                >
                  <Card className="overflow-hidden bg-white rounded-[2rem] md:rounded-[2.5rem] border-none shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 h-full flex flex-col border border-slate-100/60">
                    <div className="relative h-48 md:h-52 overflow-hidden bg-slate-50">
                      <img
                        src={material.thumbnail || "https://i.ibb.co/2YNYzpwt/OMSC.png"}
                        alt={material.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        loading="lazy"
                      />
                      <div className="absolute top-3 right-3 md:top-4 md:right-4">
                        <Badge className={`border-none font-black italic uppercase text-[8px] md:text-[9px] px-2.5 py-1 rounded-lg shadow-sm flex items-center ${getTypeBadgeClass(material.type)}`}>
                          <TypeIcon className="h-3 w-3 mr-1" strokeWidth={3} />
                          {material.type}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="p-6 md:p-8 flex flex-col flex-grow space-y-3">
                      <h3 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter leading-tight text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                        {material.title}
                      </h3>
                      <p className="text-xs md:text-sm font-medium text-slate-400 leading-relaxed italic line-clamp-3">
                        {material.description}
                      </p>
                      
                      <div className="pt-5 mt-auto border-t border-slate-50 flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-[10px] md:text-[11px] font-black uppercase italic text-slate-400">
                          <Download className="h-3.5 w-3.5 text-indigo-600" />
                          <span>{material.downloads || 0} views</span>
                        </div>
                        <span className="text-indigo-600 text-[10px] md:text-[11px] font-black uppercase italic group-hover:translate-x-1.5 transition-transform">
                          Open File →
                        </span>
                      </div>
                    </div>
                  </Card>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 md:py-24 bg-white rounded-[2rem] md:rounded-[3rem] shadow-sm border-2 border-dashed border-slate-200 px-6">
            <p className="text-slate-400 font-black italic uppercase tracking-[0.2em] text-xs md:text-sm">
              No materials found matching search criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialsPage;