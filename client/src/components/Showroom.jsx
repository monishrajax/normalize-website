import { useCallback, useEffect, useRef, useState } from "react";
import { Man, Woman } from "./Figures";
import Wardrobe from "./Wardrobe";
import { WARDROBES } from "../data/wardrobes";

/* The scroll-opened curtain and the two wardrobes behind it.

   After the hero the page meets a red curtain. The section is tall and the
   stage inside it is `sticky`, so the page holds still on the stage while the
   scroll position draws the curtain back, revealing a man and a woman
   standing on a lit stage. Choose one and a wardrobe opens, with their
   clothes hung along a rod. Keep scrolling and the page carries on to the
   catalogue.

   The scroll position becomes two plain numbers on the section element, --open
   and --lights (see the `.sr` rules in styles/index.css). Nothing re-renders
   per scroll frame: React only hears about it when the curtain has opened far
   enough for the figures to be clickable. */

const EXTRA_SCROLL_VH = 170;   // how long the pinned stage holds the page, past its own height
const OPEN_FROM = 0.06;        // scroll progress at which the curtain starts to move...
const OPEN_TO = 0.74;          // ...and the progress at which it is fully drawn
const LIGHTS_FROM = 0.1;      // the stage lights come up with the curtain, so the first gap already glows
const LIGHTS_TO = 0.5;
const USABLE_AT = 0.78;        // how open it must be before the figures take clicks
const CLOSE_MS = 1300;         // doors shut (1.15s) + the wardrobe fades before it unmounts

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (t) => t * t * (3 - 2 * t);
const segment = (p, a, b) => clamp01((p - a) / (b - a));
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FIGURES = [
  { id: "men", Art: Man },
  { id: "women", Art: Woman },
];

export default function Showroom() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const [reduced] = useState(prefersReducedMotion);
  const [usable, setUsable] = useState(reduced);      // curtain open enough to use the figures
  const [view, setView] = useState(null);             // null | { id, closing }
  const figureRefs = useRef({});
  const backRef = useRef(null);

  /* ---- scroll -> --open / --lights ---- */
  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    const header = document.querySelector("header");
    let raf = 0;

    const apply = () => {
      raf = 0;
      // The header is sticky and the stage pins just beneath it.
      const headerH = header ? header.getBoundingClientRect().height : 0;
      section.style.setProperty("--header-h", `${Math.round(headerH)}px`);

      let open = 1;
      let lights = 1;
      if (!reduced) {
        const run = section.offsetHeight - stage.offsetHeight;   // read after the write above
        const top = section.getBoundingClientRect().top;
        const p = run > 0 ? clamp01((headerH - top) / run) : 1;
        open = smooth(segment(p, OPEN_FROM, OPEN_TO));
        lights = smooth(segment(p, LIGHTS_FROM, LIGHTS_TO));
      }
      section.style.setProperty("--open", open.toFixed(4));
      section.style.setProperty("--lights", lights.toFixed(4));
      setUsable(open >= USABLE_AT);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [reduced]);

  /* ---- opening and closing a wardrobe ---- */
  const openWardrobe = (id) => setView({ id, closing: false });
  const closeWardrobe = useCallback(() => {
    setView((v) => (v && !v.closing ? { ...v, closing: true } : v));
  }, []);

  // After the doors have shut, remove the wardrobe and hand focus back to the
  // figure that opened it.
  useEffect(() => {
    if (!view?.closing) return;
    const { id } = view;
    const t = setTimeout(() => {
      setView(null);
      figureRefs.current[id]?.focus({ preventScroll: true });
    }, reduced ? 0 : CLOSE_MS);
    return () => clearTimeout(t);
  }, [view, reduced]);

  const wardrobeOpen = Boolean(view && !view.closing);

  // Move focus into the wardrobe when it opens; Escape shuts it.
  useEffect(() => {
    if (!wardrobeOpen) return;
    backRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") closeWardrobe(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wardrobeOpen, view?.id, closeWardrobe]);

  return (
    <section
      id="showroom"
      ref={sectionRef}
      className="sr"
      data-reduced={reduced ? "1" : undefined}
      style={reduced ? undefined : { height: `calc(var(--stage-h) + ${EXTRA_SCROLL_VH}vh)` }}
      aria-label="Showroom"
    >
      <div ref={stageRef} className="sr-stage">
        <div className="sr-scene" aria-hidden="true">
          <div className="sr-spot sr-spot-l" />
          <div className="sr-spot sr-spot-r" />
          <div className="sr-floor" />
        </div>

        <div className="sr-title" data-hidden={wardrobeOpen ? "1" : "0"}>
          <p className="sr-eyebrow">The showroom</p>
          <h2 className="sr-heading">Choose a wardrobe.</h2>
        </div>

        <div
          className="sr-lineup"
          role="group"
          aria-label="Choose a wardrobe"
          data-hidden={wardrobeOpen ? "1" : "0"}
        >
          {FIGURES.map(({ id, Art }) => (
            <button
              key={id}
              type="button"
              ref={(el) => { figureRefs.current[id] = el; }}
              className="sr-figure"
              disabled={!usable}
              onClick={() => openWardrobe(id)}
              aria-label={`Open the ${WARDROBES[id].title.toLowerCase()}'s wardrobe`}
            >
              <span className="sr-art"><Art /></span>
              <span className="sr-figure-label">{WARDROBES[id].title}</span>
              <span className="sr-figure-hint">Open the wardrobe</span>
            </button>
          ))}
        </div>

        {view && (
          <>
            <div className="wd-bar">
              <button ref={backRef} type="button" className="wd-btn" onClick={closeWardrobe}>
                <span aria-hidden="true">&larr;</span> Back
              </button>
              <div className="wd-toggle" role="group" aria-label="Switch wardrobe">
                {FIGURES.map(({ id }) => (
                  <button
                    key={id}
                    type="button"
                    className="wd-btn"
                    aria-pressed={view.id === id && !view.closing}
                    onClick={() => (view.id === id && !view.closing ? null : openWardrobe(id))}
                  >
                    {WARDROBES[id].title}
                  </button>
                ))}
              </div>
            </div>
            <Wardrobe key={view.id} id={view.id} closing={view.closing} />
          </>
        )}

        <div className="sr-curtain sr-curtain-l" aria-hidden="true" />
        <div className="sr-curtain sr-curtain-r" aria-hidden="true" />
        <div className="sr-valance" aria-hidden="true" />
        <div className="sr-cue" aria-hidden="true">Scroll</div>
      </div>
    </section>
  );
}
