import { useCallback, useEffect, useRef, useState } from "react";
import { WARDROBES } from "../data/wardrobes";

/* The showroom, as a place rather than a picture of one.

   After the hero the page meets a red velvet curtain. The section is tall and the stage
   inside it is `sticky`, so the page holds still on the stage while scrolling draws the
   curtain back from two gold mannequins on a lit stage. Choose one and the camera walks
   in, a wardrobe opens, and the clothes in it are photographs on a brass rod that sway
   toward the cursor under a spotlight that follows it.

   All of it is drawn by one WebGL canvas (lib/showroom/). This component is the page's
   half: it measures the header, turns the scroll position into two numbers for the
   scene, forwards the pointer, and lays real, focusable buttons over the figures, so
   the scene is usable by keyboard and by screen reader and not only by a mouse.

   The scene is imported lazily, just before the section scrolls into view, so none of
   three.js is paid for by a visitor who never gets this far.                           */

const EXTRA_SCROLL_VH = 170;   // how long the pinned stage holds the page, past its own height
const OPEN_FROM = 0.06;        // scroll progress at which the curtain starts to move...
const OPEN_TO = 0.74;          // ...and the progress at which it is fully drawn
const LIGHTS_FROM = 0.1;       // the stage lights come up with the curtain, so the first gap already glows
const LIGHTS_TO = 0.5;
const USABLE_AT = 0.78;        // how open it must be before the figures take clicks
const ASSETS = "/assets/showroom/";

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (t) => t * t * (3 - 2 * t);
const segment = (p, a, b) => clamp01((p - a) / (b - a));
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Showroom({ loadItem } = {}) {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const captionRef = useRef(null);
  const backRef = useRef(null);
  const hitRefs = useRef({});
  const glRef = useRef(null);
  const modeRef = useRef("stage");
  const lastWardrobe = useRef(null);
  const drag = useRef(null);
  const touchTimer = useRef(0);

  const [reduced] = useState(prefersReducedMotion);
  const [usable, setUsable] = useState(reduced);
  const [mode, setModeState] = useState("stage");            // stage | to-wardrobe | wardrobe | to-stage
  const [rects, setRects] = useState([]);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(null);

  const setMode = useCallback((m) => { modeRef.current = m; setModeState(m); }, []);

  /* ---- the scene: created just before it is needed, run only while it can be seen ---- */
  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!section || !stage || !canvas) return undefined;

    let disposed = false;
    let started = false;
    let visible = false;
    let gl = null;
    const header = document.querySelector("header");

    const dpr = () => Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2);
    const run = () => gl?.setRunning(visible && !document.hidden);

    const applyScroll = () => {
      const headerH = header ? header.getBoundingClientRect().height : 0;
      section.style.setProperty("--header-h", `${Math.round(headerH)}px`);
      let open = 1, lights = 1;
      if (!reduced) {
        const travel = section.offsetHeight - stage.offsetHeight;       // read after the write above
        const top = section.getBoundingClientRect().top;
        const p = travel > 0 ? clamp01((headerH - top) / travel) : 1;
        open = smooth(segment(p, OPEN_FROM, OPEN_TO));
        lights = smooth(segment(p, LIGHTS_FROM, LIGHTS_TO));
      }
      section.style.setProperty("--open", open.toFixed(4));
      gl?.setProgress(open, lights);
      setUsable(open >= USABLE_AT);
    };

    const measure = () => {
      if (!gl) return;
      const r = stage.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) gl.resize(r.width, r.height, dpr());
    };

    const start = async () => {
      if (started) return;
      started = true;
      try {
        const { createShowroom } = await import("../lib/showroom");
        if (disposed) return;
        gl = await createShowroom(canvas, {
          assetBase: ASSETS,
          garmentBase: `${ASSETS}garments/`,
          loadItem,
          caption: captionRef.current,
          reduced,
          onRects: setRects,
          onMode: (m) => setMode(m),
        });
        if (disposed) { gl.dispose(); return; }
        glRef.current = gl;
        measure();
        applyScroll();
        run();
        // two frames on, the canvas has drawn; until then CSS shows a closed curtain's colour
        requestAnimationFrame(() => requestAnimationFrame(() => { if (!disposed) section.dataset.ready = "1"; }));
      } catch (err) {
        // no WebGL (or it was refused): the showroom is a flourish, so the page simply goes on without it
        console.warn("[normalize] showroom unavailable:", err);
        if (!disposed) setFailed(true);
      }
    };

    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; applyScroll(); }); };
    applyScroll();

    // The opening coin intro has its own WebGL scene on screen; do not start a second one under
    // it. The intro marks itself with [data-intro] and removes itself when it lifts.
    let waiter = 0;
    const startWhenClear = () => {
      if (started || disposed) return;
      if (document.querySelector("[data-intro]")) { waiter = window.setTimeout(startWhenClear, 350); return; }
      start();
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !started && !waiter) startWhenClear();
        run();
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(section);

    const ro = new ResizeObserver(() => { measure(); schedule(); });
    ro.observe(stage);

    const onVisibility = () => run();
    const onLost = (e) => { e.preventDefault(); setFailed(true); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      clearTimeout(waiter);
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      glRef.current = null;
      gl?.dispose();
    };
  }, [reduced, loadItem, setMode]);

  /* ---- opening and closing a wardrobe ---- */
  const openWardrobe = (id) => {
    const gl = glRef.current;
    if (!gl || !usable || modeRef.current !== "stage") return;
    lastWardrobe.current = id;
    setHovered(null); gl.setHover(null);
    gl.enter(id, WARDROBES[id].items);
  };
  const closeWardrobe = useCallback(() => {
    if (modeRef.current === "wardrobe") glRef.current?.leave();
  }, []);

  // Focus goes into the wardrobe when it opens, and back to the figure that opened it.
  const prevMode = useRef("stage");
  useEffect(() => {
    if (mode === "wardrobe") backRef.current?.focus({ preventScroll: true });
    if (mode === "stage" && prevMode.current === "to-stage") {
      hitRefs.current[lastWardrobe.current]?.focus({ preventScroll: true });
    }
    prevMode.current = mode;
  }, [mode]);

  // Escape closes; the arrow keys move the light along the rod for anyone not using a mouse.
  useEffect(() => {
    if (mode !== "wardrobe") return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeWardrobe();
      else if (e.key === "ArrowRight") { e.preventDefault(); glRef.current?.nudge(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); glRef.current?.nudge(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, closeWardrobe]);

  /* ---- the pointer ---- */
  const toNdc = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
  };
  const onPointerMove = (e) => {
    const gl = glRef.current;
    if (!gl) return;
    const [x, y] = toNdc(e);
    if (e.pointerType === "touch" && drag.current) {
      gl.pan(e.clientX - drag.current.x);
      drag.current.x = e.clientX;
    }
    clearTimeout(touchTimer.current);
    gl.setPointer(x, y, true);
  };
  const onPointerDown = (e) => {
    if (e.pointerType === "touch") drag.current = { x: e.clientX };
    onPointerMove(e);
  };
  const endPointer = (e) => {
    drag.current = null;
    const gl = glRef.current;
    if (!gl) return;
    if (e.pointerType === "touch") {
      // a lifted finger leaves the light where it was for a moment, then it goes back to wandering
      clearTimeout(touchTimer.current);
      touchTimer.current = setTimeout(() => gl.setPointer(0, 0, false), 1800);
    } else gl.setPointer(0, 0, false);
  };
  useEffect(() => () => clearTimeout(touchTimer.current), []);

  const hover = (id) => { setHovered(id); glRef.current?.setHover(id); };

  if (failed) return null;

  const onStage = mode === "stage";

  return (
    <section
      id="showroom"
      ref={sectionRef}
      className="sw"
      data-reduced={reduced ? "1" : undefined}
      style={reduced ? undefined : { height: `calc(var(--stage-h) + ${EXTRA_SCROLL_VH}vh)` }}
      aria-label="Showroom"
    >
      <div
        ref={stageRef}
        className="sw-stage"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        <canvas ref={canvasRef} className="sw-canvas" aria-hidden="true" />

        {onStage && rects.map(({ id, rect }) => rect && (
          <button
            key={id}
            type="button"
            ref={(el) => { hitRefs.current[id] = el; }}
            className="sw-hit"
            data-hover={hovered === id ? "1" : "0"}
            disabled={!usable}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            onPointerEnter={() => hover(id)}
            onPointerLeave={() => hover(null)}
            onFocus={() => hover(id)}
            onBlur={() => hover(null)}
            onClick={() => openWardrobe(id)}
            aria-label={`Open the ${WARDROBES[id].title.toLowerCase()}'s wardrobe`}
          >
            <span className="sw-label" aria-hidden="true">{WARDROBES[id].title}</span>
          </button>
        ))}

        <div ref={captionRef} className="sw-caption" role="status" data-show="0" />

        {mode === "wardrobe" && (
          <button ref={backRef} type="button" className="sw-back" onClick={closeWardrobe}>
            <span aria-hidden="true">&larr;</span> Back
          </button>
        )}

        <div className="sw-cue" aria-hidden="true">Scroll</div>
      </div>
    </section>
  );
}
