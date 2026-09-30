import { Button } from './button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  // "admin": the redesigned admin screens (sentence case, 44px buttons).
  // Anything that doesn't pass it keeps the original look.
  variant?: 'default' | 'admin';
}

// Shared by every paginated list in the app (Users, Materials, Programs,
// Activity Log, public pages) — a single "Showing X-Y of Z" + Prev/Next
// bar, so the pattern reads the same everywhere instead of a bespoke
// pager per screen. Renders nothing when there's only one page — a
// disabled Prev/Next pair with nothing to page through is just noise.
export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className = '',
  variant = 'default',
}: PaginationControlsProps) {
  if (totalItems === 0 || totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  if (variant === 'admin') {
    const buttonClass =
      'h-11 px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-sm flex items-center gap-1.5 hover:border-[#A5B4FC] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';
    return (
      <nav aria-label="Pagination" className={`flex flex-col sm:flex-row items-center justify-between gap-3 font-figtree ${className}`}>
        <p className="m-0 text-sm text-[#5B6477]">
          Showing {start}&ndash;{end} of {totalItems}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={buttonClass}>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Previous
          </button>
          <span className="text-sm font-semibold text-[#334155] px-2 whitespace-nowrap">
            Page {page} of {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className={buttonClass}>
            Next <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${className}`}>
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        Showing {start}&ndash;{end} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-9 rounded-xl px-3 font-black uppercase text-[10px] border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
        </Button>
        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 whitespace-nowrap">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-9 rounded-xl px-3 font-black uppercase text-[10px] border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
