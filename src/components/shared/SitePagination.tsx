import { ArrowLeft, ArrowRight } from "lucide-react";

// Pagination for the public pages (Programs, IEC Materials): 44px
// rounded buttons, current page in indigo, Previous / Next.

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

// Page numbers to show: all when few, otherwise first, last, and the
// current page's neighbours, with null marking a gap.
function pageList(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push(null);
    result.push(page);
  });
  return result;
}

interface SitePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function SitePagination({ page, totalPages, onPageChange }: SitePaginationProps) {
  if (totalPages <= 1) return null;

  const goToPage = (next: number) => {
    onPageChange(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const edgeButton = `h-11 px-4 rounded-[14px] bg-white text-[#1E1B4B] font-bold text-[15px] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${focusRing}`;

  return (
    <nav aria-label="Pagination" className="pt-4 flex flex-wrap justify-center gap-2 font-figtree">
      <button type="button" onClick={() => goToPage(page - 1)} disabled={page === 1} className={edgeButton}>
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Previous
      </button>
      {pageList(page, totalPages).map((item, index) =>
        item === null ? (
          <span key={`gap-${index}`} className="w-8 h-11 flex items-center justify-center text-[#5B6477]" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => goToPage(item)}
            aria-current={item === page ? "page" : undefined}
            aria-label={`Page ${item}`}
            className={`w-11 h-11 rounded-[14px] font-bold text-[15px] ${focusRing} ${
              item === page ? "bg-[#4F46E5] text-white" : "bg-white text-[#1E1B4B] hover:bg-[#E0E7FF]"
            }`}
          >
            {item}
          </button>
        )
      )}
      <button type="button" onClick={() => goToPage(page + 1)} disabled={page === totalPages} className={edgeButton}>
        Next <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
