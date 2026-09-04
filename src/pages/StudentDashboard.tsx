import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import TopNavBar from '../components/layout/TopNavBar';
import DashboardOverview from '../components/student/DashboardOverview';
import ProgramsActivities from '../components/student/ProgramsActivities';
import IECMaterials from '../components/student/IECMaterials';
import QuizzesSurveys from '../components/student/QuizzesSurveys';
import StudentProfile from '../components/student/StudentProfile';
import { useToast } from '../hooks/use-toast';
import { useTheme } from '../hooks/useTheme';

interface StudentDashboardProps {
  onLogout: () => void;
}

export default function StudentDashboard({ onLogout }: StudentDashboardProps) {
  const location = useLocation();
  const { toast } = useToast();
  const { isDark, toggleTheme } = useTheme();

  const userName = localStorage.getItem("userName") || "Student User";
  const userCampus = localStorage.getItem("userCampus") || "San Jose Campus";

  const navigationItems = [
    { label: 'Dashboard', path: '/student', icon: 'Home' },
    { label: 'Programs', path: '/student/programs', icon: 'Calendar' },
    { label: 'IEC Library', path: '/student/materials', icon: 'BookOpen' },
    { label: 'Survey', path: '/student/survey', icon: 'ClipboardList' },
    { label: 'Profile', path: '/student/profile', icon: 'MessageSquare' },
  ];

  const handleLogoutWithToast = async () => {
    toast({
      title: "LOGOUT SUCCESSFULLY",
      description: "You have been signed out. Come back soon!",
      className: "bg-indigo-600 text-white font-black uppercase tracking-tight border-none rounded-2xl shadow-2xl py-6",
    });

    setTimeout(() => {
      onLogout();
    }, 1500);
  };

  return (
    // Scoping the `dark` class to this wrapper (rather than
    // document.documentElement) keeps it from ever touching the admin
    // dashboard or public site, which have no dark: variants of their own.
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 antialiased selection:bg-indigo-500 selection:text-white flex flex-col font-sans transition-colors">
        <TopNavBar
          role="student"
          userName={userName}
          campus={userCampus}
          onLogout={handleLogoutWithToast}
          navigationItems={navigationItems}
          currentPath={location.pathname}
          isDark={isDark}
          onToggleTheme={toggleTheme}
        />

        <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 mt-[72px] md:mt-[80px] flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden">
          <Routes>
            <Route path="/" element={<DashboardOverview />} />
            <Route path="/programs" element={<ProgramsActivities />} />
            <Route path="/materials" element={<IECMaterials />} />
            <Route path="/survey" element={<QuizzesSurveys />} />
            <Route path="/profile" element={<StudentProfile />} />
            <Route path="*" element={<Navigate to="/student" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
