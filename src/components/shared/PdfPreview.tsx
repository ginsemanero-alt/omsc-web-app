import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite's ?url suffix returns the built asset's final URL instead of trying
// to bundle the worker as JS — this is the standard way to wire up
// pdfjs-dist's worker with a bundler. Version must match the installed
// pdfjs-dist package exactly, or the worker silently refuses to load.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2, ChevronLeft, ChevronRight, ExternalLink, FileWarning } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPdfDoc(null);
    setPageNum(1);

    const loadingTask = pdfjsLib.getDocument({ url });

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

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      page.render({ canvasContext: context, viewport, canvas }).promise.then(() => {
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
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Loading PDF...
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
