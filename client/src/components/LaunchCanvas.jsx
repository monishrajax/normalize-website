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

/* Where a branch's tip is, for one breakpoint. Pure, so the layout effect
   that fits labels and the render that places them cannot disagree.
   `tip` is the distance along the bearing — see place() for the derivation. */
/* Air between the twig's round cap and the first glyph. The CSS adds the
   same 2px inside --tip; keep the two together. */
const TIP_AIR = 2;

function geometry(h, small) {
  const p = small ? h.mobile : h.desktop;
  const rad = (p.bang * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const horizontal = Math.abs(cos) >= Math.abs(sin);
  return { ...p, cos, sin, horizontal, tip: p.blen * 0.985 };
}

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

      /* Do not measure anything until the stage has a real size.

         ScrollTrigger's pin bakes the element's measured width and height into
         its inline style. Measured at zero — a background tab, a collapsed
         window, mobile chrome mid-settle — it writes `width:0;height:0` and
         NEVER recovers: a later resize does not undo it, so the coin and the
         whole stage stay invisible until a reload. Waiting for a non-zero box
         costs a frame and removes the failure mode entirely. */
      const hasSize = () => stage.clientWidth > 0 && stage.clientHeight > 0;
      if (!hasSize()) {
        await new Promise((resolve) => {
          const ro = new ResizeObserver(() => { if (hasSize()) { ro.disconnect(); resolve(); } });
          ro.observe(stage);
        });
        if (cancelled) return;
      }

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

      /* Re-fit the stage when the viewport changes size.

         The stage's box comes from the VIEWPORT — .stage is 100vh and fills its
         column — and once ScrollTrigger pins it, that measured box is frozen
         into its inline style. Nothing undoes that on its own: a window resized
         from 375px to 1280px leaves a 375px stage sitting in a 1280px page
         until something calls refresh(). So this has to.

         It cannot watch the stage to decide. The stage's size only changes as a
         RESULT of the refresh below, so an observer on it waits for the effect
         of the event it is meant to fire and never runs once — which is exactly
         how that frozen 375px box survived.

         documentElement is a tick source only; the comparison is against the
         viewport, so a panel opening (which lengthens the document) cannot
         trigger a refresh. Height alone is ignored on touch, where it usually
         means mobile chrome sliding away — refreshing a pin mid-scroll over
         that makes the stage jump under the finger. */
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      let lastW = window.innerWidth, lastH = window.innerHeight;
      const refit = () => {
        const w = window.innerWidth, h = window.innerHeight;
        if (!w || !h) return;
        if (Math.abs(w - lastW) < 2 && (Math.abs(h - lastH) < 2 || coarse)) return;
        lastW = w; lastH = h;
        scene.resize();
        ScrollTrigger.refresh();
      };
      window.addEventListener("resize", refit);
      const ro = new ResizeObserver(refit);
      ro.observe(document.documentElement);

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
        window.removeEventListener("resize", refit);
        ro.disconnect();
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

  /* Keep every label on screen WITHOUT letting go of its branch.

     A wide label — "YOUR BAG (12)" on a 1024px window — overhangs the right
     edge. The first version of this slid the word back inside and left the
     branch where it was, which is exactly how the twig ended up pointing at
     empty air 40px from the word. The word and the tip have to move together,
     so the correction is applied to the branch's REACH: a shorter branch puts
     its tip, and therefore the word hanging off it, further in. The silhouette
     scales with it, which reads as a slightly smaller branch, not a broken one.

     Reach is floored so a branch can never shrink into a stub; only past that
     floor does the word slide on its own, and only along the axis where the
     tip still touches it — a near-vertical branch meets the word's top or
     bottom EDGE, so sliding the word along that edge keeps them connected.

     NOTHING here reads the label's rectangle. Its transform is transitioned
     (with a half-second delay, for the entrance), so a rect read right after a
     write reports where the word WAS — and a fit that measured it applied the
     same 23px twice, once as reach and again as a slide, and parked the word
     23px short of its twig. The rect is instead predicted from things that do
     not animate: the anchor's position, the reach, the alignment rule and the
     label's own layout width. A zero-width viewport is skipped outright — a
     fit against a 0px window shoves every label off the left edge, and only a
     real resize would ever undo it. */
  const labelRefs = useRef(new Map());
  const fitLabels = useCallback(() => {
    const vw = window.innerWidth;
    if (!vw) return;
    const MARGIN = 12, MIN_REACH = 0.6;

    for (const [key, el] of labelRefs.current) {
      if (!el) continue;
      const hs = el.parentElement;
      const g = geometry(HOTSPOTS.find((h) => h.key === key), isSmall);
      const w = el.offsetWidth;
      const anchorX = hs.getBoundingClientRect().left;

      // Mirrors the CSS: --tip along the bearing, then --ax on the word.
      const wordLeft = (reach) => {
        const tipX = anchorX + (g.tip * reach + TIP_AIR) * g.cos;
        if (!g.horizontal) return tipX - w / 2;
        return g.cos < 0 ? tipX - w : tipX;
      };
      const overhang = (left) => {
        if (left < MARGIN) return MARGIN - left;                   // +: needs to go right
        if (left + w > vw - MARGIN) return vw - MARGIN - (left + w);   // −: needs to go left
        return 0;
      };

      let reach = 1;
      let over = overhang(wordLeft(1));
      if (over && g.horizontal) {
        // Only the tip's x component fixes an x overhang.
        reach = Math.max(MIN_REACH, 1 - Math.abs(over) / (g.tip * Math.abs(g.cos)));
        over = overhang(wordLeft(reach));   // whatever the floor could not absorb
      }
      hs.style.setProperty("--reach", String(reach));
      el.style.setProperty("--clamp", `${Math.round(over)}px`);
    }
  }, [isSmall]);

  useLayoutEffect(() => {
    fitLabels();
    /* Re-measure once the webfont lands. Archivo Expanded is materially wider
       than the fallback stack, so a label measured before it loads fits, then
       grows past the edge when it swaps in — which is exactly how "OUR STORY"
       escaped the viewport on a 375px screen. */
    document.fonts?.ready.then(fitLabels).catch(() => {});
    window.addEventListener("resize", fitLabels);
    return () => window.removeEventListener("resize", fitLabels);
  }, [fitLabels, isSmall, grown, badge]);

  /* Where the branch ends, and how the word hangs off it.

     The silhouette is drawn in a 200×120 box with its trunk running left to
     right along y = 60 and its far tip at x ≈ 197, then the box is scaled to
     `blen` wide and rotated to `bang` about its left-centre. The tip is
     therefore 0.985·blen along the bearing — pure geometry, so there is
     nothing to hand-tune and nothing that can drift from the drawing.

     The word is then aligned so the tip lands on the END of it, on the
     word's own mid-line: a branch reaching left meets the word's right edge,
     one reaching right meets its left edge, both at half the word's height.
     A branch closer to vertical than horizontal instead meets the word's top
     or bottom edge, centred. The old top-left anchor plus a 16px gap put the
     tip at the word's CORNER, 8px past it, and on the bag branch 29px above
     the first letter — a twig pointing at the word rather than into it. */
  const place = (h) => {
    const g = geometry(h, isSmall);
    let ax = "-50%", ay = "-50%";
    if (g.horizontal) ax = g.cos < 0 ? "-100%" : "0%";   // word ends / starts at the tip
    else              ay = g.sin < 0 ? "-100%" : "0%";   // word sits above / below it
    return { ...g, ax, ay };
  };

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
          {/* One gradient per branch: burnished -> polished -> burnished along
              the stroke, lifted out of the muddy end of the range. The dark
              stops used to be dark enough that a thin twig read as brown
              pencil rather than metal. x1/y1/x2/y2 must stay explicit —
              without an axis the gradient has nothing to run along. */}
          <svg width="0" height="0" aria-hidden="true" className="absolute">
            <defs>
              {HOTSPOTS.map((h) => (
                <linearGradient key={h.gradientId} id={h.gradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#9a7726" />
                  <stop offset=".22" stopColor="#e4c65f" />
                  <stop offset=".42" stopColor="#fff6d8" />
                  <stop offset=".62" stopColor="#e8d391" />
                  <stop offset=".82" stopColor="#caa649" />
                  <stop offset="1" stopColor="#8a6a1c" />
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
                /* The branch box and the label both read their geometry from
                   here, so the tip and the word cannot be placed from two
                   different numbers. --reach is written by fitLabels. */
                style={{
                  left: p.hx, top: p.hy,
                  "--blen": `${p.blen}px`, "--bang": `${p.bang}deg`,
                  "--cos": p.cos, "--sin": p.sin,
                }}
              >
                <span className="hs-anchor" aria-hidden="true" />

                <svg
                  className="hs-branch"
                  viewBox="0 0 200 120"
                  preserveAspectRatio="none"
                  aria-hidden="true"
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
                  style={{ "--ax": p.ax, "--ay": p.ay }}
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
