import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatProgramDate } from "../lib/formatProgramDate";
import { getEffectiveProgramStatus } from "../lib/programStatus";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Home,
  Info,
  MapPin,
  Menu,
  X,
} from "lucide-react";

type NavTarget = "Home" | "Programs" | "Materials" | "About" | "Login";

interface HomePageProps {
  onNavigate: (page: NavTarget) => void;
}

interface Program {
  id: number;
  title: string;
  category: string;
  location: string;
  date: string;
  status: string;
  time_range?: string | null;
  image_url?: string;
  date_display?: string;
}

const SYSTEM_TITLE =
  "Web-Based Guidance Program Dissemination and Awareness Assessment System for the Higher Education Students of Occidental Mindoro State University";

const NAV_LINKS: { label: string; page: NavTarget; icon: React.ElementType }[] = [
  { label: "Home", page: "Home", icon: Home },
  { label: "Programs", page: "Programs", icon: Calendar },
  { label: "IEC Materials", page: "Materials", icon: BookOpen },
  { label: "About", page: "About", icon: Info },
];

const STEPS = [
  { title: "Choose a program", text: "Pick any program the Center has held, including ones you missed." },
  { title: "Take the pre-test", text: "Ten quick questions on what you already know. No score is shown yet." },
  { title: "Read the materials", text: "Infographics, videos, and guides from the Guidance and Testing Center." },
  { title: "Take the post-test", text: "Answer the same questions again and see how much you improved." },
];

const SERVICES = [
  { name: "Information Services", text: "Orientation and awareness on programs, policies, and student welfare.", dot: "bg-[#4F46E5]" },
  { name: "Individual Inventory", text: "Student profiles and records kept by the Center.", dot: "bg-[#7C3AED]" },
  { name: "Research and Evaluation", text: "Studies on student needs and how well programs work.", dot: "bg-[#0EA5E9]" },
  { name: "Career Orientation", text: "Career planning, seminars, and readiness for work.", dot: "bg-[#FBBF24]" },
  { name: "Testing Services", text: "Psychological and aptitude tests given by the Center.", dot: "bg-[#34D399]" },
  { name: "Counseling Services", text: "One-on-one support with a guidance counselor.", dot: "bg-[#F472B6]" },
];

// Visible keyboard focus everywhere (mockup: 3px #A5B4FC ring).
const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

const linkClass = `font-bold text-[#4338CA] hover:text-[#312E81] hover:underline rounded ${focusRing}`;

const goToLogin = () => (window.location.href = "/login");
const goToRegister = () => (window.location.href = "/login?mode=register");

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const HomePage = ({ onNavigate }: HomePageProps) => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePage, setActivePage] = useState("home");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleNavigation = (page: NavTarget) => {
    setActivePage(page.toLowerCase());
    onNavigate(page);
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        const { data, error } = await supabase
          .from("programs")
          .select("*")
          .is("archived_at", null)
          .order("id", { ascending: false })
          .limit(4);
        if (error) throw error;
        if (data) setPrograms(data);
      } catch (err) {
        console.error("Error fetching programs:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPrograms();
  }, []);

  // Hero collage: the 3 most recent programs (newest first, from the
  // same fetch as Recent programs).
  const heroPrograms = programs.slice(0, 3);

  // One poster in the hero, linking to the Programs page (there is no
  // per-program page). No image: a #2B2F55 block with the title.
  const heroPoster = (program: Program, className: string) => (
    <a
      key={program.id}
      href="/programs"
      onClick={(event) => {
        event.preventDefault();
        handleNavigation("Programs");
      }}
      className={`block overflow-hidden bg-[#2B2F55] ${focusRing} ${className}`}
    >
      {program.image_url ? (
        <img
          src={program.image_url}
          alt={`Poster of ${program.title.trim()}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="w-full h-full flex items-end p-5 font-bold text-base leading-[1.3] text-white">
          {program.title.trim()}
        </span>
      )}
    </a>
  );

  const logo = (size: string) => (
    <img
      src="/guidance-logo.jpg"
      alt=""
      className={`${size} rounded-full object-cover bg-white shrink-0`}
    />
  );

  return (
    <div id="top" className="w-full min-h-screen bg-[#EEF0FA] font-figtree text-[#1E293B]">
      {/* ================= NAVBAR ================= */}
      <header className="sticky top-0 z-50 bg-[#EEF0FA]/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto h-[72px] lg:h-[88px] pl-5 pr-4 lg:px-12 flex items-center gap-2.5 lg:gap-8">
          <button
            type="button"
            onClick={() => handleNavigation("Home")}
            className={`min-h-[44px] flex items-center gap-2.5 lg:gap-3 text-left text-[#1E1B4B] rounded-2xl min-w-0 ${focusRing}`}
            aria-label="OMSU Guidance home"
          >
            {logo("w-10 h-10 lg:w-11 lg:h-11")}
            <span className="flex flex-col gap-px min-w-0">
              <span className="font-bricolage font-extrabold text-[17px] lg:text-lg tracking-[-0.3px] leading-tight">
                OMSU Guidance
              </span>
              <span className="text-xs lg:text-[13px] font-medium text-[#5B6477] truncate">
                Guidance and Testing Center
              </span>
            </span>
          </button>

          <nav aria-label="Main" className="hidden lg:flex gap-1.5 ml-6">
            {NAV_LINKS.map(({ label, page }) => {
              const active = activePage === page.toLowerCase();
              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => handleNavigation(page)}
                  aria-current={active ? "page" : undefined}
                  className={`h-11 px-4 rounded-full text-[15px] transition-colors ${focusRing} ${
                    active
                      ? "bg-white text-[#1E1B4B] font-bold"
                      : "text-[#334155] font-semibold hover:bg-white/60"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={goToLogin}
              className={`hidden sm:flex h-[46px] px-5 rounded-2xl items-center text-[15px] font-bold text-[#1E1B4B] hover:bg-white/60 transition-colors ${focusRing}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={goToRegister}
              className={`hidden sm:flex h-[46px] px-[22px] rounded-2xl items-center text-[15px] font-bold bg-[#4F46E5] hover:bg-[#4338CA] text-white transition-colors ${focusRing}`}
            >
              Create account
            </button>
            <button
              type="button"
              className={`lg:hidden w-[46px] h-[46px] rounded-2xl bg-white flex items-center justify-center text-[#1E1B4B] ${focusRing}`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
              aria-controls="home-mobile-menu"
            >
              {isMenuOpen ? <X className="w-[22px] h-[22px]" /> : <Menu className="w-[22px] h-[22px]" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div
            id="home-mobile-menu"
            className="lg:hidden absolute top-[72px] left-3 right-3 bg-white rounded-[28px] p-3 shadow-[0_24px_60px_-24px_rgba(30,27,75,0.45)] flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {NAV_LINKS.map(({ label, page, icon: Icon }) => {
              const active = activePage === page.toLowerCase();
              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => handleNavigation(page)}
                  aria-current={active ? "page" : undefined}
                  className={`h-12 px-4 rounded-2xl flex items-center gap-3 text-left text-base transition-colors ${focusRing} ${
                    active ? "bg-[#EEF0FA] text-[#1E1B4B] font-bold" : "text-[#334155] font-semibold hover:bg-[#F5F6FB]"
                  }`}
                >
                  <Icon className="w-5 h-5 text-[#4338CA] shrink-0" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={goToLogin}
                className={`h-12 rounded-2xl border-[1.5px] border-[#DDE1EE] text-[#1E1B4B] font-bold text-[15px] ${focusRing}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={goToRegister}
                className={`h-12 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] ${focusRing}`}
              >
                Create account
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-[1440px] mx-auto">
        {/* ================= HERO ================= */}
        <section className="px-3 pt-1 lg:px-6 lg:pt-2">
          <div className="relative overflow-hidden rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white">
            <div className="relative flex flex-col lg:flex-row lg:items-center gap-12 px-[22px] pt-9 pb-7 sm:px-10 lg:pl-[72px] lg:pr-16 lg:py-[60px] lg:min-h-[700px]">
              <div className="flex flex-col gap-[18px] lg:gap-[26px] lg:w-[48%] xl:w-[660px] lg:shrink-0">
                <span className="self-start px-3 py-1.5 lg:px-[15px] lg:py-2 rounded-full bg-[#FBBF24] text-[#1E1B4B] font-extrabold text-xs lg:text-sm">
                  For OMSU higher education students
                </span>
                <h1 className="m-0 font-bricolage font-extrabold text-[40px] sm:text-[56px] lg:text-[60px] xl:text-[72px] leading-[1.02] tracking-[-0.02em]">
                  Every guidance program, open to every student.
                </h1>
                <p className="m-0 text-base lg:text-[19px] leading-[1.55] text-[#D4D6F5] max-w-[560px]">
                  See what the Guidance and Testing Center's programs covered, read their materials, and check how
                  much you have learned with a short pre- and post-test.
                </p>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5 lg:gap-3 mt-1 lg:mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleNavigation("Programs")}
                    className={`h-[54px] lg:h-[58px] px-7 rounded-[18px] whitespace-nowrap bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1E1B4B] font-extrabold text-base transition-colors ${focusRing}`}
                  >
                    Browse programs
                  </button>
                  <button
                    type="button"
                    onClick={goToRegister}
                    className={`h-[54px] lg:h-[58px] px-[26px] rounded-[18px] whitespace-nowrap border-2 border-white/60 hover:bg-white/10 text-white font-bold text-base transition-colors ${focusRing}`}
                  >
                    Create student account
                  </button>
                </div>

                {/* Below lg: only the newest poster, under the buttons. */}
                {isLoading ? (
                  <div className="lg:hidden h-[220px] rounded-[1.75rem] bg-[#2B2F55] animate-pulse" />
                ) : (
                  heroPrograms[0] && heroPoster(heroPrograms[0], "lg:hidden h-[220px] rounded-[1.75rem]")
                )}

                <p className="m-0 mt-1 lg:mt-2 text-xs lg:text-[13px] leading-[1.5] text-[#B9BCEB] max-w-[560px]">
                  {SYSTEM_TITLE}
                </p>
              </div>

              {/* Desktop: poster collage of the 3 newest programs — the
                  newest across the top, the next two side by side. */}
              {isLoading ? (
                <div className="hidden lg:grid flex-grow min-w-0 grid-cols-2 grid-rows-[300px_262px] gap-4" aria-hidden="true">
                  <div className="col-span-2 rounded-[2.25rem] bg-[#2B2F55] animate-pulse" />
                  <div className="rounded-[1.75rem] bg-[#2B2F55] animate-pulse" />
                  <div className="rounded-[1.75rem] bg-[#2B2F55] animate-pulse" />
                </div>
              ) : heroPrograms.length > 0 && (
                <div
                  className={`hidden lg:grid flex-grow min-w-0 grid-cols-2 gap-4 ${
                    heroPrograms.length === 1 ? "grid-rows-[300px]" : "grid-rows-[300px_262px]"
                  }`}
                >
                  {heroPoster(heroPrograms[0], "col-span-2 rounded-[2.25rem]")}
                  {heroPrograms
                    .slice(1)
                    .map((program) =>
                      heroPoster(program, `rounded-[1.75rem] ${heroPrograms.length === 2 ? "col-span-2" : ""}`)
                    )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section className="px-5 pt-16 lg:px-[72px] lg:pt-[104px] flex flex-col gap-5 lg:gap-10">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-3 lg:gap-10">
            <h2 className="m-0 font-bricolage font-extrabold text-[34px] lg:text-5xl tracking-[-1px] lg:tracking-[-1.4px] text-[#1E1B4B]">
              How it works
            </h2>
            <p className="m-0 text-base lg:text-[17px] leading-[1.5] text-[#5B6477] max-w-[460px]">
              Every program follows the same four steps, so you always know what comes next.
            </p>
          </div>
          <ol className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            {STEPS.map((step, index) => {
              const last = index === STEPS.length - 1;
              return (
                <li
                  key={step.title}
                  className="flex lg:flex-col items-start gap-4 lg:gap-3.5 p-5 lg:px-7 lg:py-[30px] rounded-[26px] lg:rounded-[32px] bg-white lg:min-h-[250px]"
                >
                  <span
                    className={`w-11 h-11 lg:w-12 lg:h-12 shrink-0 rounded-[14px] lg:rounded-2xl flex items-center justify-center font-bricolage font-extrabold text-xl lg:text-[22px] ${
                      last ? "bg-[#FBBF24] text-[#1E1B4B]" : "bg-[#EEF0FA] text-[#4338CA]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1 lg:gap-3.5 lg:mt-2">
                    <h3 className="m-0 font-bold text-[17px] lg:text-xl text-[#1E1B4B]">{step.title}</h3>
                    <p className="m-0 text-sm lg:text-[15px] leading-[1.55] text-[#5B6477]">{step.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ================= RECENT PROGRAMS ================= */}
        <section className="px-5 pt-16 lg:px-[72px] lg:pt-[104px] flex flex-col gap-5 lg:gap-9">
          <div className="flex justify-between items-baseline lg:items-end gap-4">
            <h2 className="m-0 font-bricolage font-extrabold text-[29px] min-[400px]:text-[34px] lg:text-5xl tracking-[-1px] lg:tracking-[-1.4px] text-[#1E1B4B]">
              Recent programs
            </h2>
            <button
              type="button"
              onClick={() => handleNavigation("Programs")}
              className={`shrink-0 min-h-[44px] inline-flex items-center gap-1.5 text-[15px] lg:text-base ${linkClass}`}
            >
              See all<span className="hidden sm:inline">&nbsp;programs</span> <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 lg:gap-5">
            {isLoading ? (
              [1, 2, 3, 4].map((n) => (
                <div key={n} className="rounded-[28px] lg:rounded-[32px] bg-white overflow-hidden">
                  <div className="h-[170px] lg:h-[200px] bg-slate-200 animate-pulse" />
                  <div className="p-5 lg:p-[22px] flex flex-col gap-3">
                    <div className="h-4 w-4/5 rounded-full bg-slate-200 animate-pulse" />
                    <div className="h-3 w-1/2 rounded-full bg-slate-100 animate-pulse" />
                  </div>
                </div>
              ))
            ) : programs.length === 0 ? (
              <p className="sm:col-span-2 lg:col-span-4 m-0 p-6 rounded-[28px] bg-white text-[15px] text-[#5B6477]">
                No programs have been posted yet. Check back soon.
              </p>
            ) : (
              programs.map((program) => {
                const effectiveStatus = getEffectiveProgramStatus(program);
                const completed = effectiveStatus === "completed";
                return (
                  <button
                    key={program.id}
                    type="button"
                    onClick={() => handleNavigation("Programs")}
                    className={`group text-left rounded-[28px] lg:rounded-[32px] bg-white overflow-hidden flex flex-col hover:shadow-[0_20px_40px_-20px_rgba(30,27,75,0.35)] hover:-translate-y-1 transition-all ${focusRing}`}
                  >
                    <div className="relative h-[170px] lg:h-[200px] w-full bg-[#1E1B4B]">
                      {program.image_url && (
                        <img
                          src={program.image_url}
                          alt={`${program.title} poster`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      <span
                        className={`absolute top-3 left-3 lg:top-3.5 lg:left-3.5 px-3 py-1.5 rounded-full font-extrabold text-xs ${
                          completed ? "bg-[#E2E8F0] text-[#1E293B]" : "bg-[#FBBF24] text-[#1E1B4B]"
                        }`}
                      >
                        {statusLabel(effectiveStatus)}
                      </span>
                    </div>
                    <div className="px-5 pt-[18px] pb-5 lg:px-[22px] lg:pt-[22px] lg:pb-6 flex flex-col gap-1.5 lg:gap-2.5 flex-grow">
                      <h3 className="m-0 font-bold text-[17px] lg:text-lg leading-[1.3] text-[#1E1B4B] line-clamp-2 group-hover:text-[#4338CA] transition-colors">
                        {program.title}
                      </h3>
                      <span className="lg:mt-auto flex items-center gap-2 text-sm text-[#5B6477]">
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
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* ================= SIX SERVICES ================= */}
        <section className="px-5 pt-16 lg:px-[72px] lg:pt-[104px] grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-4 lg:gap-14">
          <div className="flex flex-col gap-4">
            <h2 className="m-0 font-bricolage font-extrabold text-[30px] lg:text-[44px] leading-[1.08] lg:leading-[1.05] tracking-[-0.9px] lg:tracking-[-1.2px] text-[#1E1B4B]">
              Organized by the Center's six services
            </h2>
            <p className="m-0 hidden sm:block text-base lg:text-[17px] leading-[1.55] text-[#5B6477]">
              Each program belongs to one of the services of the Guidance and Testing Center, so you can find programs
              by what they help with.
            </p>
            <div className="hidden lg:flex gap-3 items-start mt-2.5 px-5 py-[18px] rounded-[22px] bg-white">
              <Info className="w-[22px] h-[22px] text-[#4338CA] shrink-0 mt-px" aria-hidden="true" />
              <p className="m-0 text-sm leading-[1.55] text-[#334155]">
                Counseling sessions still happen at the Guidance Office. This site shares information about programs;
                it does not replace a session.
              </p>
            </div>
          </div>

          <ul className="m-0 p-0 list-none grid grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-4">
            {SERVICES.map((service) => (
              <li
                key={service.name}
                className="flex flex-col gap-2 lg:gap-2.5 p-4 lg:px-6 lg:py-[26px] rounded-[22px] lg:rounded-[28px] bg-white"
              >
                <span className={`w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full ${service.dot}`} aria-hidden="true" />
                <h3 className="m-0 lg:mt-1 font-bold text-[15px] lg:text-lg leading-[1.3] text-[#1E1B4B]">{service.name}</h3>
                <p className="m-0 hidden sm:block text-[13px] lg:text-sm leading-[1.55] text-[#5B6477]">{service.text}</p>
              </li>
            ))}
          </ul>

          <div className="lg:hidden flex gap-3 items-start p-4 rounded-[20px] bg-white">
            <Info className="w-5 h-5 text-[#4338CA] shrink-0 mt-px" aria-hidden="true" />
            <p className="m-0 text-[13px] leading-[1.55] text-[#334155]">
              Counseling sessions still happen at the Guidance Office. This site shares information about programs; it
              does not replace a session.
            </p>
          </div>
        </section>

        {/* ================= CLOSING PANEL ================= */}
        <section className="px-3 pt-16 lg:px-6 lg:pt-[104px]">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3.5 lg:gap-12 px-[22px] py-8 sm:px-10 lg:p-[72px] rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white">
            <div className="flex flex-col gap-3.5 max-w-[700px]">
              <h2 className="m-0 font-bricolage font-extrabold text-[32px] leading-[1.04] tracking-[-1px] lg:text-[52px] lg:leading-[1.02] lg:tracking-[-1.6px]">
                Missed a program? You can still see what it covered.
              </h2>
              <p className="m-0 text-[15px] lg:text-lg leading-[1.5] text-[#C7C9F2]">
                Create a student account with your institutional email.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 lg:gap-3 shrink-0 mt-1.5 lg:mt-0 lg:min-w-[260px]">
              <button
                type="button"
                onClick={goToRegister}
                className={`h-[54px] lg:h-[58px] px-[30px] rounded-[18px] bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1E1B4B] font-extrabold text-base transition-colors ${focusRing}`}
              >
                Create student account
              </button>
              <button
                type="button"
                onClick={goToLogin}
                className={`h-[54px] lg:h-[58px] px-[30px] rounded-[18px] border-2 border-white/50 hover:bg-white/10 text-white font-bold text-base transition-colors ${focusRing}`}
              >
                Sign in
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="max-w-[1440px] mx-auto px-5 pt-11 pb-8 lg:px-[72px] lg:pt-14 lg:pb-10 flex flex-col gap-6 lg:gap-8">
        <div className="flex flex-col lg:flex-row lg:justify-between gap-7 lg:gap-12">
          <div className="flex gap-3 lg:gap-3.5 max-w-[560px]">
            {logo("w-10 h-10 lg:w-12 lg:h-12")}
            <div className="flex flex-col gap-1.5">
              <span className="font-bold text-[15px] lg:text-base text-[#1E1B4B]">Guidance and Testing Center</span>
              <span className="text-sm leading-[1.5] text-[#5B6477]">
                Occidental Mindoro State University, San Jose, Labangan, and Murtha campuses
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-16 gap-y-6">
            <nav aria-label="Explore" className="flex flex-col gap-1">
              <span className="font-bold text-sm text-[#1E1B4B] mb-1">Explore</span>
              {NAV_LINKS.filter((link) => link.page !== "Home").map(({ label, page }) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => handleNavigation(page)}
                  className={`min-h-[44px] text-left font-medium text-sm text-[#334155] hover:text-[#4338CA] hover:underline rounded ${focusRing}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="flex flex-col gap-1">
              <span className="font-bold text-sm text-[#1E1B4B] mb-1">Contact</span>
              <a
                href="mailto:guidance@omsc.edu.ph"
                className={`min-h-[44px] self-start inline-flex items-center font-medium text-sm text-[#334155] hover:text-[#4338CA] hover:underline rounded ${focusRing}`}
              >
                guidance@omsc.edu.ph
              </a>
              <span className="min-h-[44px] flex items-center text-sm text-[#334155]">Facebook: OMSU Guidance and Testing Center</span>
            </div>
          </div>
        </div>

        <div className="pt-4 lg:pt-[22px] border-t border-[#D5D9EA] flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-8 text-xs lg:text-[13px] leading-[1.5] text-[#5B6477]">
          <span>{SYSTEM_TITLE}</span>
          <span className="shrink-0">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
