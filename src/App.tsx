import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';
import { Loader2 } from 'lucide-react';

// Auth
import { AuthProvider, useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';

// Layout
import Layout from "./components/layout/Layout";

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// Lazy-loaded: these pull in the heavy stuff (recharts, jspdf,
// jspdf-autotable, file-saver, the full admin/student UI) that only ever
// matters once someone is actually signed in — keeping them out of the
// initial bundle is most of what the public homepage's JS payload was.
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// FIX #1: TakeSurvey dapat hiwalay na import — hindi same as SurveysPage.
// Kung wala ka pang dedicated TakeSurvey page, gawin nating alias muna ng QuizzesSurveys.
// Palitan mo 'to ng sariling TakeSurvey component mo kapag nagawa mo na.
const TakeSurvey = lazy(() => import('./components/student/QuizzesSurveys'));

// Sub-pages (Public)
import ProgramsPage from './pages/ProgramsPage';
import MaterialsPage from './pages/MaterialsPage';
import AboutPage from './pages/AboutPage';

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const { user, role, loading, signOut } = useAuth();

  const handleLogin = (role: string, name: string) => {
    // Auth state itself now comes from the Supabase session (via useAuth).
    // localStorage keeps only display values.
    localStorage.setItem('userName', name);
    navigate(`/${role}`);
  };

  const handleLogout = async () => {
    await signOut();
    localStorage.removeItem('userName');
    localStorage.removeItem('userCampus');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>

          {/* ─── 1. PUBLIC ROUTES ─── */}
          <Route path="/" element={<Layout><HomePage onNavigate={(page) => navigate(`/${page}`)} /></Layout>} />
          <Route path="/programs" element={<Layout><ProgramsPage /></Layout>} />
          <Route path="/materials" element={<Layout><MaterialsPage /></Layout>} />
          <Route path="/about" element={<Layout><AboutPage /></Layout>} />

          {/* FIX #5: /take-survey/:id now points to the correct TakeSurvey component,
              not SurveysPage. The :id param will be accessible via useParams() inside it. */}
          <Route path="/take-survey/:id" element={<Layout><TakeSurvey /></Layout>} />

          {/* ─── 2. LOGIN ─── */}
          <Route
            path="/login"
            element={
              !loading && user && role
                ? <Navigate to={`/${role}`} replace />
                : <LoginPage onLogin={handleLogin} onBackToHome={() => navigate('/')} />
            }
          />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* ─── 3. PROTECTED ROUTES ─── */}
          {/* Student */}
          <Route
            path="/student/*"
            element={
              <ProtectedRoute role="student">
                <StudentDashboard onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          {/* Admin */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Suspense>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}
