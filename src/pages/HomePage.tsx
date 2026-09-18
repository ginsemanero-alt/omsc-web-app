import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatProgramDate } from "../lib/formatProgramDate";
import { getEffectiveProgramStatus } from "../lib/programStatus";
import { Button } from "../../src/components/ui/button";
import { Card } from "../../src/components/ui/card";
import {
  BookOpen,
  ClipboardList,
  Users,
  GraduationCap,
  Calendar,
  MapPin,
  ImageIcon,
  ArrowRight,
  Menu, // Idinagdag para sa mobile menu
  X,    // Idinagdag para sa close button
  Home,
  Info,
} from "lucide-react";

const MOBILE_NAV_ICONS: Record<string, React.ElementType> = {
  Home,
  Programs: Calendar,
  Materials: BookOpen,
  About: Info,
};

interface HomePageProps {
  onNavigate: (page: "Home" | "Programs" | "Materials" | "About" | "Login") => void;
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

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePage, setActivePage] = useState("home");
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Mobile menu state
  const [showHeroVideo, setShowHeroVideo] = useState(false);

  // Self-hosted on Supabase Storage instead of embedded from YouTube — the
  // YouTube iframe player showed a stuck play/pause button whenever a
  // browser (mobile Chrome/Safari especially) blocked its autoplay, since
  // the wrapper's pointer-events-none stops a visitor from ever tapping it
  // away. A plain <video> has no such button to get stuck: it either plays
  // or silently shows its first frame, muted+loop+playsInline making
  // autoplay reliable across mobile browsers in the first place.
  const heroVideoUrl = "https://yfmlwrmjfhpftdcovmnb.supabase.co/storage/v1/object/public/site-assets/hero/omsu-hero.mp4";

  useEffect(() => {
    // Still deferred a beat so the actual page paints first — much less
    // to defer now than the old ~1MB YouTube iframe, but the dark hero
    // background covers the gap either way.
    const timer = window.setTimeout(() => setShowHeroVideo(true), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  const handleNavigation = (page: any) => {
    setActivePage(page.toLowerCase());
    onNavigate(page);
    setIsMenuOpen(false); // Isara ang menu pagkatapos mag-click
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

  const features = [
    { icon: BookOpen, title: "Information Services", description: "Access guidance announcements, educational resources, and mental health materials.", action: () => handleNavigation("Programs") },
    { icon: ClipboardList, title: "Testing Services", description: "Participate in aptitude tests, assessments, and diagnostic examinations.", action: () => handleNavigation("Login") },
    { icon: GraduationCap, title: "Career Orientation", description: "Explore career guidance programs, seminars, and degree planning resources.", action: () => handleNavigation("Programs") },
    { icon: Users, title: "Counseling Services", description: "Receive academic, personal, and emotional support through our programs.", action: () => handleNavigation("About") },
  ];

  return (
    <div className="w-full min-h-screen bg-white">
      {/* ================= NAVBAR (RESPONSIVE) ================= */}
      <header className="fixed top-0 left-0 right-0 h-[70px] md:h-[80px] bg-gradient-to-r from-[#003d8f] via-[#0059b8] to-[#0066cc] backdrop-blur-md z-[100] shadow-lg shadow-blue-900/10 border-b border-white/10">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer group" onClick={() => handleNavigation("home")}>
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors overflow-hidden">
              <img
                src="https://guidance.omsc.edu.ph/assets/images/logo.png"
                alt="OMSU Guidance and Testing Center"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="font-black text-sm md:text-xl uppercase tracking-tight text-white leading-tight">OMSU Web-Based</h1>
              <p className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] text-blue-100 font-bold">Guidance System</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-2 font-bold text-[11px] uppercase tracking-wider">
            {["Home", "Programs", "Materials", "About"].map((item) => {
              const key = item.toLowerCase();
              const label = item === "Materials" ? "IEC Materials" : item;
              return (
                <button key={item} onClick={() => handleNavigation(item)} className="relative px-4 py-2 text-white transition-transform hover:-translate-y-0.5">
                  <span className={activePage === key ? "opacity-100" : "opacity-70 hover:opacity-100"}>
                    {label}
                  </span>
                  {activePage === key && <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button onClick={() => (window.location.href = "/login?mode=register")} variant="outline" className="hidden sm:flex bg-transparent border-white/70 text-white hover:bg-white/10 hover:text-white text-[10px] px-6 rounded-xl transition-all hover:-translate-y-0.5">Get Started</Button>
            <Button onClick={() => (window.location.href = "/login")} className="hidden sm:flex bg-white text-[#0066cc] text-[10px] px-6 rounded-xl shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">Login</Button>
            {/* Mobile Menu Toggle */}
            <button
              className="lg:hidden text-white p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMenuOpen && (
          <div className="lg:hidden absolute top-[70px] md:top-[80px] left-0 right-0 bg-gradient-to-b from-[#0059b8] to-[#003d8f] border-t border-white/10 p-6 flex flex-col gap-4 shadow-2xl animate-in slide-in-from-top duration-300">
            {["Home", "Programs", "Materials", "About"].map((item, index) => {
              const ItemIcon = MOBILE_NAV_ICONS[item];
              return (
                <button
                  key={item}
                  onClick={() => handleNavigation(item)}
                  style={{ animationDelay: `${index * 50}ms` }}
                  className="flex items-center gap-3 text-left text-white font-black uppercase text-lg border-b border-white/5 pb-2 animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
                >
                  {ItemIcon && <ItemIcon size={20} className="shrink-0 opacity-80" />}
                  {item === "Materials" ? "IEC Materials" : item}
                </button>
              );
            })}
            <Button
              onClick={() => (window.location.href = "/login?mode=register")}
              variant="outline"
              style={{ animationDelay: "175ms" }}
              className="w-full bg-transparent border-white text-white hover:bg-white/10 hover:text-white font-black h-12 rounded-xl mt-4 animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
            >
              Get Started
            </Button>
            <Button
              onClick={() => (window.location.href = "/login")}
              style={{ animationDelay: "200ms" }}
              className="w-full bg-white text-[#0066cc] font-black h-12 rounded-xl animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
            >
              Login
            </Button>
          </div>
        )}
      </header>

      {/* ================= HERO SECTION (RESPONSIVE) ================= */}
      <section className="relative h-[85vh] md:h-[700px] overflow-hidden mt-[70px] md:mt-[80px] bg-black">
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Ginawang Object-Cover para sa mobile */}
          {showHeroVideo && (
            <video
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover"
              src={heroVideoUrl}
              autoPlay
              muted
              loop
              playsInline
              disablePictureInPicture
              controlsList="nodownload noplaybackrate"
              aria-label="OMSU Guidance background video"
            />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-[#001f4d]/95 via-[#003366]/80 to-transparent z-10" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-blue-400/10 rounded-full blur-[80px] z-10 pointer-events-none" />

        <div className="relative max-w-[1200px] mx-auto px-6 h-full flex items-center z-20">
          <div className="max-w-3xl space-y-6 md:space-y-8">
            <p className="uppercase tracking-[0.2em] text-blue-200 text-[10px] md:text-xs font-black inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-2 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" /> Occidental Mindoro State University
            </p>
            <h1 className="text-3xl md:text-7xl font-black uppercase text-white leading-[1.1] tracking-tighter drop-shadow-sm">
              Web-Based <br className="hidden md:block" /> Guidance Program
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-indigo-300 text-xl md:text-5xl mt-2 md:mt-4">Information System</span>
            </h1>
            <p className="text-sm md:text-xl text-white/90 font-medium max-w-xl">Supporting students through accessible counseling, career orientation, and mental wellness resources.</p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button onClick={() => handleNavigation("programs")} className="w-full sm:w-auto bg-white text-blue-700 font-black h-14 px-10 rounded-2xl shadow-xl shadow-black/20 hover:shadow-2xl hover:-translate-y-1 transition-all">Explore Programs</Button>
              <Button onClick={() => handleNavigation("about")} className="w-full sm:w-auto bg-white/5 backdrop-blur-sm text-white border-2 border-white/70 font-black h-14 px-10 rounded-2xl hover:bg-white/15 hover:-translate-y-1 transition-all">Learn More</Button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SYSTEM OVERVIEW (RESPONSIVE GRID) ================= */}
      <section className="py-16 md:py-24 bg-slate-50">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16 items-center">
            <div className="space-y-6 text-center lg:text-left">
              <p className="text-blue-600 font-black uppercase tracking-[0.3em] text-xs">About the System</p>
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-slate-900 leading-tight">Digital Platform for Students</h2>
              <p className="text-slate-600 text-base md:text-lg">One centralized platform for counseling, career guidance, and student support services.</p>
            </div>
            <div className="relative overflow-hidden bg-gradient-to-br from-[#0059b8] via-[#0066cc] to-indigo-700 rounded-[2rem] md:rounded-[3rem] p-8 md:p-10 text-white shadow-2xl shadow-blue-900/30">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-300/10 rounded-full -ml-10 -mb-10 blur-2xl" />
              <h3 className="relative text-2xl font-black uppercase mb-6">Quality Objectives</h3>
              <ul className="relative space-y-4 text-sm md:text-base text-blue-100 font-medium">
                {[
                  "Relevant and timely guidance programs",
                  "Mental and emotional wellness promotion",
                  "Improved accessibility of services",
                  "Career and academic support",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center shrink-0 text-white text-xs font-black">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SERVICES (AUTO-STACKING GRID) ================= */}
      <section className="py-16 md:py-24 bg-white border-b">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-black uppercase text-slate-900 tracking-tighter">Our Guidance Services</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="group p-6 md:p-8 bg-slate-50 border border-slate-100/60 rounded-[2rem] text-center hover:-translate-y-2 hover:shadow-xl hover:border-transparent transition-all duration-300 cursor-pointer" onClick={feature.action}>
                <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md shadow-blue-600/20 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-black uppercase mb-3 group-hover:text-blue-600 transition-colors">{feature.title}</h3>
                <p className="text-xs md:text-sm text-slate-500 font-medium">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ================= LATEST PROGRAMS (RESPONSIVE CARDS) ================= */}
      <section className="py-16 md:py-24 bg-slate-50">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center md:items-end mb-12 gap-4">
            <h2 className="text-3xl md:text-4xl font-black uppercase text-slate-900 text-center md:text-left">Latest Programs</h2>
            <button onClick={() => handleNavigation("programs")} className="text-blue-600 font-black uppercase text-xs tracking-widest flex items-center gap-2">View All <ArrowRight size={16} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {isLoading ? (
              [1, 2, 3, 4].map((n) => <div key={n} className="aspect-[4/3] bg-slate-200 animate-pulse rounded-2xl" />)
            ) : (
              programs.map((program) => {
                const effectiveStatus = getEffectiveProgramStatus(program);
                return (
                <Card key={program.id} className="group rounded-3xl border border-slate-100/60 overflow-hidden bg-white shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col">
                  <div className="aspect-video bg-slate-900 relative overflow-hidden">
                    {program.image_url ? <img src={program.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" loading="lazy" decoding="async" /> : <div className="flex h-full items-center justify-center text-white"><ImageIcon size={30} /></div>}
                    <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm
                      ${effectiveStatus === 'ongoing' ? 'bg-emerald-500 text-white animate-pulse' : effectiveStatus === 'completed' ? 'bg-slate-700 text-white' : 'bg-blue-600 text-white'}`}>
                      {effectiveStatus}
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="text-md font-black uppercase leading-tight line-clamp-2 mb-4 group-hover:text-blue-600 transition-colors">{program.title}</h3>
                    <div className="mt-auto space-y-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <div className="flex items-center gap-2"><Calendar size={12} className="text-blue-500" /> {formatProgramDate(program, (date) => new Date(date).toLocaleDateString())}</div>
                      <div className="flex items-center gap-2"><MapPin size={12} className="text-blue-500" /> {program.location}</div>
                    </div>
                  </div>
                </Card>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* ================= CTA (FULL WIDTH MOBILE) ================= */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-[1200px] mx-auto px-4">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#0059b8] via-[#0066cc] to-indigo-700 rounded-[2rem] md:rounded-[3rem] p-10 md:p-20 text-center text-white shadow-2xl shadow-blue-900/30">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-300/20 rounded-full -mr-24 -mt-24 blur-[80px]" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full -ml-24 -mb-24 blur-[80px]" />
            <h2 className="relative text-3xl md:text-6xl font-black uppercase mb-6">Start Your Journey</h2>
            <p className="relative text-blue-100 mb-10 max-w-2xl mx-auto text-sm md:text-lg">Access counseling and student support services anytime online.</p>
            <Button onClick={() => (window.location.href = "/login")} className="relative w-full sm:w-auto bg-white text-blue-700 font-black h-16 px-12 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">Access Portal</Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;