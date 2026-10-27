import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// 100% = the picture fitted to the window. Out to 50%, in to 400%.
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const STEP = 0.25;
const DOUBLE_CLICK_SCALE = 2;

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  // Lets a carousel around the picture ignore its swipe while zoomed in.
  onScaleChange?: (scale: number) => void;
}

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
const roundScale = (value: number) => Math.round(value * 100) / 100;

const toolbarButton =
  'w-11 h-11 rounded-xl flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-[#A5B4FC]';

// Infographics are tall and detail-dense, and the browser's own zoom
// scales the whole page (nav, buttons, everything) along with the
// image. This scales ONLY the <img> via a CSS transform, independent
// of the page. Buttons (+, −, Reset) and the keys + − 0, the mouse wheel /
// trackpad pinch, double-click, drag to pan, and two-finger pinch on touch.
// Esc is left to the dialog the viewer sits in. Used by students and admins.
export default function ZoomableImage({ src, alt, className, onScaleChange }: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  // Pinch-to-zoom state: only read/written inside the touch handlers.
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);

  const applyScale = useCallback((next: number) => {
    const value = roundScale(clampScale(next));
    scaleRef.current = value;
    setScale(value);
    // Panning only makes sense when zoomed in; fitting or shrinking recentres.
    if (value <= 1) setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = () => applyScale(scaleRef.current + STEP);
  const zoomOut = () => applyScale(scaleRef.current - STEP);
  const reset = useCallback(() => {
    scaleRef.current = 1;
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse / single-finger drag-to-pan, via Pointer Events so mouse and
  // touch share one code path. Only active once zoomed in.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    isDragging.current = true;
    setDragging(true);
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
    setDragging(false);
  };

  const handleDoubleClick = () => {
    if (scaleRef.current === 1) applyScale(DOUBLE_CLICK_SCALE);
    else reset();
  };

  // Wheel / trackpad pinch and two-finger touch pinch need raw, non-passive
  // listeners: React attaches its synthetic handlers as passive, which
  // silently ignores preventDefault() and lets the browser zoom the whole
  // page alongside this one.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // A trackpad pinch arrives as ctrl + wheel with small deltas.
      const speed = e.ctrlKey ? 0.01 : 0.0025;
      applyScale(scaleRef.current * Math.exp(-e.deltaY * speed));
    };

    const distanceBetween = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartDistance.current = distanceBetween(e.touches);
        pinchStartScale.current = scaleRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistance.current > 0) {
        e.preventDefault();
        applyScale(pinchStartScale.current * (distanceBetween(e.touches) / pinchStartDistance.current));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartDistance.current = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [applyScale]);

  // Keyboard: + / = zoom in, − / _ zoom out, 0 reset. Ignored while typing and
  // with Ctrl/Cmd held (that is the browser's own page zoom).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyScale(scaleRef.current + STEP);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyScale(scaleRef.current - STEP);
      } else if (e.key === '0') {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyScale, reset]);

  useEffect(() => {
    onScaleChange?.(scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // A different picture starts at fit again.
  useEffect(() => {
    reset();
  }, [src, reset]);

  const percent = Math.round(scale * 100);

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
        onDoubleClick={handleDoubleClick}
        draggable={false}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
        style={{
          transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
          transition: dragging ? 'none' : 'transform 0.15s ease-out',
          cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
      />

      <div
        role="group"
        aria-label="Zoom controls"
        className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-2xl p-1 z-10"
      >
        <button type="button" onClick={zoomOut} disabled={scale <= MIN_SCALE} className={toolbarButton} aria-label="Zoom out">
          <ZoomOut className="w-5 h-5" aria-hidden="true" />
        </button>
        <span role="status" aria-live="polite" aria-label={`Zoom ${percent}%`} className="min-w-[3.25rem] text-center text-sm font-bold tabular-nums text-white select-none">
          {percent}%
        </span>
        <button type="button" onClick={zoomIn} disabled={scale >= MAX_SCALE} className={toolbarButton} aria-label="Zoom in">
          <ZoomIn className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={scale === 1 && pan.x === 0 && pan.y === 0}
          className={toolbarButton}
          aria-label="Reset zoom"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
