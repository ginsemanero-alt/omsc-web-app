import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Toaster } from './components/ui/toaster';

// Layout
import Layout from "./components/layout/Layout";

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/StudentDashboard';
import CounselorDashboard from './pages/CounselorDashboard';
import AdminDashboard from './pages/AdminDashboard';

// Sub-pages (Public)
import ProgramsPage from './pages/ProgramsPage';
import MaterialsPage from './pages/MaterialsPage';
import SurveysPage from './pages/SurveysPage';
import AboutPage from './pages/AboutPage';
import VideoGenerator from './components/student/Profiling';

// FIX #1: TakeSurvey dapat hiwalay na import — hindi same as SurveysPage.
// Kung wala ka pang dedicated TakeSurvey page, gawin nating alias muna ng QuizzesSurveys.
// Palitan mo 'to ng sariling TakeSurvey component mo kapag nagawa mo na.
import TakeSurvey from './components/student/QuizzesSurveys';

type UserRole = 'student' | 'counselor' | 'admin' | null;

function AppContent() {
  const navigate = useNavigate();

  // FIX #2: Auth state initialization — consistent na from localStorage
  const [userRole, setUserRole] = useState<UserRole>(
    () => localStorage.getItem('userRole') as UserRole
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem('isAuthenticated')
  );

  const handleLogin = (role: string, name: string) => {
    setUserRole(role as UserRole);
    setIsAuthenticated(true);
    localStorage.setItem('userRole', role);
    localStorage.setItem('isAuthenticated', 'true');
    // FIX #3: name param is accepted but was unused — now stored for dashboard use
    localStorage.setItem('userName', name);
    navigate(`/${role}`);
  };

  const handleLogout = () => {
    // FIX #4: Full cleanup — lahat ng auth keys cleared on logout
    setUserRole(null);
    setIsAuthenticated(false);
    localStorage.removeItem('userRole');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    localStorage.removeItem('user');
    localStorage.removeItem('userCampus');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Routes>

        {/* ─── 1. PUBLIC ROUTES ─── */}
        <Route path="/" element={<Layout><HomePage onNavigate={(page) => navigate(`/${page}`)} /></Layout>} />
        <Route path="/programs" element={<Layout><ProgramsPage /></Layout>} />
        <Route path="/materials" element={<Layout><MaterialsPage /></Layout>} />
        <Route path="/surveys" element={<Layout><SurveysPage /></Layout>} />
        <Route path="/about" element={<Layout><AboutPage /></Layout>} />
        <Route path="/ai-video" element={<Layout><VideoGenerator /></Layout>} />

        {/* FIX #5: /take-survey/:id now points to the correct TakeSurvey component,
            not SurveysPage. The :id param will be accessible via useParams() inside it. */}
        <Route path="/take-survey/:id" element={<Layout><TakeSurvey /></Layout>} />

        {/* ─── 2. LOGIN ─── */}
        <Route
          path="/login"
          element={
            isAuthenticated
              ? <Navigate to={`/${userRole}`} replace />
              : <LoginPage onLogin={handleLogin} onBackToHome={() => navigate('/')} />
          }
        />

        {/* ─── 3. PROTECTED ROUTES ─── */}
        {/* Student */}
        <Route
          path="/student/*"
          element={
            isAuthenticated && userRole === 'student'
              ? <StudentDashboard onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />

        {/* Counselor */}
        <Route
          path="/counselor/*"
          element={
            isAuthenticated && userRole === 'counselor'
              ? <CounselorDashboard onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />

        {/* Admin */}
        <Route
          path="/admin/*"
          element={
            isAuthenticated && userRole === 'admin'
              ? <AdminDashboard onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}