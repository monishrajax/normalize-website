/* The macOS "Genie": a product image warping into the header bag icon.

   This is deliberately plain DOM + the Web Animations API rather than anything
   React-shaped. The flier is a throwaway node in the top layer that outlives no
   render, and driving it from script means the badge can be held back until
   `finished` resolves — the brief's rule is that the count updates when the
   animation COMPLETES, never mid-flight. */

const STEPS = 16;

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Quadratic bezier. The control point sits above the straight line between the
   product and the bag, which is what makes the flight arc up and over rather
   than slide diagonally. */
function arc(from, to, t) {
  const lift = Math.min(240, Math.abs(to.x - from.x) * 0.42 + 120);
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - lift;
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
  };
}

/* Ease the parameter itself so the image leaves slowly, crosses the gap fast,
   and settles into the icon — a constant-rate bezier walk reads mechanical. */
const easeT = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Fly `sourceEl`'s artwork into `targetEl`.
 * Resolves when the animation has finished — or immediately, having done
 * nothing visible, when either element is missing or motion is reduced.
 */
export function flyToBag(sourceEl, targetEl, imageSrc) {
  if (!sourceEl || !targetEl || prefersReducedMotion()) return Promise.resolve();

  const from = sourceEl.getBoundingClientRect();
  const to = targetEl.getBoundingClientRect();
  if (!from.width || !to.width) return Promise.resolve();

  const flier = document.createElement("div");
  flier.className = "genie-flier";
  flier.setAttribute("aria-hidden", "true");
  flier.style.left = `${from.left}px`;
  flier.style.top = `${from.top}px`;
  flier.style.width = `${from.width}px`;
  flier.style.height = `${from.height}px`;
  flier.style.background = imageSrc
    ? `center/cover no-repeat url("${CSS.escape ? imageSrc.replace(/"/g, '\\"') : imageSrc}")`
    : "var(--color-cream-dark)";
  document.body.appendChild(flier);

  // Travel is measured centre-to-centre; the flier's own shrink is applied on
  // top, so the artwork stays aimed at the icon the whole way in.
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const end = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
  const endScaleX = Math.max(0.06, (to.width * 0.62) / from.width);
  const endScaleY = Math.max(0.06, (to.height * 0.62) / from.height);

  const frames = [];
  for (let i = 0; i <= STEPS; i++) {
    const raw = i / STEPS;
    const t = easeT(raw);
    const p = arc(start, end, t);

    /* The warp: the image necks horizontally well before it loses height, the
       way a genie effect pinches a window into the dock, and only collapses on
       the last third of the flight. */
    const pinch = Math.pow(t, 0.7);
    const sx = 1 + (endScaleX - 1) * pinch;
    const sy = 1 + (endScaleY - 1) * Math.pow(t, 1.9);

    frames.push({
      offset: raw,
      transform:
        `translate(${p.x - start.x}px, ${p.y - start.y}px) ` +
        `scale(${sx}, ${sy}) rotate(${t * 18}deg)`,
      borderRadius: `${t * 50}%`,
      opacity: t > 0.86 ? (1 - t) / 0.14 : 1,
    });
  }

  const animation = flier.animate(frames, {
    duration: 780,
    easing: "linear",          // the easing lives in easeT, not here
    fill: "forwards",
  });

  const land = () => {
    flier.remove();
    targetEl.classList.remove("bag-catch");
    // Reflow so the class re-triggers when two items are added in a row.
    void targetEl.offsetWidth;
    targetEl.classList.add("bag-catch");
    setTimeout(() => targetEl.classList.remove("bag-catch"), 500);
  };

  /* Land exactly once, and never wait forever to do it.

     A document that stops being rendered — a backgrounded tab, a collapsed
     window — can stall the animation timeline, and `finished` then never
     settles, not even once the document is visible again. The bag badge is held
     back until this promise resolves, and that hold is a COUNTER: one stalled
     flight freezes the count for the rest of the session, so every later add
     also fails to show up. Racing a timeout costs nothing when the animation
     behaves — landing late is invisible, where never landing is a permanently
     wrong number on screen. Timers are throttled in a hidden tab too, but they
     do still fire, which is the whole point. */
  let landed = false;
  const once = () => { if (landed) return; landed = true; land(); };

  return Promise.race([
    animation.finished.catch(() => {}),   // a cancelled animation must still settle
    new Promise((resolve) => setTimeout(resolve, 1400)),   // duration + slack
  ]).then(once);
}
