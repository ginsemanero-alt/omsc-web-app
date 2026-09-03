import { GraduationCap, LogOut, ChevronDown, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react'; // Idinagdag ang useEffect
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase'; // Siguraduhin na tama ang path ng supabase client mo
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';

interface NavigationItem {
  label: string;
  path: string;
  icon?: any;
}

interface TopNavBarProps {
  role: 'student' | 'admin';
  userName: string; // Ito yung default/fallback name
  campus: string;
  onLogout: () => void;
  navigationItems: NavigationItem[];
  currentPath: string;
}

export default function TopNavBar({
  userName: initialUserName, // Ginawang initial lang
  campus,
  onLogout,
  navigationItems,
  currentPath,
}: TopNavBarProps) {
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [displayName, setDisplayName] = useState(initialUserName); // State para sa dynamic name

  // LOGIC PARA SA PAGKUHA NG PANGALAN SA POSTGRESQL
  useEffect(() => {
    async function fetchActualName() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Admin accounts have no `profiles` row (demographics are
        // student-only) — maybeSingle() returns null there instead of a
        // 406 error, and displayName just keeps its initialUserName prop.
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profile?.full_name) {
          setDisplayName(profile.full_name);
        }
      }
    }
    fetchActualName();
  }, []);

  // Compute initials base sa dynamic name
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-[72px] bg-background/90 backdrop-blur-md border-b border-border z-50">
        <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
          
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-foreground" 
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </Button>

            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                 <GraduationCap className="w-6 h-6 text-primary-foreground" strokeWidth={1.5} />
               </div>
               <div className="hidden sm:block">
                 <h1 className="text-sm font-bold text-foreground leading-none">OMSU Guidance</h1>
                 <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">{campus}</p>
               </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            {navigationItems.map((item: NavigationItem) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-md text-sm transition-colors ${
                  currentPath === item.path
                    ? 'bg-primary/10 text-primary font-medium border-b-2 border-primary rounded-none'
                    : 'text-muted-foreground hover:bg-neutral-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-slate-100 rounded-xl transition-all">
                  <Avatar className="w-8 h-8 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary text-white text-[10px] font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {/* DITO LALABAS YUNG TOTOONG PANGALAN SA DESKTOP */}
                  <span className="hidden lg:block text-xs font-bold text-slate-700 max-w-[100px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 shadow-xl border-slate-100">
                <DropdownMenuLabel className="font-black text-indigo-600 px-3 py-2 uppercase tracking-tight">
                  {displayName}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-red-600 focus:bg-red-50 focus:text-red-700 rounded-xl cursor-pointer p-3">
                  <LogOut className="w-4 h-4 mr-2" /> <span className="font-bold uppercase text-[11px] tracking-widest">Sign Out Account</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* MOBILE SIDEBAR (Isinama din ang name dito) */}
      <div className={`fixed top-0 left-0 h-full w-[280px] bg-white z-[70] shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
               <Avatar className="w-10 h-10">
                 <AvatarFallback className="bg-primary text-white font-bold">{initials}</AvatarFallback>
               </Avatar>
               <div className="flex flex-col">
                 <span className="font-bold text-sm truncate max-w-[150px]">{displayName}</span>
                 <span className="text-[10px] text-slate-400 font-bold uppercase">{campus}</span>
               </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
              <X className="w-6 h-6" />
            </Button>
          </div>

          <nav className="flex flex-col gap-2">
            {navigationItems.map((item: NavigationItem) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-base transition-all ${
                  currentPath === item.path
                    ? 'bg-primary text-white shadow-lg font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-red-500 hover:bg-red-50 font-bold rounded-xl"
              onClick={onLogout}
            >
              <LogOut className="w-5 h-5 mr-3" />
              SIGN OUT
            </Button>
          </div>
        </div>
      </div>
      
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[60] md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </>
  );
}