import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';
import { Loader2 } from 'lucide-react';

// Auth
import { AuthProvider, useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import ConsentGate from './components/ConsentGate';

// Layout
import Layout from "./components/layout/Layout";
import PrivacyNoticeBar from './components/layout/PrivacyNoticeBar';

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
import PrivacyPage from './pages/PrivacyPage';
import PublicProgramPage from './pages/PublicProgramPage';
import { readRememberedReturnTo, safeReturnPath } from './lib/returnTo';

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, loading, signOut } = useAuth();

  // Where /login sends someone who is already signed in: a student goes back
  // to the exact material or program they came from (validated in-app path),
  // everyone else to their own area.
  const signedInDestination = (signedInRole: string) => {
    if (signedInRole !== 'student') return `/${signedInRole}`;
    return (
      safeReturnPath(new URLSearchParams(location.search).get('redirect')) ?? readRememberedReturnTo() ?? '/student'
    );
  };

  const handleLogin = (role: string, name: string) => {
    // Auth state itself now comes from the Supabase session (via useAuth).
    // localStorage keeps only display values.
    localStorage.setItem('userName', name);

    // After registering, the emailed code signs the student in before this
    // runs, and /login has already sent them on to where they were headed
    // (see signedInDestination). Only navigate if they are still on /login.
    if (window.location.pathname !== '/login') return;

    // Back to where the student was headed: the exact material or program
    // they came from (/login?redirect=/student/materials?material=12), kept
    // in the URL and in sessionStorage so it survives registration, email
    // verification and a reload. Only validated in-app student paths are
    // used (see src/lib/returnTo.ts), so the parameter can't send anyone to
    // another site. Admins always go to the admin area.
    const requested = safeReturnPath(new URLSearchParams(window.location.search).get('redirect'));
    const target = requested ?? readRememberedReturnTo();
    // The remembered target is cleared once the student has arrived (see
    // ProtectedRoute), not here: right after sign-in the protected route can
    // still see "no user yet" and bounce through /login, which then reads it.
    if (role === 'student' && target) {
      navigate(target);
      return;
    }

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
          <Route path="/programs/:id" element={<Layout><PublicProgramPage /></Layout>} />
          <Route path="/materials" element={<Layout><MaterialsPage /></Layout>} />
          <Route path="/about" element={<Layout><AboutPage /></Layout>} />
          <Route path="/privacy" element={<Layout><PrivacyPage /></Layout>} />

          {/* FIX #5: /take-survey/:id now points to the correct TakeSurvey component,
              not SurveysPage. The :id param will be accessible via useParams() inside it. */}
          <Route path="/take-survey/:id" element={<Layout><TakeSurvey /></Layout>} />

          {/* ─── 2. LOGIN ─── */}
          <Route
            path="/login"
            element={
              !loading && user && role
                ? <Navigate to={signedInDestination(role)} replace />
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
                <ConsentGate onSignOut={handleLogout}>
                  <StudentDashboard onLogout={handleLogout} />
                </ConsentGate>
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
      <PrivacyNoticeBar />
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
