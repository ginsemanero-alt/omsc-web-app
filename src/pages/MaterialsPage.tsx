import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  LogIn,
  Loader2,
  Search,
} from "lucide-react";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { supabase } from "../lib/supabase"; // 🌟 Ligtas na pipeline fallback
import { usePagination } from "../hooks/usePagination";
import { PaginationControls } from "../components/ui/pagination-controls";
import { IEC_CATEGORIES } from "../lib/iecCategories";

const MATERIALS_PAGE_SIZE = 9;

// A generic stand-in cover — used whenever a material has no decorative
// thumbnail of its own, and always for Image-type materials specifically:
// their "cover" and their actual file are the same upload (see
// MaterialLibrary.tsx), so showing it here would be exactly the leak this
// page exists to close.
const GENERIC_COVER = "https://i.ibb.co/2YNYzpwt/OMSC.png";

// This is a public, logged-out-reachable page — the file itself (file_url)
// is deliberately never fetched, let alone rendered. A visitor sees enough
// to know real content exists; opening it requires signing in, which is
// what IECMaterials.tsx (the authenticated screen) is for.
interface Material {
  id: number;
  title: string;
  type: string;
  description: string;
  category?: string | null;
  image_url?: string | null;
}

const MaterialsPage: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [signInPromptTitle, setSignInPromptTitle] = useState<string | null>(null);

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setIsLoading(true);

        // Program handouts live in this same table (materials.program_id
        // set) but belong only to that program's own details panel, not
        // this general public library — excluding them here keeps them
        // from leaking in miscategorized (e.g. an image handout showing
        // up as an infographic).
        //
        // Column list is deliberate and exhaustive: file_url is never
        // selected, so it can't end up in this page's state, props, or
        // markup no matter how the page is inspected.
        const { data: sbMaterials, error } = await supabase
          .from('materials')
          .select('id, title, type, description, category, image_url')
          .is('program_id', null)
          .is('archived_at', null)
          .order('id', { ascending: false });

        if (!error && sbMaterials) {
          setMaterials(sbMaterials as Material[]);
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

  const getCoverImage = (material: Material) => {
    // Image-type materials have no cover distinct from the file itself —
    // always show the generic placeholder for those, real thumbnail
    // otherwise (falling back to the same placeholder if none was set).
    if (material.type?.toLowerCase() === 'image') return GENERIC_COVER;
    return material.image_url || GENERIC_COVER;
  };

  const filteredMaterials = materials.filter(m =>
    (m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (selectedCategory === "All" || m.category === selectedCategory)
  );

  const {
    page: materialsPage,
    setPage: setMaterialsPage,
    totalPages: materialsTotalPages,
    pageItems: pagedMaterials,
  } = usePagination(filteredMaterials, MATERIALS_PAGE_SIZE);

  useEffect(() => {
    setMaterialsPage(1);
  }, [searchTerm, selectedCategory]);

  return (
    <div className="w-full py-8 md:py-20 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">

        {/* --- HEADER (Mobile Optimized) --- */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 md:mb-12 gap-6">
          <div className="space-y-3 text-center md:text-left">
            <Badge className="bg-indigo-100 text-indigo-600 border-none font-black px-4 py-1 rounded-full uppercase text-[9px] md:text-[10px] tracking-widest inline-block">
              Resources Library
            </Badge>
            <h1 className="text-3xl md:text-6xl font-black uppercase text-slate-900 tracking-tighter leading-none">
              IEC <br className="hidden md:block" /> Materials
            </h1>
            <p className="text-slate-500 font-medium max-w-md mx-auto md:mx-0 text-sm leading-relaxed">
              Educational and guidance materials are available to OMSU students. Sign in to open them.
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

        {/* --- IEC CATEGORY FILTER --- */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8 md:mb-10">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-72 h-12 rounded-2xl border-none shadow-sm bg-white font-bold text-slate-600 uppercase text-[10px] tracking-widest">
              <SelectValue placeholder="IEC Category" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-none shadow-xl bg-white">
              <SelectItem value="All">All IEC Categories</SelectItem>
              {IEC_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* --- CONTENT GRID --- */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Loading...</p>
          </div>
        ) : filteredMaterials.length > 0 ? (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {pagedMaterials.map((material) => {
              const TypeIcon = getTypeIcon(material.type);

              return (
                <Card
                  key={material.id}
                  className="overflow-hidden bg-white rounded-[2rem] md:rounded-[2.5rem] border-none shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 h-full flex flex-col border border-slate-100/60"
                >
                  <div className="relative h-48 md:h-52 overflow-hidden bg-slate-50">
                    <img
                      src={getCoverImage(material)}
                      alt={material.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute top-3 right-3 md:top-4 md:right-4">
                      <Badge className={`border-none font-black uppercase text-[8px] md:text-[9px] px-2.5 py-1 rounded-lg shadow-sm flex items-center ${getTypeBadgeClass(material.type)}`}>
                        <TypeIcon className="h-3 w-3 mr-1" strokeWidth={3} />
                        {material.type}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 flex flex-col flex-grow space-y-3">
                    <Badge className="w-fit border-none font-black uppercase text-[8px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">
                      {material.category || 'General Guidance'}
                    </Badge>
                    <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter leading-tight text-slate-900 line-clamp-2">
                      {material.title}
                    </h3>
                    <p className="text-xs md:text-sm font-medium text-slate-400 leading-relaxed line-clamp-3">
                      {material.description}
                    </p>

                    <div className="pt-5 mt-auto border-t border-slate-50 flex items-center justify-end">
                      <Button
                        onClick={() => setSignInPromptTitle(material.title)}
                        className="h-11 px-6 bg-slate-900 hover:bg-indigo-600 rounded-xl font-black uppercase text-xs text-white"
                      >
                        Sign In to Open <LogIn className="h-3.5 w-3.5 ml-2" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <PaginationControls
            page={materialsPage}
            totalPages={materialsTotalPages}
            totalItems={filteredMaterials.length}
            pageSize={MATERIALS_PAGE_SIZE}
            onPageChange={setMaterialsPage}
            className="mt-8 md:mt-10 bg-white p-4 rounded-2xl shadow-sm"
          />
          </>
        ) : (
          <div className="text-center py-16 md:py-24 bg-white rounded-[2rem] md:rounded-[3rem] shadow-sm border-2 border-dashed border-slate-200 px-6">
            <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs md:text-sm">
              No materials found matching search criteria.
            </p>
          </div>
        )}
      </div>

      {/* --- SIGN-IN PROMPT — never renders file content or a file URL,
          just a plain nudge to log in. --- */}
      <Dialog open={!!signInPromptTitle} onOpenChange={(open) => !open && setSignInPromptTitle(null)}>
        <DialogContent className="max-w-sm rounded-3xl p-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <LogIn className="w-6 h-6" />
          </div>

          <DialogHeader className="mt-4">
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900 text-center">
              Sign In Required
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-slate-500 font-medium mt-1">
            This material is available to OMSU students. Sign in to open it.
          </p>

          <div className="flex gap-3 mt-6">
            <Button
              variant="ghost"
              onClick={() => setSignInPromptTitle(null)}
              className="flex-1 rounded-xl font-black uppercase text-[10px]"
            >
              Cancel
            </Button>
            <Link to="/login" className="flex-1">
              <Button className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px]">
                Sign In
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaterialsPage;
