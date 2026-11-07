import { Globe } from 'lucide-react';
import { useT, type Language } from '../../i18n';

// English | Tagalog, for the student portal only. The two names are each
// language's own name, so they are never translated.
const OPTIONS: { value: Language; label: string; lang: string }[] = [
  { value: 'en', label: 'English', lang: 'en' },
  { value: 'tl', label: 'Tagalog', lang: 'tl' },
];

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

interface LanguageToggleProps {
  className?: string;
  // "segmented" shows both names; "compact" is one 44px button (globe + EN/TL) for narrow headers.
  variant?: 'segmented' | 'compact';
}

export default function LanguageToggle({ className = '', variant = 'segmented' }: LanguageToggleProps) {
  const { chosen, setLanguage } = useT();

  if (variant === 'compact') {
    const next: Language = chosen === 'en' ? 'tl' : 'en';
    const nextName = next === 'tl' ? 'Tagalog' : 'English';
    return (
      <button
        type="button"
        onClick={() => setLanguage(next)}
        // not translated: it has to be understood by someone who is lost in the other language
        aria-label={`Language: ${chosen === 'tl' ? 'Tagalog' : 'English'}. Switch to ${nextName} / Palitan ang wika`}
        className={`min-h-[44px] min-w-[44px] px-2.5 rounded-2xl bg-white dark:bg-slate-900 text-[#1E1B4B] dark:text-slate-100 font-extrabold text-xs flex items-center justify-center gap-1 ${focusRing} ${className}`}
      >
        <Globe className="w-4 h-4" aria-hidden="true" />
        <span aria-hidden="true">{chosen === 'tl' ? 'TL' : 'EN'}</span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Language / Wika"
      className={`inline-flex items-center rounded-2xl bg-white dark:bg-slate-900 p-1 ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = chosen === option.value;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.lang}
            aria-pressed={active}
            onClick={() => setLanguage(option.value)}
            className={`min-h-[44px] min-w-[44px] px-3 rounded-xl font-bold text-sm transition-colors ${focusRing} ${
              active
                ? 'bg-[#1E1B4B] dark:bg-indigo-500 text-white'
                : 'text-[#5B6477] dark:text-slate-300 hover:text-[#1E1B4B] dark:hover:text-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
