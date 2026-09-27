import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

export interface ViewerPhoto {
  url: string;
  caption: string;
}

export interface PhotoViewerState {
  photos: ViewerPhoto[];
  index: number;
}

interface ProgramPhotoSource {
  title: string;
  image_url?: string | null;
  gallery_urls?: string[] | null;
  program_entries?: { label: string; image_urls: string[] | null; sort_order: number }[] | null;
}

// Every photo a program has, in the order a student meets them on the
// page: cover, then each timeline entry's photos, then "More Photos".
export function collectProgramPhotos(program: ProgramPhotoSource): ViewerPhoto[] {
  const photos: ViewerPhoto[] = [];

  if (program.image_url) {
    photos.push({ url: program.image_url, caption: program.title });
  }

  (program.program_entries || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((entry) => {
      (entry.image_urls || []).forEach((url) => photos.push({ url, caption: entry.label }));
    });

  (program.gallery_urls || []).forEach((url) =>
    photos.push({ url, caption: program.title })
  );

  return photos;
}

// Opens the viewer on `url` within `photos`; falls back to a
// single-photo viewer when the url isn't part of the list (e.g. the
// placeholder cover of a program with no photo).
export function viewerAt(photos: ViewerPhoto[], url: string, caption: string): PhotoViewerState {
  const index = photos.findIndex((photo) => photo.url === url);
  return index >= 0 ? { photos, index } : { photos: [{ url, caption }], index: 0 };
}

interface PhotoViewerProps {
  state: PhotoViewerState | null;
  onChange: (state: PhotoViewerState | null) => void;
}

const SWIPE_THRESHOLD_PX = 50;

// Full-size photo viewer: arrows, keyboard ← →, swipe on phones, a
// "3 / 8" counter, and a thumbnail strip. Wraps around at either end.
export default function PhotoViewer({ state, onChange }: PhotoViewerProps) {
  const touchStartX = useRef<number | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);

  const photos = state?.photos || [];
  const index = state?.index ?? 0;
  const current = photos[index];
  const hasMany = photos.length > 1;

  const go = (step: number) => {
    if (!state || !hasMany) return;
    onChange({ photos, index: (index + step + photos.length) % photos.length });
  };

  useEffect(() => {
    if (!state || !hasMany) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Preload the neighbors so next/previous shows instantly, and keep the
  // active thumbnail in view.
  useEffect(() => {
    if (!state) return;
    [index - 1, index + 1].forEach((i) => {
      const photo = photos[(i + photos.length) % photos.length];
      if (photo) new Image().src = photo.url;
    });
    // Scroll only the thumbnail strip — scrollIntoView would also scroll
    // the dialog itself sideways on narrow screens.
    const thumb = activeThumbRef.current;
    const strip = thumb?.parentElement;
    if (thumb && strip) {
      strip.scrollTo({
        left: thumb.offsetLeft - strip.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2,
        behavior: 'smooth',
      });
    }
  }, [state, index, photos]);

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onChange(null)}>
      <DialogContent className="flex flex-col max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:text-white [&>button]:opacity-100 [&>button]:z-20">
        <DialogTitle className="sr-only">{current?.caption || 'Photo'}</DialogTitle>

        {current && (
          <>
            <div
              className="relative w-full min-w-0 flex items-center justify-center bg-slate-950 select-none"
              onTouchStart={(event) => {
                touchStartX.current = event.touches[0].clientX;
              }}
              onTouchEnd={(event) => {
                if (touchStartX.current === null) return;
                const delta = event.changedTouches[0].clientX - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) go(delta < 0 ? 1 : -1);
              }}
            >
              <img
                key={current.url}
                src={current.url}
                alt={current.caption}
                className="w-full max-h-[70vh] object-contain animate-in fade-in duration-200"
                draggable={false}
              />

              {hasMany && (
                <>
                  <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/60 text-white text-[10px] font-black uppercase tracking-widest">
                    {index + 1} / {photos.length}
                  </span>

                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label="Previous photo"
                    className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label="Next photo"
                    className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            <div className="w-full min-w-0 px-4 sm:px-6 py-3 bg-slate-900">
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-white truncate">
                {current.caption}
              </p>

              {hasMany && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {photos.map((photo, i) => (
                    <button
                      key={`${photo.url}-${i}`}
                      ref={i === index ? activeThumbRef : undefined}
                      type="button"
                      onClick={() => onChange({ photos, index: i })}
                      aria-label={`Photo ${i + 1}`}
                      className={`h-12 w-16 sm:h-14 sm:w-20 shrink-0 rounded-lg overflow-hidden ring-2 transition-all ${
                        i === index ? 'ring-indigo-400 opacity-100' : 'ring-transparent opacity-50 hover:opacity-90'
                      }`}
                    >
                      <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
