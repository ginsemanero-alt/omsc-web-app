import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from "../ui/button"; // Ayusin ang path base sa folder mo
import Footer from "../../components/ui/Footer";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // The desktop nav links are hidden below md with no mobile fallback —
  // a visitor who taps into Programs/Materials/About from the homepage's
  // own (separate) mobile menu had no visible way back besides the
  // logo, which looks like a static brand mark, not a button. This
  // mirrors HomePage.tsx's own working hamburger menu.
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // HomePage renders its own (blue) fixed navbar. Rendering this one too would
  // stack two navbars and reintroduce the top-offset mismatch, so skip it here.
  const isHomePage = location.pathname === '/';

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/programs', label: 'Programs' },
    { to: '/materials', label: 'Materials' },
    { to: '/about', label: 'About' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      {/* --- NAVBAR --- */}
      {!isHomePage && (
      <header className="fixed top-0 left-0 right-0 h-[72px] bg-white border-b z-50 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <img
              src="https://guidance.omsc.edu.ph/assets/images/logo.png"
              alt="OMSU Guidance and Testing Center"
              className="w-8 h-8 rounded-full object-cover"
            />
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

          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate('/login')}
              className="bg-primary text-white font-black uppercase text-[10px] tracking-widest px-6 h-10 rounded-xl shadow-md shadow-blue-100 hover:scale-105 transition-all"
            >
              Login
            </Button>
            <button
              type="button"
              className="md:hidden text-slate-700 p-2 -mr-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden absolute top-[72px] left-0 right-0 bg-white border-t border-slate-100 p-6 flex flex-col gap-1 shadow-xl animate-in slide-in-from-top duration-200">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setIsMenuOpen(false)}
                className={`py-3 font-black uppercase text-sm tracking-wide border-b border-slate-50 last:border-0 transition-colors ${
                  location.pathname === link.to ? 'text-primary' : 'text-slate-700 hover:text-primary'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
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