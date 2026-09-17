import { Button } from './button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
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
}: PaginationControlsProps) {
  if (totalItems === 0 || totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

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
