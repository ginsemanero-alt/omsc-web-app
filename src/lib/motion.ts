import { useEffect, useRef, useState, type CSSProperties, type DependencyList } from 'react';

// Shared motion helpers. The keyframes and classes live in
// src/styles/motion.css; everything that moves there is already wrapped in
// @media (prefers-reduced-motion: no-preference).

export const MOTION_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Read at call time, so a timer or observer set up now respects the
// current setting.
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

// Inline style for a staggered entrance: style={motionDelay(80)}.
export function motionDelay(ms: number): CSSProperties {
  return { ['--motion-delay' as string]: `${ms}ms` } as CSSProperties;
}

/*
 * Scroll reveal for a group of elements. Put the returned ref on a
 * container and data-reveal-item on each element that should reveal (the
 * container itself can be one). Each item reveals once, when about 15% of
 * it is visible. Items that come into view together are staggered in page
 * order, `staggerMs` apart, so a row plays left to right while items
 * scrolled into view one by one don't wait.
 *
 * Pass `deps` when the items render later (for example after a fetch), so
 * the new ones get observed.
 */
export function useRevealGroup<T extends HTMLElement>(staggerMs = 80, deps: DependencyList = []) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = [
      ...(root.matches('[data-reveal-item]:not([data-revealed])') ? [root] : []),
      ...Array.from(root.querySelectorAll<HTMLElement>('[data-reveal-item]:not([data-revealed])')),
    ];
    if (items.length === 0) return;

    const reveal = (element: HTMLElement, delayMs: number) => {
      element.style.setProperty('--motion-delay', `${delayMs}ms`);
      element.setAttribute('data-revealed', '');
    };

    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      items.forEach((element) => reveal(element, 0));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target as HTMLElement)
          .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
          .forEach((element, index) => {
            reveal(element, index * staggerMs);
            observer.unobserve(element);
          });
      },
      { threshold: 0.15 }
    );

    items.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

// Restarts a one-shot CSS animation class (e.g. motion-shake) on an
// element, even if it is already applied.
export function replayAnimation(element: HTMLElement | null, className: string) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth; // force a reflow so the animation starts over
  element.classList.add(className);
}
