import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Info } from 'lucide-react';

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

// A small "i" button that explains what a number counts. A real button, so it
// opens with Tab + Enter/Space as well as hover or tap; Esc closes it.
export function InfoTip({ text, label = 'What does this count?', dark = false }: { text: string; label?: string; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span
      className="absolute top-1 right-1 z-10"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
        className={`w-11 h-11 rounded-full flex items-center justify-center ${dark ? 'text-[#C7C9F2]' : 'text-[#6B7285]'} hover:text-[#4F46E5] ${focusRing}`}
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute right-2 top-11 w-64 max-w-[70vw] rounded-xl bg-[#1E1B4B] px-3 py-2.5 text-left text-[13px] font-medium leading-snug text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

interface StatTileProps {
  label: string;
  value: number | string;
  note: string;
  dark?: boolean;
  // 'content' = the Content page cards, 'analytics' = the smaller Analytics ones.
  variant?: 'content' | 'analytics';
  className?: string;
  // The whole card is ONE real link (or button), laid over the card.
  to?: string;
  onActivate?: () => void;
  ariaLabel?: string;
  // The sub-line can be its own link (a filtered view of the same list).
  noteTo?: string;
  noteAriaLabel?: string;
  // A number that has no list behind it stays plain text and explains itself.
  info?: string;
}

const SIZES = {
  content: {
    box: 'px-6 py-[22px] rounded-[28px] gap-1',
    radius: 'rounded-[28px]',
    label: 'text-sm font-semibold',
    value: 'font-bricolage font-extrabold text-[40px] leading-none tracking-[-0.02em]',
  },
  analytics: {
    box: 'h-full px-[22px] py-5 rounded-[26px] gap-1',
    radius: 'rounded-[26px]',
    label: 'text-[13px] font-semibold',
    value: 'font-bricolage font-extrabold text-[34px] md:text-[36px] leading-tight tracking-[-0.02em] break-words',
  },
} as const;

export default function StatTile({
  label,
  value,
  note,
  dark = false,
  variant = 'content',
  className = '',
  to,
  onActivate,
  ariaLabel,
  noteTo,
  noteAriaLabel,
  info,
}: StatTileProps) {
  const size = SIZES[variant];
  const clickable = !!to || !!onActivate;
  const overlay = `absolute inset-0 ${size.radius} ${focusRing}`;

  return (
    <div
      className={`group relative min-w-0 flex flex-col ${size.box} ${dark ? 'bg-[#1E1B4B] text-white' : 'bg-white'} ${
        clickable
          ? 'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-12px_rgba(30,27,75,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0'
          : ''
      } ${className}`}
    >
      {to ? (
        <Link to={to} aria-label={ariaLabel} className={overlay} />
      ) : onActivate ? (
        <button type="button" onClick={onActivate} aria-label={ariaLabel} className={`${overlay} cursor-pointer`} />
      ) : null}

      <span className={`${size.label} ${dark ? 'text-[#FBBF24]' : 'text-[#5B6477]'}`}>{label}</span>
      <span className={`${size.value} ${dark ? 'text-white' : 'text-[#1E1B4B]'}`}>{value}</span>

      {noteTo ? (
        <Link
          to={noteTo}
          aria-label={noteAriaLabel}
          className={`relative z-10 self-start -mx-1 px-1 rounded-md text-[13px] underline-offset-2 hover:underline ${dark ? 'text-[#C7C9F2]' : 'text-[#5B6477] hover:text-[#4338CA]'} ${focusRing}`}
        >
          {note}
        </Link>
      ) : (
        <span className={`text-[13px] ${dark ? 'text-[#C7C9F2]' : 'text-[#5B6477]'}`}>{note}</span>
      )}

      {clickable && (
        <ArrowUpRight
          aria-hidden="true"
          className={`pointer-events-none absolute top-4 right-4 w-4 h-4 opacity-40 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0 ${dark ? 'text-white' : 'text-[#4F46E5]'}`}
        />
      )}
      {!clickable && info && <InfoTip text={info} dark={dark} />}
    </div>
  );
}
