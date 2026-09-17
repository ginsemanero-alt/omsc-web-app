import {
  GraduationCap,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Home,
  Calendar,
  BookOpen,
  ClipboardList,
  MessageSquare,
  FolderOpen,
  BarChart3,
  FileStack,
  Users,
  History,
  Sun,
  Moon,
  AlertCircle,
  Archive,
  Info,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react'; // Idinagdag ang useEffect
import { Link, useNavigate } from 'react-router-dom';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

interface NavigationItem {
  label: string;
  path: string;
  icon?: string;
}

interface NotificationRow {
  id: number;
  type: 'program' | 'survey';
  title: string;
  message: string | null;
  action_path: string | null;
  read_at: string | null;
  created_at: string;
}

// navigationItems (from AdminDashboard/StudentDashboard) carries icon names
// as plain strings, not component references — this maps each one to its
// actual lucide-react component for rendering.
const NAV_ICONS: Record<string, LucideIcon> = {
  Home,
  Calendar,
  BookOpen,
  ClipboardList,
  MessageSquare,
  FolderOpen,
  BarChart3,
  FileStack,
  Users,
  History,
  Archive,
  Info,
};

interface TopNavBarProps {
  role: 'student' | 'admin';
  userName: string; // Ito yung default/fallback name
  campus: string;
  onLogout: () => void;
  navigationItems: NavigationItem[];
  currentPath: string;
  // Only StudentDashboard passes these — the toggle button only renders
  // when onToggleTheme is provided, so the admin dashboard (which has no
  // dark: styling of its own) is unaffected.
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export default function TopNavBar({
  role,
  userName: initialUserName, // Ginawang initial lang
  campus,
  onLogout,
  navigationItems,
  currentPath,
  isDark,
  onToggleTheme,
}: TopNavBarProps) {
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [displayName, setDisplayName] = useState(initialUserName); // State para sa dynamic name
  // Both sign-out entry points (desktop dropdown, mobile sidebar) used to
  // call onLogout the instant they were clicked — one accidental tap and
  // the session was gone with no way back. Routed through this instead.
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  // IN-APP NOTIFICATIONS — student only. Publishing a Program or
  // activating a Survey inserts one row per active student (see
  // /api/notify-students); this is what surfaces them: a badge count
  // here, and a one-time-per-login banner below.
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [showBanner, setShowBanner] = useState(false);

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    // notifications.user_id is users.id (bigint), not the auth uuid —
    // same bridge useAuth.tsx's own role lookup uses.
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();
    if (!userRow) return;

    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, message, action_path, read_at, created_at')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(30);

    const rows = (data || []) as NotificationRow[];
    setNotifications(rows);

    // Once per browser session — a student re-visiting pages all
    // session shouldn't see the banner pop up again each time.
    const hasUnread = rows.some((n) => !n.read_at);
    if (hasUnread && !sessionStorage.getItem('notif_banner_shown')) {
      sessionStorage.setItem('notif_banner_shown', '1');
      setShowBanner(true);
    }
  };

  useEffect(() => {
    if (role !== 'student') return;
    fetchNotifications();
  }, [role]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAsRead = async (ids: number[]) => {
    if (ids.length === 0) return;
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at || new Date().toISOString() } : n))
    );
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  };

  const handleNotificationClick = (notification: NotificationRow) => {
    if (!notification.read_at) markAsRead([notification.id]);
    if (notification.action_path) navigate(notification.action_path);
  };

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
              aria-label="Open menu"
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
            {navigationItems.map((item: NavigationItem) => {
              const ItemIcon = item.icon ? NAV_ICONS[item.icon] : null;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-colors ${
                    currentPath === item.path
                      ? 'bg-primary/10 text-primary font-medium border-b-2 border-primary rounded-none'
                      : 'text-muted-foreground hover:bg-neutral-100 dark:hover:bg-white/5'
                  }`}
                >
                  {ItemIcon && <ItemIcon className="w-4 h-4" />}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {role === 'student' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative text-foreground hover:bg-slate-100 dark:hover:bg-white/10"
                    aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 rounded-2xl p-2 shadow-xl border-slate-100 dark:border-slate-800 dark:bg-slate-900 max-h-96 overflow-y-auto">
                  <DropdownMenuLabel className="font-black text-slate-800 dark:text-slate-100 px-3 py-2 uppercase tracking-tight text-xs">
                    Notifications
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="dark:bg-slate-800" />
                  {notifications.length === 0 ? (
                    <p className="text-center text-[11px] font-bold text-slate-400 uppercase py-6">
                      Nothing yet
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <DropdownMenuItem
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`rounded-xl cursor-pointer p-3 flex flex-col items-start gap-0.5 ${
                          n.read_at ? 'opacity-60' : 'bg-indigo-50 dark:bg-indigo-500/10'
                        }`}
                      >
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-100 leading-tight">
                          {n.title}
                        </span>
                        {n.message && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                            {n.message}
                          </span>
                        )}
                        <span className="text-[9px] font-bold text-slate-300 dark:text-slate-500 uppercase mt-0.5">
                          {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {onToggleTheme && (
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={onToggleTheme}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all">
                  <Avatar className="w-8 h-8 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary text-white text-[10px] font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {/* DITO LALABAS YUNG TOTOONG PANGALAN SA DESKTOP */}
                  <span className="hidden lg:block text-xs font-bold text-slate-700 dark:text-slate-200 max-w-[100px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 shadow-xl border-slate-100 dark:border-slate-800 dark:bg-slate-900">
                <DropdownMenuLabel className="font-black text-indigo-600 dark:text-indigo-400 px-3 py-2 uppercase tracking-tight">
                  {displayName}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="dark:bg-slate-800" />
                <DropdownMenuItem onClick={() => setShowLogoutConfirm(true)} className="text-red-600 focus:bg-red-50 dark:focus:bg-red-500/10 focus:text-red-700 dark:text-red-400 rounded-xl cursor-pointer p-3">
                  <LogOut className="w-4 h-4 mr-2" /> <span className="font-bold uppercase text-[11px] tracking-widest">Sign Out Account</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* MOBILE SIDEBAR (Isinama din ang name dito) */}
      <div className={`fixed top-0 left-0 h-full w-[280px] bg-white dark:bg-slate-900 z-[70] shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between gap-2 mb-8">
            <div className="flex items-center gap-2 min-w-0">
               <Avatar className="w-10 h-10 shrink-0">
                 <AvatarFallback className="bg-primary text-white font-bold">{initials}</AvatarFallback>
               </Avatar>
               <div className="flex flex-col min-w-0">
                 <span className="font-bold text-sm truncate text-slate-900 dark:text-slate-100">{displayName}</span>
                 <span className="text-[10px] text-slate-400 font-bold uppercase truncate">{campus}</span>
               </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onToggleTheme && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleTheme}
                  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="text-slate-600 dark:text-slate-300"
                >
                  {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu" className="text-slate-600 dark:text-slate-300">
                <X className="w-6 h-6" />
              </Button>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            {/* Re-mounted (not just hidden) each time the sidebar opens, so
                the fade/slide-in replays instead of only playing once ever. */}
            {isSidebarOpen &&
              navigationItems.map((item: NavigationItem, index) => {
                const ItemIcon = item.icon ? NAV_ICONS[item.icon] : null;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsSidebarOpen(false)}
                    style={{ animationDelay: `${index * 40}ms` }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base transition-all animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both ${
                      currentPath === item.path
                        ? 'bg-primary text-white shadow-lg font-bold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {ItemIcon && <ItemIcon className="w-5 h-5 shrink-0" />}
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          <div className="mt-auto pt-6 border-t dark:border-slate-800">
            <Button
              variant="ghost"
              className="w-full justify-start text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 font-bold rounded-xl"
              onClick={() => setShowLogoutConfirm(true)}
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

      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="max-w-sm rounded-3xl p-7 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <AlertCircle />
          </div>

          <DialogHeader className="mt-4">
            <DialogTitle className="text-xl font-black text-center dark:text-slate-100">
              Sign Out?
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            You'll need to log in again to continue.
          </p>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button
              variant="ghost"
              onClick={() => setShowLogoutConfirm(false)}
              className="rounded-xl font-black"
            >
              Cancel
            </Button>

            <Button
              onClick={() => {
                setShowLogoutConfirm(false);
                onLogout();
              }}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black"
            >
              Yes, Sign Out
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shown once per login session when there's something unread —
          catches a student who never opens the bell dropdown at all. */}
      <Dialog open={showBanner} onOpenChange={setShowBanner}>
        <DialogContent className="max-w-md rounded-3xl p-7">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
            <Bell />
          </div>

          <DialogHeader className="mt-4">
            <DialogTitle className="text-xl font-black text-center dark:text-slate-100">
              {unreadCount} New Update{unreadCount === 1 ? '' : 's'}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {notifications.filter((n) => !n.read_at).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setShowBanner(false);
                  handleNotificationClick(n);
                }}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
              >
                <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{n.title}</p>
                {n.message && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{n.message}</p>
                )}
              </button>
            ))}
          </div>

          <Button
            onClick={() => {
              markAsRead(notifications.filter((n) => !n.read_at).map((n) => n.id));
              setShowBanner(false);
            }}
            className="w-full mt-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black"
          >
            Dismiss
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}