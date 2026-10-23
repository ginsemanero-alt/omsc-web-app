import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { clearReturnTo } from '../lib/returnTo';

interface ProtectedRouteProps {
  role: 'student' | 'admin';
  children: ReactNode;
}

export default function ProtectedRoute({ role, children }: ProtectedRouteProps) {
  const { user, role: userRole, loading } = useAuth();
  const allowed = !loading && !!user && userRole === role;

  // The student has arrived where they were headed: forget the remembered
  // return target so it can't send a later sign-in somewhere stale.
  useEffect(() => {
    if (allowed) clearReturnTo();
  }, [allowed]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">
          Verifying Session...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== role) {
    return <Navigate to={userRole ? `/${userRole}` : '/login'} replace />;
  }

  return <>{children}</>;
}
