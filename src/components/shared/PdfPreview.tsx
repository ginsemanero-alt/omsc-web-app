import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite's ?url suffix returns the built asset's final URL instead of trying
// to bundle the worker as JS — this is the standard way to wire up
// pdfjs-dist's worker with a bundler. Version must match the installed
// pdfjs-dist package exactly, or the worker silently refuses to load.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2, ChevronLeft, ChevronRight, ExternalLink, FileWarning } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Profiled against a throttled CPU (a stand-in for a mid/low-range
// Android phone): the ~14 second "Loading PDF..." delay wasn't the
// network at all — it was the browser downloading, parsing, and
// initializing pdfjs's own ~1.2MB worker script, which only used to
// start after the user opened a preview. That init is exactly what
// `PDFWorker.create()` + its `.promise` pays for, with no PDF document
// involved at all — so it's started as soon as the materials list is
// known to have a PDF, while someone is still browsing it, and the
// resulting live worker is then handed directly to the real
// `getDocument()` call below instead of letting it spin up a second one
// from scratch.
let warmWorker: pdfjsLib.PDFWorker | null = null;
let warmupStarted = false;

// Called from the materials list pages as soon as they know they have a
// PDF to show, well before anyone opens a preview — see the callers for
// why this is a named export rather than happening automatically on
// module load: it should only fire once this chunk is actually needed.
export function warmPdfWorker(): void {
  if (warmupStarted) return;
  warmupStarted = true;

  try {
    const worker = pdfjsLib.PDFWorker.create({});
    worker.promise
      .then(() => {
        warmWorker = worker;
      })
      .catch(() => {
        // Best-effort only — a failed warm-up just means no head start,
        // never a broken preview later.
      });
  } catch {
    // Same as above: pdfjs not being ready to construct a worker yet is
    // not fatal, just a missed head start.
  }
}

// One-time claim so two previews opened close together don't fight over
// the same worker — a second one falls back to pdfjs creating its own,
// exactly like before this change.
function claimWarmWorker(): pdfjsLib.PDFWorker | null {
  if (warmWorker && !warmWorker.destroyed) {
    const claimed = warmWorker;
    warmWorker = null;
    return claimed;
  }
  return null;
}

interface PdfPreviewProps {
  url: string;
}

/**
 * Renders a PDF inline via pdfjs-dist onto a <canvas>, instead of
 * <iframe src="file.pdf">. The iframe approach depends on the browser
 * having a built-in PDF viewer — desktop Chrome usually does, but mobile
 * Chrome/Safari generally don't, and silently show "This page has been
 * blocked by Chrome" with no way for the parent page to detect or recover
 * from it (cross-origin iframe). pdfjs-dist decodes and draws the PDF
 * itself, so it renders identically on every browser and device.
 */
export default function PdfPreview({ url }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(false);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPdfDoc(null);
    setPageNum(1);
    setLoadProgress(null);

    const worker = claimWarmWorker();
    const loadingTask = worker
      ? pdfjsLib.getDocument({ url, worker })
      : pdfjsLib.getDocument({ url });
    // onProgress is a callback property on the loading task itself, not a
    // DocumentInitParameters option.
    loadingTask.onProgress = (data: { loaded: number; total: number }) => {
      if (cancelled || !data.total) return;
      setLoadProgress(Math.min(99, Math.round((data.loaded / data.total) * 100)));
    };

    loadingTask.promise
      .then((doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    setRendering(true);

    pdfDoc.getPage(pageNum).then((page) => {
      if (cancelled || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      // Fit the rendered page to the available width instead of a fixed
      // scale, so it looks right on both a phone screen and a wide modal.
      const availableWidth = containerRef.current?.clientWidth || 600;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.max(0.5, availableWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });

      // The canvas's backing pixel buffer was being sized 1:1 with CSS
      // pixels, then stretched to fit the screen by the browser — fine on
      // a ~1x display, visibly blurry on the ~2.5-4x pixel density most
      // Android phones actually have (higher than most iPhones, which is
      // why this was more noticeable there). Render at devicePixelRatio
      // resolution instead, then keep the on-page CSS size unchanged —
      // the standard pdf.js HiDPI pattern. Clamped so a very high-DPR
      // device doesn't blow up canvas memory on a large page.
      const outputScale = Math.min(window.devicePixelRatio || 1, 2.5);

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

      page.render({ canvasContext: context, viewport, transform, canvas }).promise.then(() => {
        if (!cancelled) setRendering(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum]);

  if (error) {
    return (
      <div className="p-8 w-full max-w-xl flex flex-col items-center gap-6 text-center mx-auto">
        <div className="w-24 h-24 rounded-3xl bg-rose-500/10 flex items-center justify-center">
          <FileWarning className="w-12 h-12 text-rose-400" />
        </div>
        <p className="text-slate-300 text-sm">
          This PDF couldn't be previewed here. You can still open it directly.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs"
        >
          Open PDF <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center overflow-y-auto py-6 px-4">
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {loadProgress !== null ? `Loading PDF... ${loadProgress}%` : 'Loading PDF...'}
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              </div>
            )}
            <canvas ref={canvasRef} className="rounded-lg shadow-2xl max-w-full" />
          </div>

          {numPages > 1 && (
            <div className="flex items-center gap-4 mt-5 shrink-0">
              <button
                type="button"
                disabled={pageNum <= 1}
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Page {pageNum} / {numPages}
              </span>

              <button
                type="button"
                disabled={pageNum >= numPages}
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
