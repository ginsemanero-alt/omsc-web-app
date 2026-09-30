import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Calendar, ChevronDown, Loader2, MapPin, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatProgramDate } from "../lib/formatProgramDate";
import { getEffectiveProgramStatus, compareProgramsForDisplay } from "../lib/programStatus";
import { usePagination } from "../hooks/usePagination";
import { useAuth } from "../hooks/useAuth";
import SitePagination from "../components/shared/SitePagination";

const PROGRAMS_PAGE_SIZE = 9;

const GUIDANCE_SERVICES = [
  "Information Services",
  "Individual Inventory",
  "Research and Evaluation",
  "Career Orientation",
  "Testing Services",
  "Counseling Services",
];

const PROGRAM_COMPONENTS = [
  "Group Guidance",
  "Individual Student Planning",
  "Responsive Services",
  "System Support",
];

// The student area has no per-program page, so "View program" opens the
// student Programs page (after signing in, for visitors).
const STUDENT_PROGRAMS_PATH = "/student/programs";

// Visible keyboard focus everywhere (3px #A5B4FC ring, as on Home/Login).
const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

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
  image_url?: string;
  time_range?: string;
  date_display?: string;
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const ProgramsPage = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [guidanceServiceFilter, setGuidanceServiceFilter] = useState("all");
  const [programComponentFilter, setProgramComponentFilter] = useState("all");
  // Programs that have an active knowledge assessment (pre-test open).
  const [preTestProgramIds, setPreTestProgramIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        setIsLoading(true);

        const { data: sbPrograms, error } = await supabase
          .from("programs")
          .select("*")
          .is("archived_at", null)
          .order("id", { ascending: false });

        if (!error && sbPrograms) {
          const mappedPrograms = sbPrograms.map((p: any) => ({
            id: p.id,
            title: (p.title || "Untitled program").trim(),
            // Admin's form actually saves the long-form text to `content`,
            // not `description`.
            description: p.content || p.description || "",
            location: p.location || "",
            date: p.date || p.scheduled_date || new Date().toISOString(),
            participants: p.participants || p.max_slots || 0,
            status: p.status || "upcoming",
            guidance_service: p.guidance_service || "",
            program_component: p.program_component || "",
            image_url: p.image_url || "",
            time_range: p.time_range || "",
            date_display: p.date_display || "",
          }));

          setPrograms(mappedPrograms);
        } else if (error) {
          console.error("Error fetching programs from Supabase:", error.message);
        }
      } catch (err) {
        console.error("Error fetching programs:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrograms();
  }, []);

  const filteredPrograms = programs
    .filter((p) => {
      const matchesSearch =
        p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.location?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGuidanceService =
        guidanceServiceFilter === "all" || p.guidance_service === guidanceServiceFilter;
      const matchesProgramComponent =
        programComponentFilter === "all" || p.program_component === programComponentFilter;
      return matchesSearch && matchesGuidanceService && matchesProgramComponent;
    })
    .sort(compareProgramsForDisplay);

  const {
    page: programsPage,
    setPage: setProgramsPage,
    totalPages: programsTotalPages,
    pageItems: pagedPrograms,
  } = usePagination(filteredPrograms, PROGRAMS_PAGE_SIZE);

  useEffect(() => {
    setProgramsPage(1);
  }, [searchTerm, guidanceServiceFilter, programComponentFilter]);

  // Pre-test badge: ONE query for every program on the current page —
  // which of them have an active knowledge assessment.
  const visibleIdsKey = pagedPrograms.map((p) => p.id).join(",");
  useEffect(() => {
    const ids = visibleIdsKey ? visibleIdsKey.split(",").map(Number) : [];
    if (ids.length === 0) return;

    let cancelled = false;
    supabase
      .from("surveys")
      .select("program_id")
      .eq("type", "knowledge")
      .eq("status", "active")
      .is("archived_at", null)
      .in("program_id", ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("Pre-test status unavailable:", error.message);
          return;
        }
        setPreTestProgramIds((previous) => {
          const next = new Set(previous);
          ids.forEach((id) => next.delete(id));
          (data || []).forEach((row: any) => row.program_id != null && next.add(Number(row.program_id)));
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [visibleIdsKey]);

  // Signed-in students go straight to their Programs page; everyone else
  // signs in first and is sent there afterwards (?redirect, see App.tsx).
  const openProgram = () => {
    if (user && role === "student") {
      navigate(STUDENT_PROGRAMS_PATH);
    } else {
      navigate(`/login?redirect=${encodeURIComponent(STUDENT_PROGRAMS_PATH)}`);
    }
  };

  const chipClass = (selected: boolean) =>
    `h-11 px-4 rounded-full border-[1.5px] text-sm transition-colors ${focusRing} ${
      selected
        ? "border-[#4F46E5] bg-[#4F46E5] text-white font-bold"
        : "border-[#DDE1EE] bg-white text-[#1E293B] font-semibold hover:border-[#A5B4FC]"
    }`;

  return (
    <div className="w-full min-h-screen bg-[#EEF0FA] font-figtree text-[#1E293B] pb-16 lg:pb-24">
      <div className="max-w-[1440px] mx-auto">
        {/* ================= HEADER ================= */}
        <section className="px-3 pt-3 lg:px-6 lg:pt-2">
          <div className="rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white px-[22px] py-9 sm:px-10 lg:px-[72px] lg:py-16">
            <div className="flex flex-col gap-3.5 lg:gap-[18px] max-w-[760px]">
              <h1 className="m-0 font-bricolage font-extrabold text-[40px] sm:text-5xl lg:text-[64px] leading-[1.02] tracking-[-0.02em]">
                Guidance programs
              </h1>
              <p className="m-0 text-base lg:text-lg leading-[1.55] text-[#C7C9F2]">
                Every program the Guidance and Testing Center has held. Open one to see what each session covered, its
                materials, and its pre- and post-test.
              </p>
            </div>
          </div>
        </section>

        {/* ================= FILTERS ================= */}
        <section className="px-3 pt-6 lg:px-[72px] lg:pt-10">
          <div className="rounded-[2rem] bg-white p-4 sm:p-6 flex flex-col gap-[18px]">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-grow">
                <Search
                  className="absolute left-[18px] top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none"
                  aria-hidden="true"
                />
                <label htmlFor="program-search" className="sr-only">
                  Search programs
                </label>
                <input
                  id="program-search"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search programs by title"
                  className="w-full h-[52px] pl-12 pr-4 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-[#F5F6FB] text-base md:text-[15px] text-[#1E293B] placeholder:text-[#8A91A6] outline-none focus:outline-[3px] focus:outline-offset-2 focus:outline-[#A5B4FC]"
                />
              </div>

              <div className="relative md:w-[280px] shrink-0">
                <label htmlFor="program-component" className="sr-only">
                  Program component
                </label>
                <select
                  id="program-component"
                  value={programComponentFilter}
                  onChange={(e) => setProgramComponentFilter(e.target.value)}
                  className="w-full h-[52px] appearance-none pl-[18px] pr-11 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[15px] font-semibold text-[#1E293B] outline-none cursor-pointer focus:outline-[3px] focus:outline-offset-2 focus:outline-[#A5B4FC]"
                >
                  <option value="all">All program components</option>
                  {PROGRAM_COMPONENTS.map((component) => (
                    <option key={component} value={component}>
                      {component}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-4 top-[17px] w-[18px] h-[18px] text-[#1E293B] pointer-events-none"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div role="group" aria-label="Filter by guidance service" className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={guidanceServiceFilter === "all"}
                onClick={() => setGuidanceServiceFilter("all")}
                className={chipClass(guidanceServiceFilter === "all")}
              >
                All services
              </button>
              {GUIDANCE_SERVICES.map((service) => (
                <button
                  key={service}
                  type="button"
                  aria-pressed={guidanceServiceFilter === service}
                  onClick={() => setGuidanceServiceFilter(service)}
                  className={chipClass(guidanceServiceFilter === service)}
                >
                  {service}
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
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading programs...
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5" aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="rounded-[28px] lg:rounded-[32px] bg-white overflow-hidden">
                    <div className="h-[220px] bg-[#2B2F55] animate-pulse" />
                    <div className="p-6 flex flex-col gap-3">
                      <div className="h-3 w-1/3 rounded-full bg-slate-200 animate-pulse" />
                      <div className="h-5 w-4/5 rounded-full bg-slate-200 animate-pulse" />
                      <div className="h-3 w-1/2 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredPrograms.length === 0 ? (
            <div className="rounded-[2rem] bg-white px-6 py-14 lg:py-20 text-center flex flex-col items-center gap-3">
              <Search className="w-8 h-8 text-[#A5ADC6]" aria-hidden="true" />
              <p className="m-0 font-bricolage font-extrabold text-2xl text-[#1E1B4B]">No programs found</p>
              <p className="m-0 text-[15px] text-[#5B6477] max-w-md">
                {programs.length === 0
                  ? "No programs have been posted yet. Check back soon."
                  : "No programs match your search or filters. Try another word or clear the filters."}
              </p>
              {programs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setGuidanceServiceFilter("all");
                    setProgramComponentFilter("all");
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
                  {filteredPrograms.length} {filteredPrograms.length === 1 ? "program" : "programs"}
                </strong>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
                {pagedPrograms.map((program) => {
                  const effectiveStatus = getEffectiveProgramStatus(program);
                  const completed = effectiveStatus === "completed";
                  const preTestOpen = preTestProgramIds.has(program.id);

                  return (
                    <button
                      key={program.id}
                      type="button"
                      onClick={openProgram}
                      aria-label={`View program: ${program.title}`}
                      className={`group text-left rounded-[28px] lg:rounded-[32px] bg-white overflow-hidden flex flex-col hover:shadow-[0_20px_40px_-20px_rgba(30,27,75,0.35)] hover:-translate-y-1 transition-all ${focusRing}`}
                    >
                      <div className="relative h-[220px] w-full bg-[#2B2F55]">
                        {program.image_url && (
                          <img
                            src={program.image_url}
                            alt={`Poster of ${program.title}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <span
                          className={`absolute top-3.5 left-3.5 px-3 py-1.5 rounded-full font-extrabold text-xs ${
                            completed ? "bg-[#E2E8F0] text-[#1E293B]" : "bg-[#FBBF24] text-[#1E1B4B]"
                          }`}
                        >
                          {statusLabel(effectiveStatus)}
                        </span>
                      </div>

                      <div className="px-5 pt-5 pb-5 lg:px-6 lg:pt-[22px] lg:pb-6 flex flex-col gap-2 flex-grow">
                        {program.guidance_service && (
                          <span className="text-[13px] font-bold text-[#4338CA]">{program.guidance_service}</span>
                        )}
                        <h2 className="m-0 font-bold text-lg lg:text-[19px] leading-[1.3] text-[#1E1B4B] line-clamp-2 group-hover:text-[#4338CA] transition-colors">
                          {program.title}
                        </h2>
                        <span className="flex items-center gap-2 text-sm text-[#5B6477]">
                          <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
                          {formatProgramDate(program, (date) =>
                            new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                          )}
                        </span>
                        {program.location && (
                          <span className="flex items-center gap-2 text-sm text-[#5B6477]">
                            <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span className="line-clamp-1">{program.location}</span>
                          </span>
                        )}

                        <div className="mt-auto pt-3.5 flex flex-wrap justify-between items-center gap-2">
                          <span
                            className={`px-2.5 py-[5px] rounded-full font-bold text-xs ${
                              preTestOpen ? "bg-[#E0E7FF] text-[#3730A3]" : "bg-[#F1F5F9] text-[#475569]"
                            }`}
                          >
                            {preTestOpen ? "Pre-test open" : "Pre-test coming soon"}
                          </span>
                          <span className="inline-flex items-center gap-1 font-bold text-sm text-[#4338CA]">
                            View program <ArrowRight className="w-4 h-4" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <SitePagination page={programsPage} totalPages={programsTotalPages} onPageChange={setProgramsPage} />
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ProgramsPage;
