import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopNavBar from '../components/layout/TopNavBar';
import CommandPalette from '../components/CommandPalette';
import DashboardOverview from '../components/student/DashboardOverview';
import ProgramsActivities from '../components/student/ProgramsActivities';
import IECMaterials from '../components/student/IECMaterials';
import QuizzesSurveys from '../components/student/QuizzesSurveys';
import ParticipationHistory from '../components/student/ParticipationHistory';
import Inquiries from '../components/student/Inquiries';
import VideoGenerator from '../components/student/Profiling';
import { useToast } from '../hooks/use-toast';
import { createSystemLog } from '../lib/logger'; // 🌟 Kinuha ang global logger helper

interface StudentDashboardProps {
  onLogout: () => void;
}

export default function StudentDashboard({ onLogout }: StudentDashboardProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const userName = localStorage.getItem("userName") || "Student User";
  const userCampus = localStorage.getItem("userCampus") || "San Jose Campus";

  const navigationItems = [
    { label: 'Dashboard', path: '/student', icon: 'Home' },
    { label: 'Programs', path: '/student/programs', icon: 'Calendar' },
    { label: 'IEC Library', path: '/student/materials', icon: 'BookOpen' },
    { label: 'Surveys', path: '/student/quizzes', icon: 'ClipboardList' },
    { label: 'Announcements', path: '/student/history', icon: 'History' },
    { label: 'Profile', path: '/student/inquiries', icon: 'MessageSquare' },
    { label: 'History', path: '/student/ai-video', icon: 'History' },
  ];

  // 🌟 OMNI-INTERCEPTOR ROUTE ENGINE: Nakikinig sa bawat paglipat ng tab or search execution
  useEffect(() => {
    const currentPath = location.pathname;
    
    if (currentPath === '/student') {
      createSystemLog("Student Dashboard Home Console Viewed", "Student accessed the central welcome and announcements board panel.");
    } else if (currentPath === '/student/programs') {
      createSystemLog("Program Catalog Menu Viewed", "Student opened the active seminar deployment registry folder.");
    } else if (currentPath === '/student/materials') {
      createSystemLog("Information Service Catalog Viewed", "Student accessed downloadable guidance modules and digital resources.");
    } else if (currentPath === '/student/ai-video') {
      createSystemLog("Student Profiling Form Viewed", "Student opened the Individual Inventory Profiling form workspace panel.");
    } else if (currentPath === '/student/quizzes') {
      createSystemLog("Surveys List Folder Viewed", "Student checked available active psychological test sheets.");
    } else if (currentPath === '/student/history') {
      createSystemLog("History Logs Deck Viewed", "Student checked personal participation records and certificate links.");
    } else if (currentPath === '/student/inquiries') {
      createSystemLog("Student Inquiry Helpdesk Viewed", "Student opened the helpdesk message chat room context.");
    }
  }, [location.pathname]);

  const handleCommandSelect = (path: string) => {
    navigate(path);
    setCommandOpen(false);
  };

  const handleLogoutWithToast = async () => {
    // 🌟 LOGOUT AUDIT TRACK: Itatala bago mawala ang local state storage cache
    await createSystemLog("User Session Terminated", "Student securely signed out of the institutional portal workspace.");

    toast({
      title: "LOGOUT SUCCESSFULLY",
      description: "You have been signed out. Come back soon!",
      className: "bg-indigo-600 text-white font-black uppercase tracking-tight italic border-none rounded-2xl shadow-2xl py-6",
    });

    setTimeout(() => {
      onLogout();
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased selection:bg-indigo-500 selection:text-white flex flex-col font-sans">
      <TopNavBar
        role="student"
        userName={userName}
        campus={userCampus}
        onLogout={handleLogoutWithToast}
        onCommandOpen={() => setCommandOpen(true)}
        navigationItems={navigationItems}
        currentPath={location.pathname}
      />

      <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 mt-[72px] md:mt-[80px] flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden">
        <Routes>
          <Route path="/" element={<DashboardOverview />} />
          <Route path="/programs" element={<ProgramsActivities />} />
          <Route path="/materials" element={<IECMaterials />} />
          <Route path="/ai-video" element={<VideoGenerator />} />
          <Route path="/quizzes" element={<QuizzesSurveys />} />
          <Route path="/history" element={<ParticipationHistory />} />
          <Route path="/inquiries" element={<Inquiries />} />
        </Routes>
      </main>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        items={navigationItems}
        onSelect={handleCommandSelect}
      />
    </div>
  );
}