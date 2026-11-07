// English / Tagalog for the STUDENT PORTAL only.
//
// How it works
//  - The English text IS the key: t('Your programs'). The Tagalog for it lives
//    in ./tl.ts (one file, so the group can review every string in one place).
//  - t() only accepts keys that exist in tl.ts (TypeScript checks every literal),
//    so a string can't be added in English and forgotten in Tagalog.
//  - tr() is the loose form for English text that comes from data the code holds
//    (a badge list, a status label). A text with no Tagalog entry shows in English.
//  - Tagalog applies ONLY inside /student. Public pages, About, sign-in, the
//    consent screens and the admin portal always stay in English, whatever was chosen.
//  - Text written by admins (programs, IEC materials, survey questions) never goes
//    through t(): it is shown exactly as written. Dates stay in English format.
//  - The choice is remembered on the device (localStorage) and on the student's
//    profile (profiles.language), so it follows them to another device.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { tl as TagalogStrings } from './tl';
import { fill, plain, type Vars } from './fill';
import { translateServerMessage } from './serverMessages';

export type Language = 'en' | 'tl';
export type MessageKey = keyof typeof TagalogStrings;
export type { Vars } from './fill';

const STORAGE_KEY = 'omsu-lang';

function readStored(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'tl' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

function writeStored(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* private window / blocked storage: the choice just isn't remembered on this device */
  }
}

type Dictionary = Record<string, string>;

interface LanguageContextValue {
  // what the student chose (even when the page they are on is always English)
  chosen: Language;
  // what is showing right now
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  tr: (text: string, vars?: Vars) => string;
  // a message the database sent to the student, in their language (unknown ones stay as they came)
  serverMessage: (message: string) => string;
}

const identity = (text: string, vars?: Vars) => fill(text, vars);

const LanguageContext = createContext<LanguageContextValue>({
  chosen: 'en',
  language: 'en',
  setLanguage: () => {},
  t: identity,
  tr: identity,
  serverMessage: (message) => translateServerMessage(message, plain, 'en'),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, role } = useAuth();
  const [chosen, setChosen] = useState<Language>(() => readStored() ?? 'en');
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const hasRendered = useRef(false);

  const inPortal = pathname === '/student' || pathname.startsWith('/student/');
  const language: Language = inPortal && chosen === 'tl' ? 'tl' : 'en';

  // The Tagalog file is only downloaded once someone is inside the student portal.
  useEffect(() => {
    if (!inPortal || dictionary) return;
    let cancelled = false;
    import('./tl')
      .then((module) => {
        if (!cancelled) setDictionary(module.tl as Dictionary);
      })
      .catch((error) => console.warn('Tagalog strings could not be loaded:', error));
    return () => {
      cancelled = true;
    };
  }, [inPortal, dictionary]);

  // Signed-in student: the saved choice on the profile wins; a device-only choice is saved to it.
  useEffect(() => {
    if (role !== 'student' || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('language').eq('id', user.id).maybeSingle();
      if (cancelled || error) return;
      const saved = data?.language;
      if (saved === 'en' || saved === 'tl') {
        setChosen(saved);
        writeStored(saved);
      } else if (data && readStored()) {
        // profile has no choice yet but this device does
        await supabase.from('profiles').update({ language: readStored() }).eq('id', user.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, user?.id]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    (next: Language) => {
      setChosen(next);
      writeStored(next);
      if (role === 'student' && user?.id) {
        // fire and forget: failing to save must never get in the student's way
        supabase
          .from('profiles')
          .update({ language: next })
          .eq('id', user.id)
          .then(({ error }) => {
            if (error) console.warn('Language choice was not saved to the profile:', error.message);
          });
      }
    },
    [role, user?.id]
  );

  const translate = useCallback(
    (text: string, vars?: Vars) => fill(language === 'tl' && dictionary ? dictionary[text] ?? text : text, vars),
    [language, dictionary]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      chosen,
      language,
      setLanguage,
      t: translate,
      tr: translate,
      serverMessage: (message: string) => translateServerMessage(message, translate, language),
    }),
    [chosen, language, setLanguage, translate]
  );

  // First paint in Tagalog: wait for the strings instead of flashing English first.
  const waiting = language === 'tl' && !dictionary && !hasRendered.current;
  useEffect(() => {
    if (!waiting) hasRendered.current = true;
  }, [waiting]);
  if (waiting) return <div className="min-h-screen bg-[#EEF0FA]" aria-busy="true" />;

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
