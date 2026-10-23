import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { usePagination } from "../hooks/usePagination";
import { useAuth } from "../hooks/useAuth";
import { IEC_CATEGORIES } from "../lib/iecCategories";
import SitePagination from "../components/shared/SitePagination";
import MaterialPreviewCard from "../components/shared/MaterialPreviewCard";
import SignInPrompt from "../components/shared/SignInPrompt";
import type { MaterialPreview } from "../lib/materialPreview";

const MATERIALS_PAGE_SIZE = 9;

// Where a student opens materials (the IEC Library). Visitors sign in
// first and are sent there afterwards (?redirect, see App.tsx).
const STUDENT_MATERIALS_PATH = "/student/materials";

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

// This is a public, logged-out-reachable page. Opening a material must
// require signing in so every view is recorded, so a visitor only ever gets
// a preview: title, short description, type and a thumbnail. file_url is
// never selected here, and the database no longer returns it to a visitor
// (PHASE 35). An infographic shows its small public preview, never the
// full image (see thumbnailFor).
type Material = MaterialPreview;

const MaterialsPage = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [prompt, setPrompt] = useState<Material | null>(null);

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
  const signedIn = !!user && role === "student";
  const openMaterial = (material: Material) => {
    if (signedIn) {
      navigate(`${STUDENT_MATERIALS_PATH}?material=${material.id}`);
    } else {
      setPrompt(material);
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
                {pagedMaterials.map((material) => (
                  <MaterialPreviewCard key={material.id} material={material} signedIn={signedIn} onOpen={openMaterial} />
                ))}
              </div>

              <SitePagination page={materialsPage} totalPages={materialsTotalPages} onPageChange={setMaterialsPage} />
            </>
          )}
        </section>
      </div>

      {/* ================= SIGN-IN PROMPT =================
          Never renders file content or a file URL: just a way to sign in,
          after which the student lands on this exact material. */}
      <SignInPrompt
        title={prompt?.title ?? null}
        returnPath={prompt ? `${STUDENT_MATERIALS_PATH}?material=${prompt.id}` : STUDENT_MATERIALS_PATH}
        onClose={() => setPrompt(null)}
      />
    </div>
  );
};

export default MaterialsPage;
