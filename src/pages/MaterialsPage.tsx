import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  LogIn,
  Music,
  PlayCircle,
  Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { supabase } from "../lib/supabase";
import { usePagination } from "../hooks/usePagination";
import { useAuth } from "../hooks/useAuth";
import { IEC_CATEGORIES } from "../lib/iecCategories";
import SitePagination from "../components/shared/SitePagination";

const MATERIALS_PAGE_SIZE = 9;

// Where a student opens materials (the IEC Library). Visitors sign in
// first and are sent there afterwards (?redirect, see App.tsx).
const STUDENT_MATERIALS_PATH = "/student/materials";

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

// This is a public, logged-out-reachable page. Opening a material must
// require signing in so every view is recorded, so:
// - file_url is never selected, so it can't reach this page's state or
//   markup no matter how the page is inspected;
// - an infographic (Image type) never shows its image here: its cover
//   and its content are the same upload (see MaterialLibrary.tsx).
interface Material {
  id: number;
  title: string;
  type: string;
  description: string;
  category?: string | null;
  image_url?: string | null;
}

interface TypeStyle {
  label: string;
  icon: React.ElementType;
  tile: string; // tile background
  ink: string; // icon + badge text
}

// Type -> badge label, tint, and icon.
function typeStyle(type: string): TypeStyle {
  switch ((type || "").toLowerCase()) {
    case "image":
      return { label: "Infographic", icon: ImageIcon, tile: "bg-[#E0E7FF]", ink: "text-[#4338CA]" };
    case "video":
      return { label: "Video", icon: PlayCircle, tile: "bg-[#FEF3C7]", ink: "text-[#B45309]" };
    case "audio":
      return { label: "Audio", icon: Music, tile: "bg-[#EDE9FE]", ink: "text-[#6D28D9]" };
    case "link":
      return { label: "Link", icon: LinkIcon, tile: "bg-[#E0F2FE]", ink: "text-[#0369A1]" };
    default:
      return { label: "Document", icon: FileText, tile: "bg-[#D1FAE5]", ink: "text-[#047857]" };
  }
}

// A cover image is shown only when it is a separate cover, never the
// content itself — so never for infographics.
function coverImage(material: Material): string | null {
  if ((material.type || "").toLowerCase() === "image") return null;
  return material.image_url || null;
}

const MaterialsPage = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();

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
        // this general public library.
        //
        // Column list is deliberate and exhaustive: file_url is never
        // selected.
        const { data: sbMaterials, error } = await supabase
          .from("materials")
          .select("id, title, type, description, category, image_url")
          .is("program_id", null)
          .is("archived_at", null)
          .order("id", { ascending: false });

        if (!error && sbMaterials) {
          setMaterials(sbMaterials as Material[]);
        } else if (error) {
          console.error("Error fetching materials from Supabase:", error.message);
        }
      } catch (err) {
        console.error("Error fetching materials:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaterials();
  }, []);

  const filteredMaterials = materials.filter(
    (m) =>
      ((m.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.description || "").toLowerCase().includes(searchTerm.toLowerCase())) &&
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

  // Signed-in students open the IEC Library directly; everyone else gets
  // the sign-in prompt (nothing of the file is shown here).
  const openMaterial = (material: Material) => {
    if (user && role === "student") {
      navigate(STUDENT_MATERIALS_PATH);
    } else {
      setSignInPromptTitle(material.title);
    }
  };

  const chipClass = (selected: boolean) =>
    `h-11 px-4 rounded-full border-[1.5px] text-sm text-left transition-colors ${focusRing} ${
      selected
        ? "border-[#4F46E5] bg-[#4F46E5] text-white font-bold"
        : "border-[#DDE1EE] bg-white text-[#1E293B] font-semibold hover:border-[#A5B4FC]"
    }`;

  return (
    <div className="w-full font-figtree text-[#1E293B] pb-16 lg:pb-24">
      <div className="max-w-[1440px] mx-auto">
        {/* ================= HEADER ================= */}
        <section className="px-3 pt-3 lg:px-6 lg:pt-2">
          <div className="rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white px-[22px] py-9 sm:px-10 lg:px-[72px] lg:py-16">
            <div className="flex flex-col gap-3.5 lg:gap-[18px] max-w-[760px]">
              <h1 className="m-0 font-bricolage font-extrabold text-[40px] sm:text-5xl lg:text-[64px] leading-[1.02] tracking-[-0.02em]">
                IEC materials
              </h1>
              <p className="m-0 text-base lg:text-lg leading-[1.55] text-[#C7C9F2]">
                Infographics, videos, and guides from the Guidance and Testing Center. View them here, anytime, on any
                device.
              </p>
            </div>
          </div>
        </section>

        {/* ================= FILTERS ================= */}
        <section className="px-3 pt-6 lg:px-[72px] lg:pt-10">
          <div className="rounded-[2rem] bg-white p-4 sm:p-6 flex flex-col gap-[18px]">
            <div className="relative">
              <Search
                className="absolute left-[18px] top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="material-search" className="sr-only">
                Search materials
              </label>
              <input
                id="material-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search materials by title or keyword"
                className="w-full h-[52px] pl-12 pr-4 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-[#F5F6FB] text-base md:text-[15px] text-[#1E293B] placeholder:text-[#8A91A6] outline-none focus:outline-[3px] focus:outline-offset-2 focus:outline-[#A5B4FC]"
              />
            </div>

            <div role="group" aria-label="Filter by IEC category" className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={selectedCategory === "All"}
                onClick={() => setSelectedCategory("All")}
                className={chipClass(selectedCategory === "All")}
              >
                All categories
              </button>
              {IEC_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selectedCategory === category}
                  onClick={() => setSelectedCategory(category)}
                  className={chipClass(selectedCategory === category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ================= RESULTS ================= */}
        <section className="px-3 pt-6 lg:px-[72px] lg:pt-8 flex flex-col gap-5">
          {isLoading ? (
            <div className="flex flex-col gap-5" aria-live="polite">
              <p className="m-0 flex items-center gap-2 text-[15px] text-[#5B6477]">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading materials...
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5" aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="rounded-[28px] lg:rounded-[32px] bg-white overflow-hidden">
                    <div className="h-[180px] bg-[#E0E7FF] animate-pulse" />
                    <div className="p-6 flex flex-col gap-3">
                      <div className="h-3 w-1/3 rounded-full bg-slate-200 animate-pulse" />
                      <div className="h-5 w-4/5 rounded-full bg-slate-200 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="rounded-[2rem] bg-white px-6 py-14 lg:py-20 text-center flex flex-col items-center gap-3">
              <Search className="w-8 h-8 text-[#A5ADC6]" aria-hidden="true" />
              <p className="m-0 font-bricolage font-extrabold text-2xl text-[#1E1B4B]">No materials found</p>
              <p className="m-0 text-[15px] text-[#5B6477] max-w-md">
                {materials.length === 0
                  ? "No materials have been posted yet. Check back soon."
                  : "No materials match your search or category. Try another word or clear the filters."}
              </p>
              {materials.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedCategory("All");
                  }}
                  className={`mt-2 h-11 px-5 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] transition-colors ${focusRing}`}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="m-0 text-[15px] text-[#5B6477]" aria-live="polite">
                Showing{" "}
                <strong className="text-[#1E1B4B]">
                  {filteredMaterials.length} {filteredMaterials.length === 1 ? "material" : "materials"}
                </strong>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
                {pagedMaterials.map((material) => {
                  const style = typeStyle(material.type);
                  const TypeIcon = style.icon;
                  const cover = coverImage(material);

                  return (
                    <button
                      key={material.id}
                      type="button"
                      onClick={() => openMaterial(material)}
                      aria-label={`Open ${style.label.toLowerCase()}: ${material.title}`}
                      className={`group text-left rounded-[28px] lg:rounded-[32px] bg-white overflow-hidden flex flex-col hover:shadow-[0_20px_40px_-20px_rgba(30,27,75,0.35)] hover:-translate-y-1 transition-all ${focusRing}`}
                    >
                      <div className={`relative h-[180px] w-full flex items-center justify-center ${style.tile}`}>
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <TypeIcon className={`w-14 h-14 ${style.ink}`} strokeWidth={1.6} aria-hidden="true" />
                        )}
                        <span
                          className={`absolute top-3.5 left-3.5 px-3 py-1.5 rounded-full bg-white font-extrabold text-xs ${style.ink}`}
                        >
                          {style.label}
                        </span>
                      </div>

                      <div className="px-5 pt-5 pb-6 lg:px-6 flex flex-col gap-2">
                        {material.category && (
                          <span className="text-[13px] font-semibold text-[#4338CA]">{material.category}</span>
                        )}
                        <h2 className="m-0 font-bold text-lg leading-[1.3] text-[#1E1B4B] line-clamp-2 group-hover:text-[#4338CA] transition-colors">
                          {material.title}
                        </h2>
                      </div>
                    </button>
                  );
                })}
              </div>

              <SitePagination page={materialsPage} totalPages={materialsTotalPages} onPageChange={setMaterialsPage} />
            </>
          )}
        </section>
      </div>

      {/* ================= SIGN-IN PROMPT =================
          Never renders file content or a file URL — just a nudge to sign
          in, after which the student lands in the IEC Library. */}
      <Dialog open={!!signInPromptTitle} onOpenChange={(open) => !open && setSignInPromptTitle(null)}>
        <DialogContent className="max-w-sm rounded-[2.5rem] p-7 sm:p-9 border-none shadow-2xl font-figtree text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEF0FA] text-[#4338CA] flex items-center justify-center">
            <LogIn className="w-6 h-6" aria-hidden="true" />
          </div>
          <DialogTitle className="mt-2 font-bricolage font-extrabold text-2xl tracking-[-0.5px] text-[#1E1B4B] text-center">
            Sign in to open this material
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-[1.55] text-[#5B6477] text-center">
            <strong className="text-[#1E293B]">{signInPromptTitle}</strong> is available to OMSU students. Sign in
            with your institutional email to open it in the IEC Library.
          </DialogDescription>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSignInPromptTitle(null)}
              className={`h-12 rounded-2xl bg-[#F1F2F9] text-[#1E1B4B] font-bold text-[15px] ${focusRing}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => navigate(`/login?redirect=${encodeURIComponent(STUDENT_MATERIALS_PATH)}`)}
              className={`h-12 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] transition-colors ${focusRing}`}
            >
              Sign in
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaterialsPage;
