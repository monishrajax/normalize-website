import { useEffect, useRef } from "react";

/* The Normalize coin, as CSS rather than WebGL.

   Passive (header, footer): a pure CSS keyframe rotation — no JS runs at all.

   Interactive (hero, and the launch stage's no-WebGL fallback): the same
   interaction model as the real coin in lib/coinScene.js, so the two never
   teach different gestures —

     · drag or swipe sideways to turn it, with momentum on release
     · tap to flip it to its other face
     · arrow keys to nudge it, Enter or Space to flip

   The idle CSS animation is disabled by the .coin-interactive rule so the
   keyframes and this script never fight over the same transform. */

const IDLE_DEG_PER_SEC = 26;   // gentle drift so it never looks frozen
const DEG_PER_PIXEL = 0.6;     // how far a drag turns it
const TAP_TRAVEL_PX = 5;       // a press that moves less than this is a tap
const TAP_MS = 350;

export default function Coin({ size = "md", interactive = false, className = "" }) {
  const rootRef = useRef(null);
  const innerRef = useRef(null);
  const stateRef = useRef({
    angle: 0, vel: 0, dragging: false, lastX: 0, lastT: 0,
    // When set, the coin is easing to a chosen face; idle drift and momentum
    // both stand down until it arrives.
    target: null,
    downT: 0, travel: 0,
  });

  useEffect(() => {
    if (!interactive) return;
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = stateRef.current;

    /* Turn to whichever face is not showing. Snapping to the nearest multiple
       of 180° keeps it honest however many times it has been spun. */
    const flipOver = () => {
      const half = Math.round(s.angle / 180);
      const to = (half + 1) * 180;
      if (reduced) {
        // Still interactive, just not animated: go straight there.
        s.angle = to;
        s.vel = 0;
        inner.style.transform = `rotateY(${to}deg)`;
      } else {
        s.target = to;
        s.vel = 0;
      }
    };

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (s.dragging) {
        // The hand is on it; nothing else moves it.
      } else if (s.target !== null) {
        const remaining = s.target - s.angle;
        s.angle += remaining * Math.min(1, dt * 7);
        if (Math.abs(remaining) < 0.15) {
          s.angle = s.target;
          s.target = null;
        }
      } else if (!reduced) {
        s.vel *= Math.pow(0.25, dt);          // coast down
        if (Math.abs(s.vel) < 1) s.vel = 0;
        s.angle += (s.vel + IDLE_DEG_PER_SEC) * dt;
      }

      inner.style.transform = `rotateY(${s.angle}deg)`;
      s.frame = requestAnimationFrame(tick);
    };
    s.frame = requestAnimationFrame(tick);

    /* Pointer handlers live on the OUTER span, which never rotates. On the
       inner one they would sit on the turning element, whose hit area collapses
       to a sliver as it passes edge-on — leaving the coin ungrabbable at
       exactly the angle a visitor most wants to correct. */
    const onDown = (e) => {
      s.dragging = true;
      s.lastX = e.clientX;
      s.lastT = performance.now();
      s.downT = s.lastT;
      s.travel = 0;
      s.vel = 0;
      s.target = null;                 // a grab cancels an in-flight flip
      try { root.setPointerCapture(e.pointerId); } catch { /* no capture */ }
    };

    const onMove = (e) => {
      if (!s.dragging) return;
      const now = performance.now();
      const dx = e.clientX - s.lastX;
      const dt = Math.max(8, now - s.lastT);
      s.travel += Math.abs(dx);
      s.angle += dx * DEG_PER_PIXEL;
      // Remember the throw so releasing mid-drag carries momentum.
      s.vel = (dx * DEG_PER_PIXEL) / (dt / 1000);
      s.lastX = e.clientX;
      s.lastT = now;
    };

    const onUp = (e) => {
      if (!s.dragging) return;
      s.dragging = false;
      if (reduced) s.vel = 0;
      /* Decided BEFORE releasing capture: releasePointerCapture throws when the
         pointer was never captured, and a throw here would swallow the tap. */
      if (s.travel < TAP_TRAVEL_PX && performance.now() - s.downT < TAP_MS) flipOver();
      try { root.releasePointerCapture(e.pointerId); } catch { /* never held */ }
    };

    /* A focusable role="button" that ignores the keyboard is a trap for anyone
       not using a mouse — this element had the role and the tab stop already,
       and did nothing with them. */
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        s.target = null;
        if (reduced) s.angle += e.key === "ArrowRight" ? 45 : -45;
        else s.vel += e.key === "ArrowRight" ? 260 : -260;
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        flipOver();
        e.preventDefault();
      }
    };

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(s.frame);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [interactive]);

  return (
    <span
      ref={rootRef}
      className={`coin-spin coin-${size} ${interactive ? "coin-interactive" : ""} ${className}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        interactive
          ? "The Normalize coin. Drag to turn it, or press the left and right arrow keys. Tap or press Enter to flip it over."
          : undefined
      }
      aria-hidden={interactive ? undefined : true}
    >
      <span className="coin-inner" ref={innerRef}>
        <span className="coin-face coin-front" />
        <span className="coin-face coin-back" />
      </span>
    </span>
  );
}
