import { useEffect, useRef } from "react";

/* The spinning Normalize coin.

   Passive (header, footer): a pure CSS keyframe rotation — no JS runs at all.
   Interactive (hero): drag or swipe to spin either way, release to let it coast
   down, tap to stop dead. The idle CSS animation is disabled by the
   .coin-interactive rule so the two never fight over the same transform. */
export default function Coin({ size = "md", interactive = false, className = "" }) {
  const innerRef = useRef(null);
  const stateRef = useRef({ angle: 0, velocity: 0.35, dragging: false, lastX: 0, frame: 0 });

  useEffect(() => {
    if (!interactive) return;
    const inner = innerRef.current;
    if (!inner) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = stateRef.current;
    if (reduced) s.velocity = 0;

    const tick = () => {
      if (!s.dragging) {
        s.angle += s.velocity;
        // Coast down to a stop rather than halting abruptly.
        s.velocity *= 0.985;
        if (Math.abs(s.velocity) < 0.004) s.velocity = 0;
      }
      inner.style.transform = `rotateY(${s.angle}deg)`;
      s.frame = requestAnimationFrame(tick);
    };
    s.frame = requestAnimationFrame(tick);

    const onDown = (e) => {
      s.dragging = true;
      s.lastX = e.clientX;
      s.velocity = 0;          // a tap alone stops the coin
      inner.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!s.dragging) return;
      const dx = e.clientX - s.lastX;
      s.lastX = e.clientX;
      s.angle += dx * 0.6;
      // Remember the throw so releasing mid-drag carries momentum.
      s.velocity = dx * 0.18;
    };
    const onUp = () => { s.dragging = false; };

    inner.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(s.frame);
      inner.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [interactive]);

  return (
    <span
      className={`coin-spin coin-${size} ${interactive ? "coin-interactive" : ""} ${className}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Normalize coin — drag or swipe to spin, tap to stop" : undefined}
      aria-hidden={interactive ? undefined : true}
    >
      <span className="coin-inner" ref={innerRef}>
        <span className="coin-face coin-front" />
        <span className="coin-face coin-back" />
      </span>
    </span>
  );
}
