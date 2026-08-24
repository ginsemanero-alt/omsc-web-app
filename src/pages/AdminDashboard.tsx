import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopNavBar from '../components/layout/TopNavBar';
import CommandPalette from '../components/CommandPalette';
import SystemConfiguration from '../components/admin/SystemConfiguration';
import UserManagement from '../components/admin/UserManagement';
import InstitutionalAnalytics from '../components/admin/InstitutionalAnalytics';
import SecurityLogs from '../components/admin/SecurityLogs';
import { useToast } from '../hooks/use-toast';

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const navigationItems = [
    { label: 'Configuration', path: '/admin', icon: 'Settings' },
    { label: 'Users', path: '/admin/users', icon: 'Users' },
    { label: 'Analytics', path: '/admin/analytics', icon: 'TrendingUp' },
    { label: 'Security', path: '/admin/security', icon: 'Shield' },
  ];

  const handleCommandSelect = (path: string) => {
    navigate(path);
    setCommandOpen(false);
  };

  const handleLogoutWithToast = () => {
    toast({
      title: "GLOBAL ADMIN LOGOUT",
      description: "Master root authentication token cleared.",
      className: "bg-emerald-600 text-white font-black uppercase tracking-tight border-none rounded-3xl shadow-2xl py-6",
    });
    
    setTimeout(() => {
      onLogout();
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 antialiased selection:bg-emerald-600 selection:text-white">
      <TopNavBar
        role="admin"
        userName="Admin Configuration Root"
        campus="System Wide"
        onLogout={handleLogoutWithToast}
        onCommandOpen={() => setCommandOpen(true)}
        navigationItems={navigationItems}
        currentPath={location.pathname}
      />

      {/* Global Config Frame */}
      <main className="max-w-[1440px] mx-auto px-8 py-10 mt-[80px] animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Routes>
          <Route path="/" element={<SystemConfiguration />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/analytics" element={<InstitutionalAnalytics />} />
          <Route path="/security" element={<SecurityLogs />} />
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