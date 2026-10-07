import { useEffect, useRef, useState } from "react";

/* The opening: a black curtain over the whole site while the coin drops in,
   spins and comes at the screen (lib/introScene.js), then lifts on the page.

   The real page is mounted underneath from the first frame — the catalogue,
   the gate's video and the launch canvas all load WHILE this plays, which is
   the point of it being a loading sequence rather than a delay.

   It never holds the visitor hostage, and it is the first thing to give way
   when a device or connection is struggling:
     · reduced motion, Save-Data, a 2G link, or no WebGL -> no intro at all
     · not able to START within 3s (slow network or CPU)   -> lifts straight away
     · a hard ceiling of 9s, whatever happens
     · a tap, click, Enter or Esc skips it
   three.js is imported dynamically so none of it is in the main bundle. */

const START_DEADLINE_MS = 3000;
const HARD_LIMIT_MS = 9000;
const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* A decorative intro is the first thing to give up on a metered or very slow
   link: the visitor asked for less data, or can barely load the page at all. */
function connectionIsConstrained() {
  const c = typeof navigator !== "undefined" && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
  return Boolean(c) && (c.saveData === true || /2g$/.test(c.effectiveType || ""));
}
const wantsIntro = () => !reducedMotion() && !connectionIsConstrained();

/* Start fetching three.js and the coin artwork the moment this bundle runs,
   instead of after React has mounted and painted. The same import() later in
   the effect resolves instantly from the module cache, and the faces are
   already in the HTTP cache when the scene asks for them. */
if (typeof window !== "undefined" && wantsIntro()) {
  import("../lib/introScene").catch(() => { /* the effect below handles failure */ });
  for (const src of ["/assets/coin-front.webp", "/assets/coin-back.webp"]) new Image().src = src;
}

export default function IntroCurtain() {
  const [active, setActive] = useState(wantsIntro);
  const hostRef = useRef(null);

  useEffect(() => {
    /* index.html paints a black curtain before any script runs so there is no
       flash of the cream page; the React one below is identical, so the hand
       over is invisible. */
    const boot = document.getElementById("boot-curtain");
    if (!active) { boot?.remove(); return; }
    boot?.remove();

    const host = hostRef.current;
    let cancelled = false;
    let finished = false;
    let started = false;
    let scene = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      scene?.dispose();
      scene = null;
      setActive(false);
    };
    const skip = () => (scene ? scene.skip() : finish());

    /* The page underneath is live but must not scroll while it is hidden. */
    const onWheel = (e) => e.preventDefault();
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") skip();
      else if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    };
    host.addEventListener("pointerdown", skip);
    host.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    const hardStop = setTimeout(finish, HARD_LIMIT_MS);
    const startDeadline = setTimeout(() => { if (!started) finish(); }, START_DEADLINE_MS);

    import("../lib/introScene")
      .then(async ({ createIntroScene }) => {
        if (cancelled) return;
        const s = createIntroScene(host, { isSmall: window.matchMedia("(max-width: 768px)").matches });
        if (!s) return finish();
        scene = s;
        await s.ready;
        if (cancelled || finished) return;
        s.update(0);
        started = true;
        s.play(finish);
      })
      .catch(finish);

    return () => {
      cancelled = true;
      clearTimeout(hardStop);
      clearTimeout(startDeadline);
      host.removeEventListener("pointerdown", skip);
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      scene?.dispose();
      scene = null;
    };
  }, [active]);

  if (!active) return null;
  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 10000, background: "#000",
        touchAction: "none", overscrollBehavior: "contain", cursor: "pointer",
      }}
    />
  );
}
