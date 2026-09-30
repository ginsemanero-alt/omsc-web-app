import { Link } from "react-router-dom";
import { PUBLIC_NAV_LINKS, focusRing } from "./SiteHeader";

// Shared footer for the public pages, rendered by Layout.tsx.

export const SYSTEM_TITLE =
  "Web-Based Guidance Program Dissemination and Awareness Assessment System for the Higher Education Students of Occidental Mindoro State University";

export default function SiteFooter() {
  return (
    <footer className="font-figtree text-[#1E293B]">
      <div className="max-w-[1440px] mx-auto px-5 pt-11 pb-8 lg:px-[72px] lg:pt-14 lg:pb-10 flex flex-col gap-6 lg:gap-8">
        <div className="flex flex-col lg:flex-row lg:justify-between gap-7 lg:gap-12">
          <div className="flex gap-3 lg:gap-3.5 max-w-[560px]">
            <img
              src="/guidance-logo.jpg"
              alt=""
              className="w-10 h-10 lg:w-12 lg:h-12 rounded-full object-cover bg-white shrink-0"
            />
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
              {PUBLIC_NAV_LINKS.filter((link) => link.to !== "/").map(({ label, to }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className={`min-h-[44px] min-w-[44px] self-start inline-flex items-center font-medium text-sm text-[#334155] hover:text-[#4338CA] hover:underline rounded ${focusRing}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-1">
              <span className="font-bold text-sm text-[#1E1B4B] mb-1">Contact</span>
              <a
                href="mailto:guidance@omsc.edu.ph"
                className={`min-h-[44px] min-w-[44px] self-start inline-flex items-center font-medium text-sm text-[#334155] hover:text-[#4338CA] hover:underline rounded ${focusRing}`}
              >
                guidance@omsc.edu.ph
              </a>
              <span className="min-h-[44px] flex items-center text-sm text-[#334155]">
                Facebook: OMSU Guidance and Testing Center
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4 lg:pt-[22px] border-t border-[#D5D9EA] flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-8 text-xs lg:text-[13px] leading-[1.5] text-[#5B6477]">
          <span>{SYSTEM_TITLE}</span>
          <span className="shrink-0">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
