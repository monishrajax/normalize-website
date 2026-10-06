import { useEffect, useRef, useState } from "react";

/* The opening: a black curtain over the whole site while the coin drops in,
   spins and comes at the screen (lib/introScene.js), then lifts on the page.

   The real page is mounted underneath from the first frame — the catalogue,
   the gate's video and the launch canvas all load WHILE this plays, which is
   the point of it being a loading sequence rather than a delay.

   It never holds the visitor hostage:
     · reduced motion, or no WebGL        -> no intro at all
     · the coin's artwork not ready in 3.5s -> lifts straight away
     · a hard ceiling of 9s, whatever happens
     · a tap, click, Enter or Esc skips it
   three.js is imported dynamically so none of it is in the main bundle. */

const READY_TIMEOUT_MS = 3500;
const HARD_LIMIT_MS = 9000;
const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function IntroCurtain() {
  const [active, setActive] = useState(() => !reducedMotion());
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

    import("../lib/introScene")
      .then(async ({ createIntroScene }) => {
        if (cancelled) return;
        const s = createIntroScene(host, { isSmall: window.matchMedia("(max-width: 768px)").matches });
        if (!s) return finish();
        scene = s;
        const ready = await Promise.race([
          s.ready.then(() => true),
          new Promise((r) => setTimeout(() => r(false), READY_TIMEOUT_MS)),
        ]);
        if (cancelled) return;
        if (!ready) return finish();
        s.update(0);
        s.play(finish);
      })
      .catch(finish);

    return () => {
      cancelled = true;
      clearTimeout(hardStop);
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
