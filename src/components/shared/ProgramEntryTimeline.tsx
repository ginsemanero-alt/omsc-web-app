interface ProgramEntry {
  id: number;
  label: string;
  description: string | null;
  caption: string | null;
  image_urls: string[] | null;
  sort_order: number;
}

interface ProgramEntryTimelineProps {
  entries: ProgramEntry[];
  onImageClick?: (url: string, title: string) => void;
  className?: string;
}

// Shared between the student-facing Programs page and the admin's own
// Program Manager (as a "this is what students will see" preview) — one
// rendering, so the admin's preview can never drift from the real thing.
export default function ProgramEntryTimeline({ entries, onImageClick, className }: ProgramEntryTimelineProps) {
  const sorted = entries.slice().sort((a, b) => a.sort_order - b.sort_order);

  if (sorted.length === 0) return null;

  return (
    <ol className={`max-h-[32rem] overflow-y-auto pr-1 m-0 p-0 list-none font-figtree ${className || ''}`}>
      {sorted.map((entry, index) => {
        const photos = entry.image_urls || [];
        const isLast = index === sorted.length - 1;

        return (
          <li key={entry.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3.5">
            {/* Dot and connecting line */}
            <div className="flex flex-col items-center" aria-hidden="true">
              <span className="w-3 h-3 mt-[5px] rounded-full bg-[#4F46E5] shrink-0" />
              {!isLast && <span className="grow w-0.5 bg-[#E0E3F0] dark:bg-slate-700" />}
            </div>

            <div className={`flex flex-col gap-1 min-w-0 ${isLast ? '' : 'pb-[22px]'}`}>
              <p className="m-0 font-bold text-base leading-snug text-[#1E1B4B] dark:text-white break-words">
                {entry.label}
                {photos.length > 1 && (
                  <span className="ml-2 font-medium text-[13px] text-[#5B6477] dark:text-slate-400">
                    {photos.length} photos
                  </span>
                )}
              </p>

              {entry.description && (
                <p className="m-0 text-sm leading-normal text-[#5B6477] dark:text-slate-300 whitespace-pre-line">
                  {entry.description}
                </p>
              )}

              {photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
                  {photos.map((url: string, i: number) =>
                    onImageClick ? (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onImageClick(url, entry.label)}
                        aria-label={`Enlarge photo ${i + 1} of ${photos.length}: ${entry.label}`}
                        className="shrink-0 rounded-2xl focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
                      >
                        <img src={url} alt="" className="h-32 w-auto rounded-2xl object-cover" loading="lazy" />
                      </button>
                    ) : (
                      <img key={i} src={url} alt={entry.label} className="h-32 w-auto rounded-2xl object-cover shrink-0" loading="lazy" />
                    )
                  )}
                </div>
              )}

              {entry.caption && (
                <p className="m-0 mt-1 text-[13px] italic text-[#5B6477] dark:text-slate-400">{entry.caption}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
