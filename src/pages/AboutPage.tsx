import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Expand, Facebook, Mail, MapPin, Phone, PhoneCall, ShieldCheck, Siren } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  COMPONENTS,
  DEFAULT_OBJECTIVES,
  EMERGENCY,
  FALLBACK_CONTENT,
  HOTLINES,
  SERVICES,
  SYSTEM_PURPOSE,
  SYSTEM_STEPS,
  aboutImageUrl,
  normalizeAboutContent,
  parsePhones,
  safeHttpsUrl,
  type AboutContent,
} from "../lib/aboutContent";
import ZoomableImage from "../components/shared/ZoomableImage";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

const sectionHeading =
  "m-0 font-bricolage font-extrabold text-[28px] sm:text-[32px] lg:text-[40px] leading-[1.1] tracking-[-0.02em] text-[#1E1B4B]";

const sectionPad = "px-3 pt-12 sm:px-5 lg:px-[72px] lg:pt-20";

const AboutPage: React.FC = () => {
  const [content, setContent] = useState<AboutContent>(FALLBACK_CONTENT);
  const [chartOpen, setChartOpen] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const [chartFailed, setChartFailed] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      // select("*"): works whether or not the newer columns exist yet.
      const { data, error } = await supabase.from("about_content").select("*").eq("id", 1).maybeSingle();
      if (!error && data) setContent(normalizeAboutContent(data as Record<string, unknown>));
    };

    fetchContent();
  }, []);

  const phones = parsePhones(content.contact_phone);
  const facebookUrl = safeHttpsUrl(content.contact_facebook_url);
  const objectives = content.objectives ?? DEFAULT_OBJECTIVES;
  const heroUrl = heroFailed ? null : aboutImageUrl(content.hero_image_path, content.updated_at);
  const chartUrl = chartFailed ? null : aboutImageUrl(content.org_chart_path, content.updated_at);
  const hasVisit = !!(content.office_location.trim() || content.office_hours.trim());
  const hasVisionMission = !!(content.vision.trim() || content.mission.trim());

  return (
    <div className="w-full font-figtree text-[#1E293B] pb-16 lg:pb-24">
      <div className="max-w-[1440px] mx-auto">
        {/* ================= HEADER ================= */}
        <section className="px-3 pt-3 lg:px-6 lg:pt-2">
          <div className="rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white px-[22px] py-9 sm:px-10 lg:px-[72px] lg:py-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8 lg:gap-14 items-center">
            <div className="flex flex-col gap-4 lg:gap-5 min-w-0">
              <span className="self-start px-3.5 py-1.5 rounded-full bg-[#FBBF24] text-[#1E1B4B] font-bold text-sm">
                About the Center
              </span>
              <h1 className="m-0 font-bricolage font-extrabold text-[36px] sm:text-5xl lg:text-[60px] leading-[1.04] tracking-[-0.02em] break-words">
                {content.heading_title}
              </h1>
              <p className="m-0 text-base lg:text-lg leading-[1.6] text-[#C7C9F2]">{content.hero_intro}</p>
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              {heroUrl && (
                <img
                  src={heroUrl}
                  alt={`${content.heading_title}`}
                  onError={() => setHeroFailed(true)}
                  className="w-full aspect-[4/3] object-cover rounded-[28px] lg:rounded-[32px] bg-white/10"
                />
              )}
              <div className="rounded-[28px] lg:rounded-[32px] bg-white text-[#1E293B] p-6 lg:p-7 flex flex-col gap-4">
                <span className="text-sm font-semibold text-[#5B6477]">Led by</span>
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="w-16 h-16 rounded-2xl bg-[#4F46E5] text-white font-bricolage font-extrabold text-2xl flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    {getInitials(content.director_name)}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-bold text-lg leading-[1.25] text-[#1E1B4B] break-words">
                      {content.director_name}
                    </span>
                    <span className="text-sm leading-[1.4] text-[#4338CA] font-semibold break-words">
                      {content.director_title}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= NEED HELP NOW ================= */}
        <section aria-labelledby="need-help-heading" className="px-3 pt-4 sm:px-5 lg:px-6 lg:pt-6">
          <div className="rounded-[32px] lg:rounded-[40px] bg-[#FEF3C7] px-[22px] py-7 sm:px-8 lg:px-12 lg:py-9 flex flex-col gap-5">
            <div className="flex flex-col gap-2 max-w-[760px]">
              <h2
                id="need-help-heading"
                className="m-0 font-bricolage font-extrabold text-[26px] sm:text-[30px] lg:text-[34px] leading-[1.1] tracking-[-0.02em] text-[#1E1B4B]"
              >
                Need help now?
              </h2>
              <p className="m-0 text-base leading-[1.55] text-[#4B3F0B]">
                If you or someone you know is struggling, you are not alone. The NCMH Crisis Hotline is free,
                confidential, and open 24 hours a day. Tap a number to call.
              </p>
            </div>

            <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {HOTLINES.map((line) => (
                <li key={line.number}>
                  <a
                    href={line.href}
                    className={`min-h-[64px] rounded-[20px] bg-white px-5 py-3 flex items-center gap-4 hover:shadow-md transition-shadow ${focusRing}`}
                  >
                    <span className="w-11 h-11 rounded-[14px] bg-[#1E1B4B] text-[#FBBF24] flex items-center justify-center shrink-0">
                      <PhoneCall className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-bricolage font-extrabold text-[22px] leading-tight text-[#1E1B4B]">{line.number}</span>
                      <span className="text-sm text-[#5B6477]">NCMH Crisis Hotline · {line.note}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <a
                href={EMERGENCY.href}
                className={`min-h-[52px] px-6 rounded-2xl bg-[#1E1B4B] hover:bg-[#312E81] text-white font-bold text-base flex items-center justify-center gap-2.5 transition-colors ${focusRing}`}
              >
                <Siren className="w-5 h-5 text-[#FBBF24]" aria-hidden="true" />
                In an emergency, call {EMERGENCY.number}
              </a>
              {phones.length > 0 && (
                <p className="m-0 text-[15px] text-[#4B3F0B] flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">Guidance Office:</span>
                  {phones.map((phone) => (
                    <a
                      key={phone.href}
                      href={phone.href}
                      className={`min-h-[44px] inline-flex items-center px-1 font-bold text-[#1E1B4B] underline underline-offset-2 rounded ${focusRing}`}
                    >
                      {phone.label}
                    </a>
                  ))}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ================= VISION AND MISSION (only what has been written) ================= */}
        {hasVisionMission && (
          <section aria-label="Vision and mission" className={`${sectionPad} grid grid-cols-1 ${content.vision.trim() && content.mission.trim() ? "md:grid-cols-2" : ""} gap-4 lg:gap-5`}>
            {content.vision.trim() && (
              <div className="rounded-[28px] lg:rounded-[32px] bg-white p-6 lg:p-9 flex flex-col gap-3">
                <h2 className="m-0 font-bricolage font-extrabold text-[26px] lg:text-[32px] leading-[1.1] tracking-[-0.02em] text-[#1E1B4B]">Vision</h2>
                <p className="m-0 text-base lg:text-[17px] leading-[1.65] text-[#5B6477] whitespace-pre-line">{content.vision}</p>
              </div>
            )}
            {content.mission.trim() && (
              <div className="rounded-[28px] lg:rounded-[32px] bg-white p-6 lg:p-9 flex flex-col gap-3">
                <h2 className="m-0 font-bricolage font-extrabold text-[26px] lg:text-[32px] leading-[1.1] tracking-[-0.02em] text-[#1E1B4B]">Mission</h2>
                <p className="m-0 text-base lg:text-[17px] leading-[1.65] text-[#5B6477] whitespace-pre-line">{content.mission}</p>
              </div>
            )}
          </section>
        )}

        {/* ================= COLLABORATIVE APPROACH + OUR SERVICES ================= */}
        <section className={`${sectionPad} grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 lg:gap-14 items-start`}>
          <div className="flex flex-col gap-4 px-2 sm:px-0">
            <h2 className={sectionHeading}>A collaborative approach</h2>
            <p className="m-0 text-base lg:text-[17px] leading-[1.65] text-[#5B6477]">
              {content.collaborative_approach_text}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="m-0 px-2 sm:px-0 font-bricolage font-extrabold text-[26px] lg:text-[32px] leading-[1.1] tracking-[-0.02em] text-[#1E1B4B]">
              Our services
            </h2>
            <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SERVICES.map((service) => (
                <li key={service.name} className="rounded-[28px] bg-white p-6 flex flex-col gap-2.5">
                  <span className="font-bold text-[17px] leading-[1.3] text-[#1E1B4B]">{service.name}</span>
                  <p className="m-0 text-[15px] leading-[1.55] text-[#5B6477] flex-1">{service.desc}</p>
                  <Link
                    to={`/programs?service=${encodeURIComponent(service.name)}`}
                    className={`self-start min-h-[44px] inline-flex items-center gap-1.5 -ml-1 px-1 rounded-lg font-bold text-sm text-[#4338CA] hover:underline ${focusRing}`}
                  >
                    See {service.name} programs <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ================= FOUR PROGRAM COMPONENTS ================= */}
        <section className={`${sectionPad} flex flex-col gap-4`}>
          <h2 className="m-0 px-2 sm:px-0 font-bold text-lg text-[#1E1B4B]">The four program components</h2>
          <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COMPONENTS.map((c) => (
              <li key={c.title} className="rounded-[28px] bg-white p-6 flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
                  <span className="font-bold text-[17px] leading-[1.3] text-[#1E1B4B]">{c.title}</span>
                </div>
                <p className="m-0 text-[15px] leading-[1.55] text-[#5B6477]">{c.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ================= QUALITY POLICY OBJECTIVES ================= */}
        <section className={`${sectionPad} flex flex-col gap-6`}>
          <h2 className={`${sectionHeading} px-2 sm:px-0`}>Quality policy objectives</h2>
          <ol className="m-0 p-0 list-none grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
            {objectives.map((text, index) => (
              <li key={index} className="rounded-[28px] bg-white p-6 lg:p-7 flex flex-col gap-4">
                <span
                  className="w-11 h-11 rounded-[14px] bg-[#E0E7FF] text-[#4338CA] font-bricolage font-extrabold text-lg flex items-center justify-center"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <p className="m-0 text-[15px] leading-[1.6] text-[#334155]">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ================= ORGANIZATIONAL CHART (only when one is uploaded) ================= */}
        {chartUrl && (
          <section aria-labelledby="org-chart-heading" className={`${sectionPad} flex flex-col gap-6`}>
            <h2 id="org-chart-heading" className={`${sectionHeading} px-2 sm:px-0`}>Organizational chart</h2>
            <div className="rounded-[28px] lg:rounded-[32px] bg-white p-3 sm:p-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setChartOpen(true)}
                aria-label="Open the organizational chart to zoom in"
                className={`group relative rounded-[20px] overflow-hidden bg-[#F5F6FB] flex items-center justify-center ${focusRing}`}
              >
                <img
                  src={chartUrl}
                  alt="The organizational chart of the Guidance and Testing Center"
                  onError={() => setChartFailed(true)}
                  className="max-h-[560px] w-auto max-w-full object-contain"
                />
                <span className="absolute right-3 bottom-3 min-h-[44px] px-4 rounded-xl bg-[#1E1B4B]/90 text-white text-sm font-bold flex items-center gap-2 group-hover:bg-[#1E1B4B]">
                  <Expand className="w-4 h-4" aria-hidden="true" /> Open and zoom
                </span>
              </button>
            </div>

            <Dialog open={chartOpen} onOpenChange={setChartOpen}>
              <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl flex flex-col [&>button]:right-3 [&>button]:top-3 [&>button]:w-11 [&>button]:h-11 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:z-20 [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-100">
                <DialogTitle className="sr-only">Organizational chart</DialogTitle>
                <div className="flex-1 min-h-0 w-full">
                  <ZoomableImage src={chartUrl} alt="The organizational chart of the Guidance and Testing Center" className="p-4" />
                </div>
              </DialogContent>
            </Dialog>
          </section>
        )}

        {/* ================= ABOUT THIS SYSTEM ================= */}
        <section aria-labelledby="about-system-heading" className={`${sectionPad} flex flex-col gap-6`}>
          <div className="flex flex-col gap-3 px-2 sm:px-0 max-w-[820px]">
            <h2 id="about-system-heading" className={sectionHeading}>About this system</h2>
            <p className="m-0 text-base lg:text-[17px] leading-[1.65] text-[#5B6477]">{SYSTEM_PURPOSE}</p>
          </div>

          <ol className="m-0 p-0 list-none grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
            {SYSTEM_STEPS.map((step, index) => (
              <li key={step.title} className="rounded-[28px] bg-white p-6 lg:p-7 flex flex-col gap-3">
                <span
                  className="w-11 h-11 rounded-[14px] bg-[#FBBF24] text-[#1E1B4B] font-bricolage font-extrabold text-lg flex items-center justify-center"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="font-bold text-[17px] leading-[1.3] text-[#1E1B4B]">{step.title}</span>
                <p className="m-0 text-[15px] leading-[1.55] text-[#5B6477]">{step.desc}</p>
              </li>
            ))}
          </ol>

          <div className="rounded-[28px] bg-white p-6 lg:p-7 flex flex-col gap-4">
            <Link
              to="/privacy"
              className={`self-start min-h-[44px] inline-flex items-center gap-2.5 rounded-xl font-bold text-base text-[#4338CA] hover:underline ${focusRing}`}
            >
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              How we handle your data: read the Data Privacy Notice
            </Link>
            {content.system_credits.trim() && (
              <div className="flex flex-col gap-1.5 border-t border-[#EEF0FA] pt-4">
                <h3 className="m-0 font-bold text-lg text-[#1E1B4B]">Credits</h3>
                <p className="m-0 text-[15px] leading-[1.6] text-[#5B6477] whitespace-pre-line">{content.system_credits}</p>
              </div>
            )}
          </div>
        </section>

        {/* ================= VISIT US / GET IN TOUCH ================= */}
        <section className="px-3 pt-12 lg:px-6 lg:pt-20">
          <div className="rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white px-[22px] py-9 sm:px-10 lg:px-[72px] lg:py-16 flex flex-col gap-7 lg:gap-10">
            <div className="flex flex-col gap-3 max-w-[640px]">
              <h2 className="m-0 font-bricolage font-extrabold text-[32px] sm:text-[40px] lg:text-5xl leading-[1.05] tracking-[-0.02em]">
                {hasVisit ? "Visit us or get in touch" : "Get in touch"}
              </h2>
              <p className="m-0 text-base lg:text-lg leading-[1.55] text-[#C7C9F2]">
                Reach the Guidance and Testing Center through any of these channels.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {content.office_location.trim() && (
                <div className="rounded-[24px] bg-white/10 p-5 lg:p-6 flex gap-4 min-w-0">
                  <span className="w-11 h-11 rounded-[14px] bg-[#F472B6] text-[#1E1B4B] flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-semibold text-[#C7C9F2]">Visit us</span>
                    <span className="font-bold text-[15px] text-white break-words whitespace-pre-line">{content.office_location}</span>
                  </span>
                </div>
              )}

              {content.office_hours.trim() && (
                <div className="rounded-[24px] bg-white/10 p-5 lg:p-6 flex gap-4 min-w-0">
                  <span className="w-11 h-11 rounded-[14px] bg-[#FBBF24] text-[#1E1B4B] flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-semibold text-[#C7C9F2]">Office hours</span>
                    <span className="font-bold text-[15px] text-white break-words whitespace-pre-line">{content.office_hours}</span>
                  </span>
                </div>
              )}

              {content.contact_email.trim() && (
                <a
                  href={`mailto:${content.contact_email}`}
                  className={`group rounded-[24px] bg-white/10 hover:bg-white/15 p-5 lg:p-6 flex gap-4 min-w-0 transition-colors ${focusRing}`}
                >
                  <span className="w-11 h-11 rounded-[14px] bg-[#FBBF24] text-[#1E1B4B] flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-semibold text-[#C7C9F2]">Email</span>
                    <span className="font-bold text-[15px] text-white break-all group-hover:underline">
                      {content.contact_email}
                    </span>
                  </span>
                </a>
              )}

              {phones.length > 0 && (
                <div className="rounded-[24px] bg-white/10 p-5 lg:p-6 flex gap-4 min-w-0">
                  <span className="w-11 h-11 rounded-[14px] bg-[#34D399] text-[#1E1B4B] flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-[#C7C9F2]">Phone</span>
                    {phones.map((phone) => (
                      <a
                        key={phone.href}
                        href={phone.href}
                        className={`min-h-[44px] inline-flex items-center font-bold text-[15px] text-white break-words hover:underline rounded ${focusRing}`}
                      >
                        {phone.label}
                      </a>
                    ))}
                  </span>
                </div>
              )}

              {(content.contact_facebook.trim() || facebookUrl) &&
                (facebookUrl ? (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group rounded-[24px] bg-white/10 hover:bg-white/15 p-5 lg:p-6 flex gap-4 min-w-0 transition-colors ${focusRing}`}
                  >
                    <span className="w-11 h-11 rounded-[14px] bg-[#A5B4FC] text-[#1E1B4B] flex items-center justify-center shrink-0">
                      <Facebook className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col gap-1 min-w-0">
                      <span className="text-sm font-semibold text-[#C7C9F2]">Facebook</span>
                      <span className="font-bold text-[15px] text-white break-words group-hover:underline">
                        {content.contact_facebook.trim() || "Visit our Facebook page"}
                      </span>
                    </span>
                  </a>
                ) : (
                  <div className="rounded-[24px] bg-white/10 p-5 lg:p-6 flex gap-4 min-w-0">
                    <span className="w-11 h-11 rounded-[14px] bg-[#A5B4FC] text-[#1E1B4B] flex items-center justify-center shrink-0">
                      <Facebook className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col gap-1 min-w-0">
                      <span className="text-sm font-semibold text-[#C7C9F2]">Facebook</span>
                      <span className="font-bold text-[15px] text-white break-words">{content.contact_facebook}</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AboutPage;
