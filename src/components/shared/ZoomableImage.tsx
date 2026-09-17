import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
}

// Infographics are tall and detail-dense, and the browser's own zoom
// scales the whole page (nav, buttons, everything) along with the
// image. This scales ONLY the <img> via a CSS transform, independent
// of the page — drag to pan once zoomed in, pinch on touch, buttons
// for mouse/keyboard users.
export default function ZoomableImage({ src, alt, className }: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  // Pinch-to-zoom state — kept in refs since it's only read/written
  // inside the touch handlers, never needs to trigger a re-render itself.
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);

  const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const zoomIn = () => setScale((s) => clampScale(s + STEP));
  const zoomOut = () =>
    setScale((s) => {
      const next = clampScale(s - STEP);
      if (next === MIN_SCALE) setPan({ x: 0, y: 0 });
      return next;
    });
  const reset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse / single-finger drag-to-pan, via Pointer Events so mouse and
  // touch share one code path. Only active once zoomed in.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = pan;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = (e.clientX - dragStart.current.x) / scale;
    const dy = (e.clientY - dragStart.current.y) / scale;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  // Pinch-to-zoom needs raw, non-passive touch listeners — React attaches
  // its synthetic touch handlers as passive, which silently ignores
  // preventDefault() and lets the browser's own page-zoom kick in
  // alongside this one.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceBetween = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartDistance.current = distanceBetween(e.touches);
        pinchStartScale.current = scale;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistance.current > 0) {
        e.preventDefault();
        const currentDistance = distanceBetween(e.touches);
        const ratio = currentDistance / pinchStartDistance.current;
        setScale(clampScale(pinchStartScale.current * ratio));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistance.current = 0;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
    // scale is read at gesture-start time via pinchStartScale, so this
    // only needs to re-attach if the element itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden touch-none ${className || ''}`}
    >
      <img
        src={src}
        alt={alt || 'Preview'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        draggable={false}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
        style={{
          transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.15s ease-out',
          cursor: scale > 1 ? 'grab' : 'default',
        }}
      />

      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-xl p-1.5 z-10">
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={scale === 1 && pan.x === 0 && pan.y === 0}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Reset zoom"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
