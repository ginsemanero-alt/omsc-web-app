import React, { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  FileText,
  Video,
  Image as ImageIcon,
  Music,
  Link as LinkIcon,
  ExternalLink,
  Eye,
  Loader2,
  Search,
  HardDrive,
} from "lucide-react";
import { Input } from "../components/ui/input";
import { supabase } from "../lib/supabase"; // 🌟 Ligtas na pipeline fallback

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
  const [previewItem, setPreviewItem] = useState<Material | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setIsLoading(true);

        // --- STEP 1: Subukang tawagin ang Express API Endpoint ---
        try {
          const res = await fetch('/api/materials');
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
        } else if (error) {
          console.error("Error fetching materials from Supabase:", error.message);
        }
      } catch (err) {
        console.error("Error fetching materials master workflow:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaterials();
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
      case "document": return FileText;
      case "video": return Video;
      case "image": return ImageIcon;
      case "audio": return Music;
      case "link": return LinkIcon;
      default: return FileText;
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
      case "document": return "bg-blue-100 text-blue-600";
      case "video": return "bg-red-100 text-red-600";
      case "image": return "bg-emerald-100 text-emerald-600";
      case "audio": return "bg-purple-100 text-purple-600";
      case "link": return "bg-indigo-100 text-indigo-600";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    let videoId = '';
    if (url.includes('v=')) {
      videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  };

  const isVideo = (m: Material) =>
    m.type?.toLowerCase() === 'video' || m.url?.includes('youtube') || m.url?.includes('youtu.be');
  const isImage = (m: Material) =>
    m.type?.toLowerCase() === 'image' || /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(m.url || '');
  const isAudio = (m: Material) =>
    m.type?.toLowerCase() === 'audio' || /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(m.url || '');
  const isLink = (m: Material) => m.type?.toLowerCase() === 'link';
  const isPdf = (m: Material) =>
    m.type?.toLowerCase() === 'pdf' || m.url?.toLowerCase().split('?')[0].endsWith('.pdf');

  const handlePreview = (item: Material) => {
    if (isLink(item)) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }

    setPreviewItem(item);
    setIsPreviewOpen(true);
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
              const image = isImage(material);
              const audio = isAudio(material);

              return (
                <Card
                  key={material.id}
                  className="overflow-hidden bg-white rounded-[2rem] md:rounded-[2.5rem] border-none shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 h-full flex flex-col border border-slate-100/60"
                >
                  <div className="relative h-48 md:h-52 overflow-hidden bg-slate-50">
                    {image ? (
                      <img
                        src={material.url}
                        alt={material.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <img
                        src={material.thumbnail || "https://i.ibb.co/2YNYzpwt/OMSC.png"}
                        alt={material.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute top-3 right-3 md:top-4 md:right-4">
                      <Badge className={`border-none font-black italic uppercase text-[8px] md:text-[9px] px-2.5 py-1 rounded-lg shadow-sm flex items-center ${getTypeBadgeClass(material.type)}`}>
                        <TypeIcon className="h-3 w-3 mr-1" strokeWidth={3} />
                        {material.type}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 flex flex-col flex-grow space-y-3">
                    <h3 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter leading-tight text-slate-900 line-clamp-2">
                      {material.title}
                    </h3>
                    <p className="text-xs md:text-sm font-medium text-slate-400 leading-relaxed italic line-clamp-3">
                      {material.description}
                    </p>

                    {audio ? (
                      <audio src={material.url} controls className="w-full h-10 mt-2" />
                    ) : (
                      <div className="pt-5 mt-auto border-t border-slate-50 flex items-center justify-end">
                        <Button
                          onClick={() => handlePreview(material)}
                          className="h-11 px-6 bg-slate-900 hover:bg-indigo-600 rounded-xl font-black uppercase text-xs text-white"
                        >
                          {isLink(material) ? (
                            <>Open Resource <ExternalLink className="h-3.5 w-3.5 ml-2" /></>
                          ) : (
                            <>Preview <Eye className="h-3.5 w-3.5 ml-2" /></>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
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

      {/* --- PREVIEW MODAL --- */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl flex flex-col">
          <DialogHeader className="p-6 bg-white border-b border-slate-100 shrink-0">
            <DialogTitle className="font-black uppercase tracking-tighter text-xl text-slate-900">
              {previewItem?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 w-full bg-slate-900/50 flex items-center justify-center overflow-hidden relative">
            {previewItem && isVideo(previewItem) ? (
              <iframe
                src={getYouTubeEmbedUrl(previewItem.url)}
                className="w-full aspect-video max-w-4xl rounded-2xl shadow-2xl border-none"
                allowFullScreen
                title="Video Preview"
              />
            ) : previewItem && isPdf(previewItem) ? (
              <iframe
                src={`${previewItem.url}#toolbar=0`}
                className="w-full h-full border-none"
                title="PDF Preview"
              />
            ) : previewItem && isImage(previewItem) ? (
              <div className="p-4 w-full h-full flex items-center justify-center">
                <img src={previewItem.url} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Preview" />
              </div>
            ) : previewItem && isAudio(previewItem) ? (
              <div className="p-8 w-full max-w-xl flex flex-col items-center gap-6">
                <div className="w-24 h-24 rounded-3xl bg-purple-500/10 flex items-center justify-center">
                  <Music className="w-12 h-12 text-purple-400" />
                </div>
                <audio src={previewItem.url} controls className="w-full" />
              </div>
            ) : (
              <div className="text-center">
                <HardDrive className="w-16 h-16 text-slate-700 mx-auto" />
                <p className="font-bold text-slate-500 mt-4 uppercase text-xs">Format not supported for preview</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={() => setIsPreviewOpen(false)} className="rounded-xl font-bold uppercase text-[10px]">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaterialsPage;
