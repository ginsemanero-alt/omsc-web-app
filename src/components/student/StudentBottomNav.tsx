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
      className="fixed inset-x-0 bottom-0 z-40 md:hidden pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <nav
        aria-label="Primary"
        aria-hidden={keyboardOpen}
        className={`mx-[10px] mb-[10px] pointer-events-auto flex items-stretch rounded-2xl bg-white dark:bg-slate-900 shadow-[0_-4px_24px_rgba(15,23,42,0.12)] transition-transform duration-200 ease-out ${
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
              className="flex flex-1 min-h-[44px] flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl"
            >
              {ItemIcon && (
                <ItemIcon
                  className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400 dark:text-slate-500'}`}
                  strokeWidth={2}
                />
              )}
              <span
                className={`text-[11px] leading-none ${
                  isActive
                    ? 'text-indigo-600 font-semibold'
                    : 'text-slate-400 dark:text-slate-500 font-normal'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
