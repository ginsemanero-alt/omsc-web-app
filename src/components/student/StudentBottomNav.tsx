import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, BookOpen, Calendar, ClipboardList, type LucideIcon } from 'lucide-react';

interface BottomNavItem {
  label: string;
  path: string;
  icon?: string;
}

const ICONS: Record<string, LucideIcon> = {
  Home,
  BookOpen,
  Calendar,
  ClipboardList,
};

interface StudentBottomNavProps {
  items: BottomNavItem[];
  currentPath: string;
}

// Floating mobile-only nav for the student side, replacing the hamburger
// drawer below 768px. Admin keeps the drawer untouched — this component
// only ever renders where StudentDashboard mounts it.
export default function StudentBottomNav({ items, currentPath }: StudentBottomNavProps) {
  // A fixed-position bar doesn't move with the on-screen keyboard the same
  // way across browsers — some leave it floating mid-screen above the
  // keyboard instead of pinned to the real viewport bottom. Hiding it
  // whenever a text field has focus sidesteps that inconsistency entirely.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const isTextInput = (target: EventTarget | null) =>
      target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    const handleFocusIn = (e: FocusEvent) => {
      if (isTextInput(e.target)) setKeyboardOpen(true);
    };
    const handleFocusOut = (e: FocusEvent) => {
      if (isTextInput(e.target)) setKeyboardOpen(false);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 md:hidden pointer-events-none font-figtree"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <nav
        aria-label="Primary"
        aria-hidden={keyboardOpen}
        className={`mx-3 mb-3 p-1.5 pointer-events-auto flex gap-1 rounded-[28px] bg-[#1E1B4B] shadow-[0_16px_40px_-12px_rgba(30,27,75,0.5)] transition-transform duration-200 ease-out ${
          keyboardOpen ? 'translate-y-[150%]' : 'translate-y-0'
        }`}
      >
        {items.map((item) => {
          const ItemIcon = item.icon ? ICONS[item.icon] : null;
          const isActive = currentPath === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              tabIndex={keyboardOpen ? -1 : 0}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 min-w-0 h-[58px] flex-col items-center justify-center gap-1 rounded-[20px] px-1 text-[11px] leading-none font-bold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC] ${
                isActive ? 'bg-[#4F46E5] text-white' : 'text-[#C7C9F2] hover:bg-white/10'
              }`}
            >
              {ItemIcon && <ItemIcon className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden="true" />}
              <span className="truncate max-w-full">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
