import { GraduationCap } from 'lucide-react';
import { Button } from "../../../src/components/ui/button";
import { Link } from 'react-router-dom';

export default function PublicNavbar() {
  return (
    <header className="fixed top-0 left-0 right-0 h-[72px] bg-white/80 backdrop-blur-md border-b z-50">
      <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-8 h-8 text-primary" />
          <h1 className="font-bold text-xl">OMSU Guidance</h1>
        </div>
        
        <nav className="hidden md:flex items-center gap-6 font-medium text-slate-600">
          <Link to="/" className="hover:text-primary">Home</Link>
          <Link to="/programs" className="hover:text-primary">Programs</Link>
          <Link to="/materials" className="hover:text-primary">Materials</Link>
          <Link to="/about" className="hover:text-primary">About</Link>
        </nav>

        <Button onClick={() => window.location.href = '/login'}>
          Login
        </Button>
      </div>
    </header>
  );
}