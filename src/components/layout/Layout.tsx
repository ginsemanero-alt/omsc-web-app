import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { Button } from "../ui/button"; // Ayusin ang path base sa folder mo
import Footer from "../../components/ui/Footer"; 

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // HomePage renders its own (blue) fixed navbar. Rendering this one too would
  // stack two navbars and reintroduce the top-offset mismatch, so skip it here.
  const isHomePage = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      {/* --- NAVBAR --- */}
      {!isHomePage && (
      <header className="fixed top-0 left-0 right-0 h-[72px] bg-white border-b z-50 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <GraduationCap className="w-8 h-8 text-primary" />
            <h1 className="font-bold text-xl uppercase tracking-tighter text-slate-900">
              OMSU Guidance
            </h1>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 font-bold text-xs uppercase text-slate-600">
            <Link to="/" className="hover:text-primary transition-colors">Home</Link>
            <Link to="/programs" className="hover:text-primary transition-colors">Programs</Link>
            <Link to="/materials" className="hover:text-primary transition-colors">Materials</Link>
            <Link to="/about" className="hover:text-primary transition-colors">About</Link>
          </nav>

          <Button 
            onClick={() => navigate('/login')}
            className="bg-primary text-white font-black uppercase text-[10px] tracking-widest px-6 h-10 rounded-xl shadow-md shadow-blue-100 hover:scale-105 transition-all"
          >
            Login
          </Button>
        </div>
      </header>
      )}

      {/* --- DYNAMIC CONTENT --- */}
      <main className={`${isHomePage ? '' : 'pt-[72px]'} flex-grow`}>
        {children}
      </main>

      {/* --- FOOTER --- */}
      <Footer />
    </div>
  );
};

export default Layout;