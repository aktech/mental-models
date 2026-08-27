import { useEffect, useRef, useState } from 'react';

/**
 * Width of a container element in CSS px, updated on resize. Diagrams lay
 * themselves out from this number so labels stay at their real size instead
 * of scaling down with a viewBox.
 */
export function useContainerWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
