import { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import TopNavBar from '../components/layout/TopNavBar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import ProgramManagement from '../components/admin/ProgramManager';
import MaterialLibrary from '../components/admin/MaterialLibrary';
import SurveyBuilder from '../components/admin/SurveyBuilder';
import AnalyticsDashboard from '../components/admin/AnalyticsDashboard';
import ReportsCenter from '../components/admin/ReportsCenter';
import UserManagement from '../components/admin/UserManagement';
import { useToast } from '../hooks/use-toast';

interface AdminDashboardProps {
  onLogout: () => void;
}

function ContentManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase mb-1">
          Content <span className="text-indigo-600">Management</span>
        </h1>
        <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">
          Guidance programs, IEC materials, and knowledge surveys
        </p>
      </div>

      <Tabs defaultValue="programs">
        <TabsList className="h-auto p-1.5 bg-white shadow-sm rounded-2xl">
          <TabsTrigger value="programs" className="rounded-xl font-black uppercase text-[10px] tracking-wider px-5 py-2.5">
            Programs
          </TabsTrigger>
          <TabsTrigger value="materials" className="rounded-xl font-black uppercase text-[10px] tracking-wider px-5 py-2.5">
            Materials
          </TabsTrigger>
          <TabsTrigger value="surveys" className="rounded-xl font-black uppercase text-[10px] tracking-wider px-5 py-2.5">
            Surveys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="mt-6">
          <ProgramManagement />
        </TabsContent>
        <TabsContent value="materials" className="mt-6">
          <MaterialLibrary />
        </TabsContent>
        <TabsContent value="surveys" className="mt-6">
          <SurveyBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const location = useLocation();
  const { toast } = useToast();

  const navigationItems = [
    { label: 'Content', path: '/admin', icon: 'FolderOpen' },
    { label: 'Analytics', path: '/admin/analytics', icon: 'BarChart3' },
    { label: 'Reports', path: '/admin/reports', icon: 'FileStack' },
    { label: 'Users', path: '/admin/users', icon: 'Users' },
  ];

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
        navigationItems={navigationItems}
        currentPath={location.pathname}
      />

      <main className="max-w-[1440px] mx-auto px-8 py-10 mt-[80px] animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Routes>
          <Route path="/" element={<ContentManagement />} />
          <Route path="/analytics" element={<AnalyticsDashboard />} />
          <Route path="/reports" element={<ReportsCenter />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
