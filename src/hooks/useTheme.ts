import { useEffect, useState } from 'react';

const STORAGE_KEY = 'student-theme';

/**
 * Scoped, student-side-only dark mode. Deliberately not a document-wide
 * theme — the `dark` class this returns is meant to be applied to a
 * wrapper around just the student dashboard subtree (see
 * StudentDashboard.tsx), so it never affects the public site or the admin
 * dashboard, which have no dark: variants and no toggle of their own.
 */
export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Private browsing / storage disabled — theme just won't persist
      // across visits, which isn't worth failing over.
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return { isDark, toggleTheme };
}
