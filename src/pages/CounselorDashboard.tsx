import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopNavBar from '../components/layout/TopNavBar';
import CommandPalette from '../components/CommandPalette';
import ProgramManagement from '../components/counselor/ProgramManager';
import MaterialLibrary from '../components/counselor/MaterialLibrary';
import QuizBuilder from '../components/counselor/SurveyBuilder';
import AnalyticsDashboard from '../components/counselor/AnalyticsDashboard';
import ProgramRegistrations from '../components/counselor/ProgramRegistrations';
import InquiryManager from '../components/counselor/InquiryManager'; 
import { useToast } from '../hooks/use-toast';
import { createSystemLog } from '../lib/logger'; // 🌟 Kinuha ang global logger helper

interface CounselorDashboardProps {
  onLogout: () => void;
}

export default function CounselorDashboard({ onLogout }: CounselorDashboardProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const userName = localStorage.getItem("userName") || "Counselor User";
  const userCampus = localStorage.getItem("userCampus") || "Main Campus";

  const navigationItems = [
    { label: 'Programs', path: '/counselor', icon: 'Calendar' },
    { label: 'Registrants', path: '/counselor/registrations', icon: 'Users' },
    { label: 'Materials', path: '/counselor/materials', icon: 'FolderOpen' },
    { label: 'Surveys', path: '/counselor/quizzes', icon: 'FileQuestion' },
    { label: 'Analytics', path: '/counselor/analytics', icon: 'BarChart3' },
    { label: 'Announcement', path: '/counselor/inquiries', icon: 'MessageCircle' },
  ];

  // 🌟 OMNI-INTERCEPTOR ROUTE ENGINE: Patatakbuhin ang security log audit bawat palit ng dashboard tabs
  useEffect(() => {
    const currentPath = location.pathname;

    if (currentPath === '/counselor') {
      createSystemLog("Program Config Folder Viewed", "Counselor opened operational dashboard settings and events catalogue table.");
    } else if (currentPath === '/counselor/registrations') {
      createSystemLog("Registrants Ledger Checked", "Counselor accessed student master registration validation log sheet.");
    } else if (currentPath === '/counselor/materials') {
      createSystemLog("File Storage Bucket Checked", "Counselor opened global handouts manager and template layout assets list.");
    } else if (currentPath === '/counselor/quizzes') {
      createSystemLog("Quiz Builder Form Opened", "Counselor accessed evaluation configuration rules and survey forms creator.");
    } else if (currentPath === '/counselor/analytics') {
      createSystemLog("Institutional Metrics Folder Viewed", "Counselor opened the active database Recharts visual intelligence analytical deck.");
    } else if (currentPath === '/counselor/inquiries') {
      createSystemLog("Counseling Inquiry Panel Checked", "Counselor accessed incoming helpdesk student guidance inquiry records.");
    }
  }, [location.pathname]);

  const handleCommandSelect = (path: string) => {
    navigate(path);
    setCommandOpen(false);
  };

  const handleLogoutWithToast = async () => {
    // 🌟 SECURE LOGOUT AUDIT TRAIL
    await createSystemLog("User Session Terminated", "Counselor securely signs off from admin system command rows.");

    toast({
      title: "LOGOUT SUCCESSFULLY",
      description: "Secure counselor log-off transaction completed.",
      className: "bg-slate-900 text-white font-black uppercase tracking-tight italic border-none rounded-3xl shadow-2xl py-6",
    });

    setTimeout(() => {
      onLogout();
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased selection:bg-indigo-600 selection:text-white font-sans">
      <TopNavBar
        role="counselor"
        userName={userName}
        campus={userCampus}
        onLogout={handleLogoutWithToast}
        onCommandOpen={() => setCommandOpen(true)}
        navigationItems={navigationItems}
        currentPath={location.pathname}
      />

      <main className="max-w-[1440px] mx-auto px-8 py-10 mt-[80px] animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Routes>
          <Route path="/" element={<ProgramManagement />} />
          <Route path="/registrations" element={<ProgramRegistrations />} /> 
          <Route path="/materials" element={<MaterialLibrary />} />
          <Route path="/quizzes" element={<QuizBuilder />} />
          <Route path="/analytics" element={<AnalyticsDashboard />} />
          <Route path="/inquiries" element={<InquiryManager />} /> 
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