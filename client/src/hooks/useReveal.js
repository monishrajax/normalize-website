import { useEffect, useRef } from "react";

/* Scroll reveal: children of the returned ref that carry .reveal are staggered
   up into view as the container enters the viewport.

   One observer per container rather than one per card — a grid of twenty
   products should not install twenty observers. Elements are unobserved once
   revealed, so scrolling back up doesn't replay the entrance. */
export function useReveal({ step = 70, enabled = true } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;

    const targets = Array.from(root.querySelectorAll(".reveal"));
    if (targets.length === 0) return;

    // Reduced motion: show everything at once and install nothing.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((el) => el.classList.add("reveal-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Stagger by document order within this batch, not by observer order,
        // which is not guaranteed to match the grid.
        const showing = entries.filter((e) => e.isIntersecting);
        showing
          .sort((a, b) => targets.indexOf(a.target) - targets.indexOf(b.target))
          .forEach((entry, i) => {
            const el = entry.target;
            setTimeout(() => el.classList.add("reveal-in"), i * step);
            observer.unobserve(el);
          });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [step, enabled]);

  return ref;
}
