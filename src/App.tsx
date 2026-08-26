import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';

// Auth
import { AuthProvider, useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';

// Layout
import Layout from "./components/layout/Layout";

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';

// Sub-pages (Public)
import ProgramsPage from './pages/ProgramsPage';
import MaterialsPage from './pages/MaterialsPage';
import AboutPage from './pages/AboutPage';

// FIX #1: TakeSurvey dapat hiwalay na import — hindi same as SurveysPage.
// Kung wala ka pang dedicated TakeSurvey page, gawin nating alias muna ng QuizzesSurveys.
// Palitan mo 'to ng sariling TakeSurvey component mo kapag nagawa mo na.
import TakeSurvey from './components/student/QuizzesSurveys';

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
