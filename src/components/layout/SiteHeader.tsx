import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Calendar, Home, Info, Menu, X } from "lucide-react";

// Shared navbar for the public pages (Home, Programs, IEC Materials,
// About), rendered by Layout.tsx. Same design as the sign-in page.

export const PUBLIC_NAV_LINKS: { label: string; to: string; icon: React.ElementType }[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Programs", to: "/programs", icon: Calendar },
  { label: "IEC Materials", to: "/materials", icon: BookOpen },
  { label: "About", to: "/about", icon: Info },
];

export const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

export default function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (to: string) => location.pathname.toLowerCase() === to;

  const goTo = (path: string) => {
    setIsMenuOpen(false);
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#EEF0FA]/90 backdrop-blur-md font-figtree">
      <div className="max-w-[1440px] mx-auto h-[72px] lg:h-[88px] pl-5 pr-4 lg:px-8 xl:px-12 flex items-center gap-2.5 lg:gap-4 xl:gap-8">
        <Link
          to="/"
          onClick={() => {
            setIsMenuOpen(false);
            scrollToTop();
          }}
          className={`min-h-[44px] flex items-center gap-2.5 lg:gap-3 text-left text-[#1E1B4B] rounded-2xl min-w-0 ${focusRing}`}
          aria-label="OMSU Guidance home"
        >
          <img
            src="/guidance-logo.jpg"
            alt=""
            className="w-10 h-10 lg:w-11 lg:h-11 rounded-full object-cover bg-white shrink-0"
          />
          <span className="flex flex-col gap-px min-w-0">
            <span className="font-bricolage font-extrabold text-[17px] lg:text-lg tracking-[-0.3px] leading-tight whitespace-nowrap">
              OMSU Guidance
            </span>
            <span className="text-xs lg:text-[13px] font-medium text-[#5B6477] truncate">
              Guidance and Testing Center
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden lg:flex gap-1 xl:gap-1.5 lg:ml-2 xl:ml-6">
          {PUBLIC_NAV_LINKS.map(({ label, to }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={scrollToTop}
                aria-current={active ? "page" : undefined}
                className={`h-11 px-3 xl:px-4 rounded-full flex items-center whitespace-nowrap text-[15px] transition-colors ${focusRing} ${
                  active ? "bg-white text-[#1E1B4B] font-bold" : "text-[#334155] font-semibold hover:bg-white/60"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:gap-2.5">
          <button
            type="button"
            onClick={() => goTo("/login")}
            className={`hidden sm:flex h-[46px] px-4 xl:px-5 rounded-2xl items-center whitespace-nowrap text-[15px] font-bold text-[#1E1B4B] hover:bg-white/60 transition-colors ${focusRing}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => goTo("/login?mode=register")}
            className={`hidden sm:flex h-[46px] px-4 xl:px-[22px] rounded-2xl items-center whitespace-nowrap text-[15px] font-bold bg-[#4F46E5] hover:bg-[#4338CA] text-white transition-colors ${focusRing}`}
          >
            Create account
          </button>
          <button
            type="button"
            className={`lg:hidden w-[46px] h-[46px] rounded-2xl bg-white flex items-center justify-center text-[#1E1B4B] ${focusRing}`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls="site-mobile-menu"
          >
            {isMenuOpen ? <X className="w-[22px] h-[22px]" /> : <Menu className="w-[22px] h-[22px]" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div
          id="site-mobile-menu"
          className="lg:hidden absolute top-[72px] left-3 right-3 bg-white rounded-[28px] p-3 shadow-[0_24px_60px_-24px_rgba(30,27,75,0.45)] flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {PUBLIC_NAV_LINKS.map(({ label, to, icon: Icon }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => {
                  setIsMenuOpen(false);
                  scrollToTop();
                }}
                aria-current={active ? "page" : undefined}
                className={`h-12 px-4 rounded-2xl flex items-center gap-3 text-left text-base transition-colors ${focusRing} ${
                  active ? "bg-[#EEF0FA] text-[#1E1B4B] font-bold" : "text-[#334155] font-semibold hover:bg-[#F5F6FB]"
                }`}
              >
                <Icon className="w-5 h-5 text-[#4338CA] shrink-0" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={() => goTo("/login")}
              className={`h-12 rounded-2xl border-[1.5px] border-[#DDE1EE] text-[#1E1B4B] font-bold text-[15px] ${focusRing}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => goTo("/login?mode=register")}
              className={`h-12 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] ${focusRing}`}
            >
              Create account
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
