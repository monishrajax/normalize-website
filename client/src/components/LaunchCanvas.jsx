import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HOTSPOTS } from "../data/hotspots";
import { useCart } from "../context/CartContext";
import Coin from "./Coin";

/* The opening stage.

   This is not a coin placed on a background. It is six transparent layers lit
   as one object — see .stage in styles/index.css for the paint order. The two
   stacked backdrop blurs are the thing that makes the frame read as a macro
   photograph rather than a page: real optical falloff, not a drawn vignette.

   three.js and gsap are imported dynamically so they stay out of the main
   bundle — a visitor who never scrolls past the hero never downloads them. */

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
     <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/></filter>
     <rect width="400" height="400" filter="url(#n)"/>
   </svg>`
)}")`;

export default function LaunchCanvas({ onNavigate }) {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const coinLayerRef = useRef(null);
  const hotspotLayerRef = useRef(null);
  const sceneRef = useRef(null);

  const { badge } = useCart();

  const [mode, setMode] = useState("pending");   // "webgl" | "fallback"
  const [grown, setGrown] = useState({});         // key -> true once sprouted
  const [isSmall, setIsSmall] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );

  /* Each branch draws itself in: the dash length has to come from the real
     measured path, so it is written onto the element as a custom property the
     stylesheet animates, with a 0.06s stagger between twigs. */
  const measurePath = useCallback((el, i) => {
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len}`;
    el.style.setProperty("--dash", `${len}`);
    el.style.transitionDelay = `${i * 0.06}s`;
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsSmall(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* ---- The stage responds to one pointer position ------------------------
     Five things move from a single coordinate. That is what makes the frame
     feel like a physical object under a light rather than a page with a hover
     effect: the lens window, the light pool, the 3D key light, the coin's
     parallax lean, and the idle glint standing down. */
  const setLight = useCallback((px, py) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--lx", px * 100 + "%");
    stage.style.setProperty("--ly", py * 100 + "%");
    stage.style.setProperty("--lens-x", px * 100 + "%");
    stage.style.setProperty("--lens-y", py * 100 + "%");
    // setPointer moves the key light, leans the coin, and pauses the glint.
    sceneRef.current?.setPointer((px - 0.5) * 2, (py - 0.5) * 2);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const coinLayer = coinLayerRef.current;
    if (!section || !stage || !coinLayer) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 768px)").matches;

    let cancelled = false;
    let cleanup = () => {};

    /* Branches sprout together and then STAY — no scroll staging. Under reduced
       motion they are simply there from the first frame. */
    const sproutTimers = HOTSPOTS.map((h) =>
      setTimeout(() => setGrown((g) => ({ ...g, [h.key]: true })), reduced ? 0 : h.sproutAt * 1000)
    );

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

      const scene = createCoinScene(coinLayer, { isSmall: small });
      if (!scene) { setMode("fallback"); return; }   // no WebGL — CSS coin stands in
      sceneRef.current = scene;
      setMode("webgl");

      /* ---- Pointer, with lens breath ----
         Pointer SPEED swells the mask radius to 105% of base and it eases back
         over 0.5s, so the window feels like it has weight. Bound only under
         (pointer: fine) — it is meaningless on touch and costs work. */
      const fine = window.matchMedia("(pointer: fine)").matches;
      let lastMove = { x: 0, y: 0, t: 0 };
      const baseR = small ? 140 : 220;
      let breathTween = null;

      const onMove = (e) => {
        const r = stage.getBoundingClientRect();
        const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        setLight(px, py);

        if (!fine || reduced) return;
        const now = performance.now();
        const dt = now - lastMove.t;
        if (lastMove.t && dt > 0) {
          const speed = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt;
          const swell = Math.min(1, speed / 2.2);
          breathTween?.kill();
          stage.style.setProperty("--lens-r", `${baseR * (1 + 0.05 * swell)}px`);
          breathTween = gsap.to({ v: 1 + 0.05 * swell }, {
            v: 1, duration: 0.5, ease: "power3.out",
            onUpdate() { stage.style.setProperty("--lens-r", `${baseR * this.targets()[0].v}px`); },
          });
        }
        lastMove = { x: e.clientX, y: e.clientY, t: now };
      };
      stage.addEventListener("pointermove", onMove);

      /* ---- Gyroscope replaces the pointer on mobile ----
         iOS requires the permission be requested from a user gesture, so it is
         asked lazily on the first touch of the stage — never on load. */
      let onOrient = null;
      const enableGyro = () => {
        if (onOrient) return;
        onOrient = (e) => {
          if (e.gamma == null || e.beta == null) return;
          const gx = Math.max(-0.35, Math.min(0.35, e.gamma / 60));
          const gy = Math.max(-0.35, Math.min(0.35, (e.beta - 45) / 80));
          setLight(0.5 + gx, 0.5 + gy);
        };
        window.addEventListener("deviceorientation", onOrient);
      };
      const onFirstTouch = () => {
        const DOE = window.DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === "function") {
          DOE.requestPermission().then((s) => { if (s === "granted") enableGyro(); }).catch(() => {});
        } else if (DOE) {
          enableGyro();
        }
      };
      stage.addEventListener("touchstart", onFirstTouch, { once: true, passive: true });

      const onResize = () => scene.resize();
      window.addEventListener("resize", onResize);

      /* ---- The toss into the header ----
         Over the first 320px the coin arcs up into the header, gaining spin
         from scroll velocity. At 98.5% it is physically REPARENTED into the
         header's clipped chassis — a real DOM boundary, so it cannot overflow,
         rather than a numeric clamp that can drift. */
      let docked = false;
      const dock = () => document.getElementById("header-coin-slot");

      const trigger = reduced ? null : ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "+=320",
        scrub: 0.6,
        pin: stage,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const p = self.progress;
          const slot = dock();
          const sw = stage.offsetWidth, sh = stage.offsetHeight;
          const box = slot?.getBoundingClientRect();

          if (p >= 0.985 && !docked && box?.width) {
            docked = true;
            slot.innerHTML = "";
            slot.appendChild(scene.canvas);
            scene.canvas.style.cssText =
              "position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline:none;";
            gsap.set(coinLayer, { clearProps: "all" });
            scene.resize();
          } else if (p < 0.985 && docked) {
            docked = false;
            coinLayer.appendChild(scene.canvas);
            scene.resize();
          }

          if (!docked) {
            const dx = box?.width ? (box.left + box.width / 2) - sw / 2 : 0;
            const dy = box?.width ? (box.top + box.height / 2) - sh / 2 : -sh / 2 + 34;
            const ease = p * p * (3 - 2 * p);
            // Arcing, not sliding: 46px above the straight line at the midpoint.
            const lift = Math.sin(p * Math.PI) * 46;
            const scale = box?.width
              ? 1 + (box.width / (Math.min(sw, sh) * 0.55) - 1) * ease
              : 1 - 0.9 * ease;
            gsap.set(coinLayer, { x: dx * ease, y: dy * ease - lift, scale, force3D: true });
          }

          // The branches belong to the coin at rest; they let go with the stage.
          if (hotspotLayerRef.current) {
            gsap.set(hotspotLayerRef.current, { opacity: Math.max(0, 1 - p * 2.4) });
          }
          scene.addSpin(self.getVelocity() * 0.00022);
        },
      });

      cleanup = () => {
        stage.removeEventListener("pointermove", onMove);
        stage.removeEventListener("touchstart", onFirstTouch);
        if (onOrient) window.removeEventListener("deviceorientation", onOrient);
        window.removeEventListener("resize", onResize);
        breathTween?.kill();
        trigger?.kill();
        scene.dispose();
        sceneRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      sproutTimers.forEach(clearTimeout);
      cleanup();
    };
  }, [setLight]);

  /* The brief's --nx offsets are fixed pixels hung off a percentage anchor, so
     they only clear the viewport above roughly 1090px. Below that "YOUR BAG"
     runs off the right edge — by 104px at the 769px breakpoint — and the live
     item count makes it worse as the number grows.

     Rather than re-tune the hand-placed bearings per breakpoint, each label is
     measured after layout and nudged back inside by however much it overhangs.
     The branch and its bearing are untouched; only the word moves. */
  const labelRefs = useRef(new Map());
  const clampLabels = useCallback(() => {
    const labels = [...labelRefs.current.values()].filter(Boolean);
    if (!labels.length) return;
    const MARGIN = 12;
    labels.forEach((el) => el.style.setProperty("--clamp", "0px"));
    // Measure them all before writing, so one correction cannot invalidate the
    // next one's rectangle.
    const shifts = labels.map((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < MARGIN) return MARGIN - r.left;
      if (r.right > window.innerWidth - MARGIN) return window.innerWidth - MARGIN - r.right;
      return 0;
    });
    labels.forEach((el, i) => {
      if (shifts[i]) el.style.setProperty("--clamp", `${Math.round(shifts[i])}px`);
    });
  }, []);

  useLayoutEffect(() => {
    clampLabels();
    /* Re-measure once the webfont lands. Archivo Expanded is materially wider
       than the fallback stack, so a label measured before it loads fits, then
       grows past the edge when it swaps in — which is exactly how "OUR STORY"
       escaped the viewport on a 375px screen. */
    document.fonts?.ready.then(clampLabels).catch(() => {});
    window.addEventListener("resize", clampLabels);
    return () => window.removeEventListener("resize", clampLabels);
  }, [clampLabels, isSmall, grown, badge]);

  const place = (h) => (isSmall ? h.mobile : h.desktop);

  return (
    /* No fixed height and no overflow clip on the SECTION: ScrollTrigger pins
       the stage inside a spacer taller than one viewport, and clipping the
       section leaves the pin nowhere to travel. */
    <section ref={sectionRef} aria-label="The Normalize coin" className="relative">
      <div ref={stageRef} className="stage">
        <div className="stage-echo" aria-hidden="true" />
        <div className="stage-lens" aria-hidden="true" />

        <div ref={coinLayerRef} className="stage-coin">
          {mode === "fallback" && (
            <div className="grid h-full w-full place-items-center">
              <Coin size="lg" interactive />
            </div>
          )}
        </div>

        <div className="stage-light" aria-hidden="true" />
        <div className="stage-dof" aria-hidden="true" />
        <div className="stage-dof2" aria-hidden="true" />
        <div className="stage-grain" aria-hidden="true" style={{ backgroundImage: GRAIN }} />

        <div ref={hotspotLayerRef} className="pointer-events-none absolute inset-0 z-[9]">
          {/* One gradient per branch — burnished, to polished, to burnished.
              The x1/y1/x2/y2 must be explicit or the sweep has nothing to run
              along. */}
          <svg width="0" height="0" aria-hidden="true" className="absolute">
            <defs>
              {HOTSPOTS.map((h) => (
                <linearGradient key={h.gradientId} id={h.gradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#6b5120" />
                  <stop offset=".38" stopColor="#f6e6a8" />
                  <stop offset=".62" stopColor="#caa649" />
                  <stop offset="1" stopColor="#4a370f" />
                </linearGradient>
              ))}
            </defs>
          </svg>

          {HOTSPOTS.map((h) => {
            const p = place(h);
            return (
              <div
                key={h.key}
                className={`hs ${grown[h.key] ? "hs-grown" : ""}`}
                style={{ left: p.hx, top: p.hy }}
              >
                <span className="hs-anchor" aria-hidden="true" />

                <svg
                  className="hs-branch"
                  viewBox="0 0 200 120"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  style={{
                    width: `${p.blen}px`,
                    height: `${p.blen * 0.62}px`,
                    transform: `translateY(-50%) rotate(${p.bang}deg)`,
                  }}
                >
                  <g stroke={`url(#${h.gradientId})`} fill="none" strokeLinecap="round">
                    {h.paths.map((path, i) => (
                      <path key={i} ref={(el) => measurePath(el, i)} d={path.d} strokeWidth={path.w} />
                    ))}
                  </g>
                </svg>

                <button
                  type="button"
                  onClick={() => onNavigate(h.target)}
                  aria-label={h.key === "cart" ? `${h.label} (${badge})` : h.label}
                  ref={(el) => labelRefs.current.set(h.key, el)}
                  className="hs-node pointer-events-auto"
                  style={{ "--nx": `${p.nx}px`, "--ny": `${p.ny}px` }}
                >
                  {h.label}
                  {h.key === "cart" && ` (${badge})`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
