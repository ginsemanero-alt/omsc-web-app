import React from "react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { 
  ShieldCheck, Users, Target, BookOpen, Heart, 
  Layers, Mail, Facebook, Phone, Award, ClipboardCheck 
} from "lucide-react";

const AboutPage: React.FC = () => {
  const components = [
    {
      title: "Group Guidance",
      desc: "Structured group and classroom presentations aimed at collective proactive student growth.",
      color: "bg-blue-50 text-blue-600"
    },
    {
      title: "Individual Student Planning",
      desc: "Student appraisal, educational and career planning, and assistance with course selection and placement.",
      color: "bg-indigo-50 text-indigo-600"
    },
    {
      title: "Responsive Services",
      desc: "Individual and small-group counseling, peer support, crisis response, and referral to other professionals.",
      color: "bg-rose-50 text-rose-600"
    },
    {
      title: "System Support",
      desc: "Program management, staff development, community outreach, and research and evaluation.",
      color: "bg-amber-50 text-amber-600"
    }
  ];

  const objectives = [
    "To maintain the highest quality of assistance and support to the academic community by providing relevant and timely programs, services, and information in the area of students' personal, social, educational and career development in all educational levels of the colleges.",
    "To provide high-quality placement and diagnostic services to students of their aptitudes and interests toward better degree selection and career decision-making.",
    "To develop relevant and responsive student-oriented programs aimed at the mental and social health of students to promote healthy and harmonious relationship among students, teachers and administrative staff."
  ];

  return (
    <div className="w-full bg-slate-50 min-h-screen pb-16 md:pb-24 font-sans">
      
      {/* --- HERO SECTION --- */}
      <section className="relative overflow-hidden pt-12 pb-12 md:pt-24 md:pb-20 bg-white border-b border-slate-100">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            <div className="space-y-6 lg:col-span-7 text-center lg:text-left">
              <Badge className="bg-indigo-100 text-indigo-600 border-none font-black px-4 py-1 rounded-full uppercase text-[9px] md:text-[10px] tracking-widest inline-block">
                About the Center
              </Badge>
              <h1 className="text-3xl md:text-6xl font-black uppercase text-slate-900 tracking-tighter leading-tight">
                The Guidance and <br />
                <span className="text-indigo-600">Testing Center</span>
              </h1>
              
              {/* Director Profile Display */}
              <div className="bg-slate-50 p-4 md:p-6 rounded-2xl border border-slate-100/80 flex items-center gap-4 max-w-md mx-auto lg:mx-0">
                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center font-black text-white shrink-0 shadow-md">
                  AP
                </div>
                <div className="text-left">
                  <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm md:text-base leading-none">Dr. Angelina C. Paquibot</h3>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mt-1.5">Guidance and Testing Center Director</p>
                </div>
              </div>

              <p className="text-xs md:text-sm font-medium text-slate-500 leading-relaxed">
                The Guidance and Testing Center is an essential and integral part of the overall educational process. School counselors, working within the framework of the program, make major contributions to the primary educational mission and vision of the institution by providing students with Guidance and Counseling activities and services that facilitate and enhance their academic, career, and personal and social development.
              </p>
            </div>
            
            {/* Hero Image Container */}
            <div className="relative group lg:col-span-5 px-4 md:px-0">
              <div className="absolute inset-0 bg-indigo-600 rounded-[2rem] md:rounded-[2.5rem] rotate-2 scale-105 opacity-10" />
              <img
                src="https://i.ibb.co/SDCTBBY7/download-4.jpg"
                alt="OMSU Institutional Core Banner"
                className="relative w-full h-[260px] md:h-[380px] object-cover rounded-[2rem] md:rounded-[2.5rem] shadow-xl z-10"
              />
            </div>

          </div>
        </div>
      </section>

      {/* --- EXTENDED MISSION STATEMENT & SERVICE COMPONENTS --- */}
      <section className="py-16 max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          <div className="lg:col-span-1 space-y-4 sticky top-24 bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">A Collaborative Approach</h3>
            <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
              While school Counselors are available to respond to the unique needs of each student, the Guidance and Counseling approach is collaborative among teachers, parents and administrators. As a developmental program, it addresses the needs of all students in OMSU by facilitating their growth as well as helping to create positive and safe learning environments.
            </p>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Core Service Components</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {components.map((c, i) => (
                <Card key={i} className="p-5 bg-white border-none shadow-sm rounded-2xl md:rounded-[2rem] flex flex-col justify-between border border-slate-100/40">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h4 className="font-black uppercase text-xs md:text-sm tracking-tight text-slate-900 leading-none">{c.title}</h4>
                    </div>
                    <p className="text-[11px] md:text-xs font-medium text-slate-400 leading-relaxed">{c.desc}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* --- QUALITY POLICY OBJECTIVES --- */}
      <section className="py-16 bg-white rounded-[2rem] md:rounded-[4rem] mx-2 md:mx-4 border border-slate-100 shadow-inner">
        <div className="max-w-[1000px] mx-auto px-4 md:px-6">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-2xl md:text-4xl font-black uppercase text-slate-900 tracking-tighter">Quality Policy Objectives</h2>
            <div className="w-12 h-1.5 bg-indigo-600 mx-auto rounded-full" />
          </div>

          <div className="space-y-4">
            {objectives.map((obj, index) => (
              <div key={index} className="flex gap-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-100/60 items-start">
                <div className="w-6 h-6 rounded-md bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  0{index + 1}
                </div>
                <p className="text-xs md:text-sm font-medium text-slate-600 leading-relaxed">
                  {obj}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- ORGANIZATIONAL CHART --- */}
      <section className="py-16 max-w-[900px] mx-auto px-4 md:px-6 text-center">
        <div className="mb-8 space-y-2">
          <h2 className="text-2xl md:text-4xl font-black uppercase text-slate-900 tracking-tighter">Organizational Chart</h2>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Guidance and Testing Center Structure</p>
        </div>
        <Card className="p-4 md:p-6 bg-white border-dashed border-2 border-slate-200 rounded-[2rem] shadow-sm group overflow-hidden">
          <div className="relative overflow-hidden rounded-xl bg-slate-50 min-h-[160px] flex items-center justify-center">
            <Users className="w-12 h-12 text-slate-200 absolute group-hover:scale-125 transition-transform duration-700" />
            <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest z-10">Organizational chart coming soon</p>
          </div>
        </Card>
      </section>

      {/* --- CONTACT --- */}
      <section className="mt-8 max-w-[900px] mx-auto px-4 md:px-6">
        <div className="bg-slate-950 rounded-[2rem] md:rounded-[3rem] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/20 rounded-full -mr-16 -mt-16 blur-2xl" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-2 flex-1 text-center md:text-left">
              <h2 className="text-2xl md:text-4xl font-black uppercase text-white tracking-tighter leading-none">Get in Touch</h2>
              <p className="text-slate-400 font-medium text-xs md:text-sm">Reach the Guidance and Testing Center through any of the channels below.</p>
            </div>

            {/* Contact details */}
            <div className="space-y-3.5 shrink-0 min-w-[280px] bg-white/5 p-5 rounded-2xl border border-white/10">
              <div className="flex items-center gap-3 text-xs font-mono font-bold text-slate-200 lowercase">
                <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>guidanceofficeomsc@gmail.com</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold text-slate-200 uppercase tracking-tight">
                <Facebook className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-[11px]">OMSU Guidance and Testing Center</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono font-bold text-slate-200">
                <Phone className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-[10px]">043-491-0925 / 09632086253</span>
              </div>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
};

export default AboutPage;