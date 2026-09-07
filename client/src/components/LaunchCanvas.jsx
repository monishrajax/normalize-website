import { useCallback, useEffect, useRef, useState } from "react";
import { HOTSPOTS } from "../data/hotspots";
import { useCart } from "../context/CartContext";
import Coin from "./Coin";

/* The pinned launch stage.

   The coin opens FULL SIZE and face-on — there is no macro zoom-in to scroll
   through. What scroll does instead is toss the coin up into the header, where
   it docks onto the permanent header mark; the arc and the spin come from real
   scroll velocity rather than a canned tumble.

   three.js and gsap are imported dynamically so they stay out of the main
   bundle — a visitor who never scrolls past the hero never downloads them. */
export default function LaunchCanvas({ onNavigate }) {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const coinLayerRef = useRef(null);
  const branchLayerRef = useRef(null);
  const sceneRef = useRef(null);

  const { badge } = useCart();

  // "webgl" once the real coin is up; "fallback" for no-WebGL and for reduced
  // motion, where the CSS coin stands in and nothing is pinned.
  const [mode, setMode] = useState("pending");
  const [grown, setGrown] = useState(false);
  const [isSmall, setIsSmall] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );
  const [halo, setHalo] = useState({ r: 0, out: 96 });

  /* Each branch draws itself in: the dash length has to come from the real
     measured path, so it is written onto the element as a custom property the
     stylesheet animates. */
  const measurePath = useCallback((el) => {
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len}`;
    el.style.setProperty("--dash", `${len}`);
  }, []);

  /* Branch anchors sit on the coin's RIM, measured, so a branch always grows
     outward onto dark ground and is never stacked over the artwork. Both
     breakpoints are radial for that reason; what changes below 768px is the
     reach — a tighter halo around a smaller coin.

     COIN_RATIO mirrors `coinDiameterRatio` in lib/coinScene.js: the scene
     frames a 2-unit coin inside FRAME_EXTENT units, so the coin's diameter is
     that fraction of the stage's tighter axis. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsSmall(mq.matches);
    mq.addEventListener("change", onChange);

    const measure = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const COIN_RATIO = 2 / 3.6;
      const small = mq.matches;
      const min = Math.min(stage.clientWidth, stage.clientHeight);
      const coinRadius = (min * COIN_RATIO) / 2;
      setHalo({
        // Just inside the rim, so the branch reads as growing out of the metal.
        r: coinRadius * 0.94,
        out: small ? Math.min(104, coinRadius * 0.62) : Math.min(190, coinRadius * 0.78),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("resize", measure);
    };
  }, [isSmall]);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const coinLayer = coinLayerRef.current;
    if (!section || !stage || !coinLayer) return;

    // Honour the OS setting: no pin, no WebGL, no scroll hijacking. The CSS
    // coin and the branches still show — the brief's rule is that the branches
    // are always there, not that they must animate.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMode("fallback");
      setGrown(true);
      return;
    }

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

      const small = window.matchMedia("(max-width: 768px)").matches;
      const scene = createCoinScene(coinLayer, { isSmall: small });
      if (!scene) {                      // no WebGL — the CSS coin stands in
        setMode("fallback");
        setGrown(true);
        return;
      }
      sceneRef.current = scene;
      setMode("webgl");
      // One frame's grace so the dash lengths are on the elements before the
      // transition starts; otherwise the branches appear already drawn.
      requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));

      /* ---- The toss into the header ----
         Measured, not hardcoded: the dock is wherever the header's coin slot
         actually is, so it stays correct across breakpoints. */
      const dockTarget = () => {
        const slot = document.getElementById("header-coin-slot");
        const stageBox = stage.getBoundingClientRect();
        if (!slot || !slot.getBoundingClientRect().width) {
          // Below sm: the slot is hidden. Aim at where the wordmark sits.
          return { dx: 0, dy: -stageBox.height / 2 + 28, scale: 0.12 };
        }
        const slotBox = slot.getBoundingClientRect();
        const min = Math.min(stageBox.width, stageBox.height);
        const coinDiameter = min * (2 / 2.75);
        return {
          dx: (slotBox.left + slotBox.width / 2) - (stageBox.left + stageBox.width / 2),
          dy: (slotBox.top + slotBox.height / 2) - (stageBox.top + stageBox.height / 2),
          scale: slotBox.width / coinDiameter,
        };
      };

      let dock = dockTarget();

      const trigger = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: small ? "+=90%" : "+=100%",
        scrub: 0.6,
        pin: stage,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefresh: () => { dock = dockTarget(); },
        onUpdate: (self) => {
          const p = self.progress;

          /* Arc rather than slide: the coin is thrown UP first and only then
             carried to the dock, so the vertical component leads the
             horizontal one. */
          const lift = Math.sin(p * Math.PI) * (small ? 60 : 96);
          const ease = p * p * (3 - 2 * p);          // smoothstep
          const scale = 1 + (dock.scale - 1) * ease;

          gsap.set(coinLayer, {
            x: dock.dx * ease,
            y: dock.dy * ease - lift,
            scale,
            opacity: p > 0.92 ? Math.max(0, (1 - p) / 0.08) : 1,
            force3D: true,
          });

          // The branches belong to the coin at rest; they let go early.
          if (branchLayerRef.current) {
            gsap.set(branchLayerRef.current, {
              opacity: Math.max(0, 1 - p * 2.4),
              y: -lift * 0.35,
            });
          }

          // Spin proportional to how hard the page is being scrolled.
          scene.addSpin(self.getVelocity() * 0.00022);
        },
      });

      const onResize = () => { scene.resize(); dock = dockTarget(); };
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

  /* Each branch keeps its own hand-set bearing — they are deliberately not
     evenly spaced — but the distance along it is measured from the coin. */
  const placement = (h) => {
    const rad = (h.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      style: {
        left: "50%",
        top: "50%",
        marginLeft: `${cos * halo.r}px`,
        marginTop: `${sin * halo.r}px`,
      },
      nx: `${cos * halo.out}px`,
      ny: `${sin * halo.out}px`,
      // The silhouettes are drawn left-to-right in their own box; rotating to
      // the bearing is what makes them actually grow toward the label.
      angle: h.angle,
      // Labels on the left half are pushed further so they end, not begin, at
      // the branch tip.
      flip: cos < 0,
    };
  };

  return (
    /* The section deliberately has NO fixed height and no overflow clipping.
       ScrollTrigger pins the stage by wrapping it in a pin-spacer taller than
       one viewport (viewport + scroll distance); an `h-screen overflow-hidden`
       section clips that spacer, and the pin then has nowhere to travel. The
       stage carries the viewport height, and the section takes its height from
       the spacer. */
    <section
      ref={sectionRef}
      aria-label="The Normalize coin"
      className="relative bg-ink"
    >
      <div ref={stageRef} className="relative h-screen w-full overflow-hidden">
        {/* The coin layer is what gets tossed; keeping it separate from the
            branches means the transform doesn't drag the labels along. */}
        <div ref={coinLayerRef} className="absolute inset-0">
          {mode === "fallback" && (
            <div className="grid h-full w-full place-items-center">
              <Coin size="lg" interactive />
            </div>
          )}
        </div>

        <div ref={branchLayerRef} className="absolute inset-0">
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

          {HOTSPOTS.map((h) => {
            const place = placement(h);
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => onNavigate(h.target)}
                /* The bag branch carries a live count, so its accessible name
                   has to carry it too. */
                aria-label={h.key === "cart" ? `${h.label} (${badge})` : h.label}
                style={place.style}
                className={`group absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center
                            transition-opacity duration-700 ease-(--ease-out)
                            ${grown ? "branch-grown opacity-100" : "opacity-0"}`}
              >
                {/* Anchor node on the coin's surface */}
                <span className="block h-2 w-2 rounded-full bg-gold-light shadow-[0_0_12px_3px_rgba(214,175,55,0.55)]" />

                {/* The branch, drawing itself toward the label */}
                {/* The silhouette is pinned by its LEFT edge to the anchor and
                    rotated about that point, so the branch grows out of the
                    coin's rim rather than floating near it. Its width is the
                    exact distance to the label, so tip and label meet. */}
                <svg
                  viewBox="0 0 200 120"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-1/2 opacity-90"
                  style={{
                    width: `${halo.out}px`,
                    height: "120px",
                    transformOrigin: "0 50%",
                    transform: `translateY(-50%) rotate(${place.angle}deg)`,
                  }}
                >
                  <g stroke="url(#branch-metal)" fill="none" strokeLinecap="round">
                    {h.paths.map((p, j) => (
                      <path
                        key={j}
                        ref={measurePath}
                        d={p.d}
                        strokeWidth={p.w}
                        className="branch-path"
                        style={{ transitionDelay: `${j * 130}ms` }}
                      />
                    ))}
                  </g>
                </svg>

                {/* Label at the branch tip. Archivo Expanded — one of the two
                    places on the site not set in the typewriter. */}
                <span
                  className="branch-label absolute text-[11px] whitespace-nowrap text-gold-light
                             uppercase transition-colors group-hover:text-white-warm"
                  style={{
                    transform:
                      `translate(${place.nx}, ${place.ny}) ` +
                      `translateX(${place.flip ? "-100%" : "0"})`,
                  }}
                >
                  {h.label}
                  {h.key === "cart" && (
                    <span className="ml-1.5 tabular-nums text-gold">({badge})</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-center">
          <p className="text-[10px] tracking-[0.24em] text-gold-light/70 uppercase">Scroll</p>
          <span className="mx-auto mt-2 block h-8 w-px bg-linear-to-b from-gold-light/60 to-transparent" />
        </div>
      </div>
    </section>
  );
}
