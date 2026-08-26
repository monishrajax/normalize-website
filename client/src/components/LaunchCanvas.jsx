import { useEffect, useRef, useState } from "react";
import { HOTSPOTS } from "../data/hotspots";

/* Phase 1: the pinned macro-lens intro. The camera starts pressed against the
   coin's surface and pulls back as you scroll, while three branches grow out of
   it toward their labels.

   three.js and gsap are imported dynamically so they stay out of the main
   bundle — a visitor who never scrolls past the hero never downloads them. */
export default function LaunchCanvas({ onNavigate }) {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    // Honour the OS setting: no pin, no WebGL, no scroll hijacking.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      const [{ createCoinScene }, gsapMod, stMod] = await Promise.all([
        import("../lib/coinScene"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      const gsap = gsapMod.gsap || gsapMod.default;
      const ScrollTrigger = stMod.ScrollTrigger || stMod.default;
      gsap.registerPlugin(ScrollTrigger);

      const isSmall = window.matchMedia("(max-width: 768px)").matches;
      const scene = createCoinScene(stage, { isSmall });
      if (!scene) return;                 // no WebGL — leave the section empty
      sceneRef.current = scene;
      setReady(true);

      const trigger = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: isSmall ? "+=90%" : "+=100%",
        scrub: 0.6,
        pin: stage,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => scene.setProgress(self.progress),
      });

      const onResize = () => scene.resize();
      window.addEventListener("resize", onResize);

      const onPointerMove = (e) => {
        const r = stage.getBoundingClientRect();
        scene.setPointer(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          ((e.clientY - r.top) / r.height) * 2 - 1
        );
      };
      stage.addEventListener("pointermove", onPointerMove);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        stage.removeEventListener("pointermove", onPointerMove);
        trigger.kill();
        scene.dispose();
        sceneRef.current = null;
      };
    })();

    return () => { cancelled = true; cleanup(); };
  }, []);

  return (
    /* The section deliberately has NO fixed height and no overflow clipping.
       ScrollTrigger pins the stage by wrapping it in a pin-spacer taller than
       one viewport (viewport + scroll distance); an `h-screen overflow-hidden`
       section clips that spacer, and the pin then has nowhere to travel. The
       stage carries the viewport height, and the section takes its height from
       the spacer. */
    <section
      ref={sectionRef}
      aria-label="The Normalize coin, up close"
      className="relative bg-ink"
    >
      <div ref={stageRef} className="relative h-screen w-full overflow-hidden">
        {/* Metallic gradient shared by every branch. */}
        <svg width="0" height="0" aria-hidden="true" className="absolute">
          <defs>
            <linearGradient id="branch-metal" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6b5120" />
              <stop offset=".38" stopColor="#f6e6a8" />
              <stop offset=".62" stopColor="#caa649" />
              <stop offset="1" stopColor="#4a370f" />
            </linearGradient>
          </defs>
        </svg>

        {HOTSPOTS.map((h, i) => (
          <button
            key={h.key}
            type="button"
            onClick={() => onNavigate(h.target)}
            aria-label={h.label}
            style={{
              left: h.x,
              top: h.y,
              transitionDelay: `${400 + i * 180}ms`,
              "--nx": h.nx,
              "--ny": h.ny,
            }}
            className={`group absolute -translate-x-1/2 -translate-y-1/2
                        transition-opacity duration-1000 ease-(--ease-out)
                        ${ready ? "opacity-100" : "opacity-0"}`}
          >
            {/* Anchor node on the coin's surface */}
            <span className="block h-2 w-2 rounded-full bg-gold-light shadow-[0_0_12px_3px_rgba(214,175,55,0.55)]" />

            {/* The branch, growing toward the label */}
            <svg
              viewBox="0 0 200 120"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 h-[120px] w-[200px]
                         -translate-y-1/2 opacity-90"
              style={{
                transform: `translate(calc(-50% + ${h.nx} / 2), calc(-50% + ${h.ny} / 2))`,
              }}
            >
              <g stroke="url(#branch-metal)" fill="none" strokeLinecap="round">
                {h.paths.map((p, j) => (
                  <path key={j} d={p.d} strokeWidth={p.w} />
                ))}
              </g>
            </svg>

            {/* Label at the branch tip */}
            <span
              className="absolute font-display text-sm tracking-[0.14em] whitespace-nowrap
                         text-gold-light transition-colors group-hover:text-white-warm"
              style={{ transform: `translate(${h.nx}, ${h.ny})` }}
            >
              {h.label}
            </span>
          </button>
        ))}

        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-center">
          <p className="text-[10px] tracking-[0.24em] text-gold-light/70 uppercase">Scroll</p>
          <span className="mx-auto mt-2 block h-8 w-px bg-linear-to-b from-gold-light/60 to-transparent" />
        </div>
      </div>
    </section>
  );
}
