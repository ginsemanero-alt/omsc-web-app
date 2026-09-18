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
    <div className={`max-h-[32rem] overflow-y-auto pr-1 space-y-0 ${className || ''}`}>
      {sorted.map((entry, index) => (
        <div key={entry.id} className="relative pl-8 pb-6 last:pb-0">
          {index < sorted.length - 1 && (
            <div className="absolute left-[7px] top-3 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
          )}
          <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white dark:border-slate-900 shadow" />

          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
            {entry.label}
          </p>

          {(entry.image_urls?.length ?? 0) > 0 && (
            <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
              {entry.image_urls!.map((url: string, i: number) => (
                <img
                  key={i}
                  src={url}
                  alt={entry.label}
                  className="h-32 w-auto rounded-xl object-cover shrink-0 cursor-pointer"
                  onClick={() => onImageClick?.(url, entry.label)}
                />
              ))}
            </div>
          )}

          {entry.description && (
            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed mt-2">
              {entry.description}
            </p>
          )}

          {entry.caption && (
            <p className="text-[10px] text-slate-400 italic mt-1">
              {entry.caption}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
