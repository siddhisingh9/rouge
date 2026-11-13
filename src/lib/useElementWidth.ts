// Width of an element in CSS pixels, kept current with a ResizeObserver. Lets SVG
// charts draw in real pixels so text stays the same size at every screen width.
import { useCallback, useState } from 'react';

export function useElementWidth<T extends Element>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
