import React, { useEffect, useState } from "react";
import { Facebook, Mail, Phone, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

interface AboutContent {
  heading_title: string;
  hero_intro: string;
  director_name: string;
  director_title: string;
  collaborative_approach_text: string;
  contact_email: string;
  contact_facebook: string;
  contact_phone: string;
}

// Shown until the DB row loads (and if it's ever missing) so the page
// never renders blank — same wording the hardcoded version used to
// carry before this became admin-editable (see AboutContentManager.tsx
// and the PHASE 16 migration).
const FALLBACK_CONTENT: AboutContent = {
  heading_title: "The Guidance and Testing Center",
  hero_intro: "The Guidance and Testing Center is an essential and integral part of the overall educational process. School counselors, working within the framework of the program, make major contributions to the primary educational mission and vision of the institution by providing students with Guidance and Counseling activities and services that facilitate and enhance their academic, career, and personal and social development.",
  director_name: "Dr. Angelina C. Paquibot",
  director_title: "Guidance and Testing Center Director",
  collaborative_approach_text: "While school Counselors are available to respond to the unique needs of each student, the Guidance and Counseling approach is collaborative among teachers, parents and administrators. As a developmental program, it addresses the needs of all students in OMSU by facilitating their growth as well as helping to create positive and safe learning environments.",
  contact_email: "guidanceofficeomsc@gmail.com",
  contact_facebook: "OMSU Guidance and Testing Center",
  contact_phone: "043-491-0925 / 09632086253",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

const components = [
  {
    title: "Group Guidance",
    desc: "Structured group and classroom presentations aimed at collective proactive student growth.",
    dot: "bg-[#4F46E5]",
  },
  {
    title: "Individual Student Planning",
    desc: "Student appraisal, educational and career planning, and assistance with course selection and placement.",
    dot: "bg-[#7C3AED]",
  },
  {
    title: "Responsive Services",
    desc: "Individual and small-group counseling, peer support, crisis response, and referral to other professionals.",
    dot: "bg-[#F472B6]",
  },
  {
    title: "System Support",
    desc: "Program management, staff development, community outreach, and research and evaluation.",
    dot: "bg-[#FBBF24]",
  },
];

const objectives = [
  "To maintain the highest quality of assistance and support to the academic community by providing relevant and timely programs, services, and information in the area of students' personal, social, educational and career development in all educational levels of the colleges.",
  "To provide high-quality placement and diagnostic services to students of their aptitudes and interests toward better degree selection and career decision-making.",
  "To develop relevant and responsive student-oriented programs aimed at the mental and social health of students to promote healthy and harmonious relationship among students, teachers and administrative staff.",
];

const sectionHeading =
  "m-0 font-bricolage font-extrabold text-[28px] sm:text-[32px] lg:text-[40px] leading-[1.1] tracking-[-0.02em] text-[#1E1B4B]";

const AboutPage: React.FC = () => {
  const [content, setContent] = useState<AboutContent>(FALLBACK_CONTENT);

  useEffect(() => {
    const fetchContent = async () => {
      const { data, error } = await supabase
        .from("about_content")
        .select("heading_title, hero_intro, director_name, director_title, collaborative_approach_text, contact_email, contact_facebook, contact_phone")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) setContent(data as AboutContent);
    };

    fetchContent();
  }, []);

  // "043-491-0925 / 09632086253" -> one number per line.
  const phoneNumbers = (content.contact_phone || "")
    .split("/")
    .map((n) => n.trim())
    .filter(Boolean);

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
        </section>

        {/* ================= COLLABORATIVE APPROACH + COMPONENTS ================= */}
        <section className="px-3 pt-12 sm:px-5 lg:px-[72px] lg:pt-20 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 lg:gap-14 items-start">
          <div className="flex flex-col gap-4 px-2 sm:px-0">
            <h2 className={sectionHeading}>A collaborative approach</h2>
            <p className="m-0 text-base lg:text-[17px] leading-[1.65] text-[#5B6477]">
              {content.collaborative_approach_text}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="m-0 px-2 sm:px-0 font-bold text-lg text-[#1E1B4B]">The four program components</h3>
            <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-4">
              {components.map((c) => (
                <li key={c.title} className="rounded-[28px] bg-white p-6 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
                    <span className="font-bold text-[17px] leading-[1.3] text-[#1E1B4B]">{c.title}</span>
                  </div>
                  <p className="m-0 text-[15px] leading-[1.55] text-[#5B6477]">{c.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ================= QUALITY POLICY OBJECTIVES ================= */}
        <section className="px-3 pt-12 sm:px-5 lg:px-[72px] lg:pt-20 flex flex-col gap-6">
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

        {/* ================= ORGANIZATIONAL CHART ================= */}
        <section className="px-3 pt-12 sm:px-5 lg:px-[72px] lg:pt-20 flex flex-col gap-6">
          <h2 className={`${sectionHeading} px-2 sm:px-0`}>Organizational chart</h2>
          <div className="rounded-[28px] lg:rounded-[32px] bg-white border-2 border-dashed border-[#C9CEE3] px-6 py-12 lg:py-16 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#EEF0FA] text-[#4338CA] flex items-center justify-center">
              <Users className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="m-0 font-bold text-lg text-[#1E1B4B]">Organizational chart coming soon</p>
            <p className="m-0 text-[15px] text-[#5B6477]">The Center's structure will be posted here once approved.</p>
          </div>
        </section>

        {/* ================= GET IN TOUCH ================= */}
        <section className="px-3 pt-12 lg:px-6 lg:pt-20">
          <div className="rounded-[40px] lg:rounded-[3.5rem] bg-[#1E1B4B] text-white px-[22px] py-9 sm:px-10 lg:px-[72px] lg:py-16 flex flex-col gap-7 lg:gap-10">
            <div className="flex flex-col gap-3 max-w-[640px]">
              <h2 className="m-0 font-bricolage font-extrabold text-[32px] sm:text-[40px] lg:text-5xl leading-[1.05] tracking-[-0.02em]">
                Get in touch
              </h2>
              <p className="m-0 text-base lg:text-lg leading-[1.55] text-[#C7C9F2]">
                Reach the Guidance and Testing Center through any of these channels.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div className="rounded-[24px] bg-white/10 p-5 lg:p-6 flex gap-4 min-w-0">
                <span className="w-11 h-11 rounded-[14px] bg-[#34D399] text-[#1E1B4B] flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-semibold text-[#C7C9F2]">Phone</span>
                  {phoneNumbers.map((number) => (
                    <span key={number} className="font-bold text-[15px] text-white break-words">
                      {number}
                    </span>
                  ))}
                </span>
              </div>

              <div className="rounded-[24px] bg-white/10 p-5 lg:p-6 flex gap-4 min-w-0">
                <span className="w-11 h-11 rounded-[14px] bg-[#A5B4FC] text-[#1E1B4B] flex items-center justify-center shrink-0">
                  <Facebook className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-semibold text-[#C7C9F2]">Facebook</span>
                  <span className="font-bold text-[15px] text-white break-words">{content.contact_facebook}</span>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AboutPage;
