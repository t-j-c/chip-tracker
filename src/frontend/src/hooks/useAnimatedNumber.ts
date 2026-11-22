import { useRef, useState, useEffect } from 'react';
import { prefersReducedMotion } from '../lib/motion';

export function useAnimatedNumber(target: number, duration = 400): number {
  const [displayed, setDisplayed] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    if (from === target) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    if (prefersReducedMotion()) {
      prevRef.current = target;
      rafRef.current = null;
      setDisplayed(target);
      return;
    }

    startTimeRef.current = null;

    const animate = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (target - from) * eased);
      setDisplayed(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return displayed;
}
