import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
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
  image_url?: string;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePage, setActivePage] = useState("home");
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Mobile menu state
  const [showHeroVideo, setShowHeroVideo] = useState(false);

  const youtubeVideoId = "A2JuNCYrUHE";

  useEffect(() => {
    // The hero background is a full YouTube embed — ~1MB of YouTube's own
    // JS/iframe overhead that was previously loading immediately and
    // competing with the page's own critical resources (fonts, JS bundle)
    // for bandwidth and main-thread time. Deferring it a beat lets the
    // actual page paint first; the dark hero background covers the gap.
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
      <header className="fixed top-0 left-0 right-0 h-[70px] md:h-[80px] bg-[#0066cc] z-[100] shadow-lg">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => handleNavigation("home")}>
            <GraduationCap className="w-7 h-7 md:w-9 md:h-9 text-white" />
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
                <button key={item} onClick={() => handleNavigation(item)} className="relative px-4 py-2 text-white">
                  <span className={activePage === key ? "opacity-100" : "opacity-70 hover:opacity-100"}>
                    {label}
                  </span>
                  {activePage === key && <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-full" />}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button onClick={() => (window.location.href = "/login")} className="hidden sm:flex bg-white text-[#0066cc] text-[10px] px-6 rounded-xl">Login</Button>
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
          <div className="lg:hidden absolute top-[70px] md:top-[80px] left-0 right-0 bg-[#0055aa] border-t border-white/10 p-6 flex flex-col gap-4 shadow-2xl animate-in slide-in-from-top duration-300">
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
              onClick={() => (window.location.href = "/login")}
              style={{ animationDelay: "200ms" }}
              className="w-full bg-white text-[#0066cc] font-black h-12 rounded-xl mt-4 animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
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
            <iframe
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[180%] md:w-full md:h-full md:scale-[1.35]"
              src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&mute=1&loop=1&playlist=${youtubeVideoId}&controls=0&modestbranding=1`}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              title="OMSU Guidance background video"
            ></iframe>
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-[#003366]/95 via-[#003366]/70 to-transparent z-10" />

        <div className="relative max-w-[1200px] mx-auto px-6 h-full flex items-center z-20">
          <div className="max-w-3xl space-y-6 md:space-y-8">
            <p className="uppercase tracking-[0.2em] text-blue-200 text-[10px] md:text-xs font-black">Occidental Mindoro State University</p>
            <h1 className="text-3xl md:text-7xl font-black uppercase text-white leading-[1.1] tracking-tighter">
              Web-Based <br className="hidden md:block" /> Guidance Program
              <span className="block text-blue-400 text-xl md:text-5xl mt-2 md:mt-4">Information System</span>
            </h1>
            <p className="text-sm md:text-xl text-white/90 font-medium max-w-xl">Supporting students through accessible counseling, career orientation, and mental wellness resources.</p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button onClick={() => handleNavigation("programs")} className="w-full sm:w-auto bg-white text-blue-700 font-black h-14 px-10 rounded-2xl">Explore Programs</Button>
              <Button onClick={() => handleNavigation("about")} className="w-full sm:w-auto bg-transparent text-white border-2 border-white font-black h-14 px-10 rounded-2xl">Learn More</Button>
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
            <div className="bg-[#0066cc] rounded-[2rem] md:rounded-[3rem] p-8 md:p-10 text-white shadow-2xl">
              <h3 className="text-2xl font-black uppercase mb-6">Quality Objectives</h3>
              <ul className="space-y-4 text-sm md:text-base text-blue-100 font-medium">
                <li>• Relevant and timely guidance programs</li>
                <li>• Mental and emotional wellness promotion</li>
                <li>• Improved accessibility of services</li>
                <li>• Career and academic support</li>
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
              <Card key={index} className="p-6 md:p-8 bg-slate-50 border-none rounded-[2rem] text-center hover:-translate-y-2 transition-all cursor-pointer" onClick={feature.action}>
                <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md">
                  <feature.icon className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-black uppercase mb-3">{feature.title}</h3>
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
              programs.map((program) => (
                <Card key={program.id} className="rounded-3xl border-none overflow-hidden bg-white shadow-sm flex flex-col">
                  <div className="aspect-video bg-slate-900 relative">
                    {program.image_url ? <img src={program.image_url} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" /> : <div className="flex h-full items-center justify-center text-white"><ImageIcon size={30} /></div>}
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="text-md font-black uppercase leading-tight line-clamp-2 mb-4">{program.title}</h3>
                    <div className="mt-auto space-y-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <div className="flex items-center gap-2"><Calendar size={12} className="text-blue-500" /> {new Date(program.date).toLocaleDateString()}</div>
                      <div className="flex items-center gap-2"><MapPin size={12} className="text-blue-500" /> {program.location}</div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ================= CTA (FULL WIDTH MOBILE) ================= */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-[1200px] mx-auto px-4">
          <div className="bg-[#0066cc] rounded-[2rem] md:rounded-[3rem] p-10 md:p-20 text-center text-white">
            <h2 className="text-3xl md:text-6xl font-black uppercase mb-6">Start Your Journey</h2>
            <p className="text-blue-100 mb-10 max-w-2xl mx-auto text-sm md:text-lg">Access counseling and student support services anytime online.</p>
            <Button onClick={() => (window.location.href = "/login")} className="w-full sm:w-auto bg-white text-blue-700 font-black h-16 px-12 rounded-2xl">Access Portal</Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;