import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, Loader2, MapPin } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatProgramDate } from "../lib/formatProgramDate";
import { getEffectiveProgramStatus } from "../lib/programStatus";
import { useAuth } from "../hooks/useAuth";
import { signInUrlFor } from "../lib/returnTo";
import type { MaterialPreview } from "../lib/materialPreview";
import MaterialPreviewCard from "../components/shared/MaterialPreviewCard";
import SignInPrompt, { SIGN_IN_CTA } from "../components/shared/SignInPrompt";

// Public program page (/programs/:id): what a visitor may see of one program
// before signing in. The program's details and its linked IEC materials as
// previews (thumbnail, type, title, short description). Opening a material,
// and the pre- and post-test, need an account. The database only returns
// non-archived items and no file links to a visitor (PHASE 35).

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

interface ProgramRow {
  id: number;
  title: string;
  content?: string | null;
  location?: string | null;
  date?: string | null;
  date_display?: string | null;
  time_range?: string | null;
  duration_label?: string | null;
  status?: string | null;
  image_url?: string | null;
  guidance_service?: string | null;
  program_component?: string | null;
}

export default function PublicProgramPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const programId = Number(id);

  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [materials, setMaterials] = useState<MaterialPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState<MaterialPreview | null>(null);

  const isStudent = !!user && role === "student";
  const portalPath = `/student/programs?program=${programId}`;

  useEffect(() => {
    if (!Number.isInteger(programId) || programId <= 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const [programRes, linksRes] = await Promise.all([
        supabase.from("programs").select("*").eq("id", programId).is("archived_at", null).maybeSingle(),
        supabase
          .from("program_materials")
          .select("sort_order, materials(id, title, type, description, category, image_url, archived_at, program_id)")
          .eq("program_id", programId)
          .order("sort_order", { ascending: true }),
      ]);
      if (cancelled) return;

      if (programRes.error) console.warn("Program unavailable:", programRes.error.message);
      setProgram((programRes.data as ProgramRow | null) ?? null);

      if (linksRes.error) console.warn("Materials unavailable:", linksRes.error.message);
      const rows = (linksRes.data || []) as any[];
      setMaterials(
        rows
          .map((row) => row.materials)
          .filter((m): m is MaterialPreview & { archived_at: string | null; program_id: number | null } => !!m)
          .filter((m) => !m.archived_at && m.program_id === null)
          .map(({ id: materialId, title, type, description, category, image_url }) => ({
            id: materialId,
            title,
            type,
            description,
            category,
            image_url,
          }))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [programId]);

  const openMaterial = (material: MaterialPreview) => {
    if (isStudent) navigate(`/student/materials?material=${material.id}`);
    else setPrompt(material);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" aria-label="Loading program" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="font-figtree max-w-[720px] mx-auto px-5 py-16 text-center flex flex-col items-center gap-4">
        <h1 className="m-0 font-bricolage font-extrabold text-3xl text-[#1E1B4B]">Program not found</h1>
        <p className="m-0 text-[15px] text-[#5B6477]">It may have been removed, or the link is not right.</p>
        <Link
          to="/programs"
          className={`min-h-[44px] px-5 rounded-2xl bg-[#4F46E5] text-white font-bold inline-flex items-center ${focusRing}`}
        >
          See all programs
        </Link>
      </div>
    );
  }

  const status = getEffectiveProgramStatus(program as any);
  const when = formatProgramDate(program as any, (date) =>
    new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  );

  return (
    <div className="w-full font-figtree text-[#1E293B] pb-16 lg:pb-24">
      <div className="max-w-[1440px] mx-auto px-3 lg:px-6 flex flex-col gap-6 lg:gap-8">
        <Link
          to="/programs"
          className={`self-start min-h-[44px] inline-flex items-center gap-2 px-2 rounded-xl font-bold text-[15px] text-[#4338CA] hover:underline ${focusRing}`}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All programs
        </Link>

        {/* ================= HEADER ================= */}
        <section className="rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="px-[22px] py-9 sm:px-10 lg:px-[72px] lg:py-16 flex flex-col gap-4">
            <span className="self-start px-3 py-1.5 rounded-full bg-[#FBBF24] text-[#1E1B4B] font-extrabold text-xs">
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <h1 className="m-0 font-bricolage font-extrabold text-[34px] sm:text-5xl lg:text-[52px] leading-[1.05] tracking-[-0.02em] break-words">
              {program.title}
            </h1>
            {(program.guidance_service || program.program_component) && (
              <p className="m-0 text-base text-[#C7C9F2]">
                {[program.guidance_service, program.program_component].filter(Boolean).join(" · ")}
              </p>
            )}
            <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[15px] text-[#E0E1F8]">
              <li className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" /> {when}
              </li>
              {program.time_range && (
                <li className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 shrink-0" aria-hidden="true" /> {program.time_range}
                </li>
              )}
              {program.location && (
                <li className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" /> {program.location.trim()}
                </li>
              )}
            </ul>
          </div>
          {program.image_url && (
            <img
              src={program.image_url}
              alt={`Poster of ${program.title}`}
              className="w-full h-[240px] lg:h-full object-cover"
              decoding="async"
            />
          )}
        </section>

        {program.content && (
          <section aria-labelledby="about-heading" className="rounded-[32px] bg-white p-6 sm:p-8 flex flex-col gap-3">
            <h2 id="about-heading" className="m-0 font-bricolage font-extrabold text-2xl text-[#1E1B4B]">
              About this program
            </h2>
            <p className="m-0 text-[15px] leading-[1.65] text-[#334155] whitespace-pre-wrap">{program.content}</p>
          </section>
        )}

        {/* ================= MATERIALS ================= */}
        <section aria-labelledby="materials-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="materials-heading" className="m-0 font-bricolage font-extrabold text-2xl lg:text-[30px] text-[#1E1B4B]">
              IEC materials for this program
            </h2>
            <p className="m-0 text-[15px] text-[#5B6477]">
              {materials.length === 0
                ? "Materials for this program are coming soon."
                : `${materials.length} ${materials.length === 1 ? "material" : "materials"}. ${
                    isStudent ? "Open one to view it." : "Previews only: open one after you sign in."
                  }`}
            </p>
          </div>

          {materials.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
              {materials.map((material) => (
                <MaterialPreviewCard key={material.id} material={material} signedIn={isStudent} onOpen={openMaterial} />
              ))}
            </div>
          )}
        </section>

        {/* ================= CALL TO ACTION ================= */}
        <section className="rounded-[32px] lg:rounded-[40px] bg-[#EEF0FA] border-[1.5px] border-[#DDE1EE] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex flex-col gap-1.5 max-w-[640px]">
            <h2 className="m-0 font-bricolage font-extrabold text-2xl text-[#1E1B4B]">
              {isStudent ? "Continue in your student portal" : SIGN_IN_CTA}
            </h2>
            <p className="m-0 text-[15px] text-[#5B6477]">
              {isStudent
                ? "Open the materials, then take the pre-test and post-test for this program."
                : "Your account keeps track of the materials you open and unlocks the post-test."}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            {isStudent ? (
              <button
                type="button"
                onClick={() => navigate(portalPath)}
                className={`min-h-[52px] px-6 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] ${focusRing}`}
              >
                Open in my portal
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate(signInUrlFor(portalPath))}
                  className={`min-h-[52px] px-6 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] ${focusRing}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => navigate(signInUrlFor(portalPath, "register"))}
                  className={`min-h-[52px] px-6 rounded-2xl border-[1.5px] border-[#C9CEE4] bg-white text-[#1E1B4B] font-bold text-[15px] hover:border-[#A5B4FC] ${focusRing}`}
                >
                  Create account
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      <SignInPrompt
        title={prompt?.title ?? null}
        returnPath={prompt ? `/student/materials?material=${prompt.id}` : portalPath}
        onClose={() => setPrompt(null)}
      />
    </div>
  );
}
