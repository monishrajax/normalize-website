import { useEffect, useRef, useState } from "react";
import Garment from "./Garments";
import { WARDROBES } from "../data/wardrobes";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* A wardrobe: a cabinet whose two doors swing open on their hinges, and inside
   it one brass rod with the clothes hung along it, each with its name written
   underneath so nobody has to guess what a shape is.

   Opening and closing are driven by the `open` flag alone — the doors, the
   fade-in of the hangers and the swing they settle from are all CSS keyed off
   `.wd--open`. `closing` (from the showroom) shuts the doors and then fades the
   whole thing out before the showroom unmounts it.

   Eight or nine garments fit on the rod at desktop width. Narrower than that
   the rod simply scrolls sideways — swipe it, or use the arrows — rather than
   shrinking the clothes until they can't be told apart. */
export default function Wardrobe({ id, closing = false }) {
  const { title, items } = WARDROBES[id];
  const [open, setOpen] = useState(false);
  const [edge, setEdge] = useState({ l: false, r: false });
  const scrollRef = useRef(null);

  useEffect(() => {
    if (closing) { setOpen(false); return; }
    const t = setTimeout(() => setOpen(true), prefersReducedMotion() ? 0 : 420);
    return () => clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const l = el.scrollLeft > 4;
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", measure); ro.disconnect(); };
  }, [id]);

  const slide = (dir) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div
      className={`wd${open ? " wd--open" : ""}${closing ? " wd--closing" : ""}`}
      style={{ "--count": items.length }}
      role="region"
      aria-label={`${title}'s wardrobe`}
    >
      <div className="wd-cab">
        <div className="wd-plaque" aria-hidden="true">{title}</div>

        <div className="wd-opening">
          <div className="wd-inner">
            <div className="wd-shelf" aria-hidden="true" />
            <div
              ref={scrollRef}
              className="wd-scroll"
              data-l={edge.l ? "1" : "0"}
              data-r={edge.r ? "1" : "0"}
            >
              <ul className="wd-rail" aria-label={`Clothes in the ${title.toLowerCase()}'s wardrobe`}>
                <li className="wd-bracket" aria-hidden="true" />
                {items.map((item, i) => (
                  <li key={item.kind} className="wd-item" style={{ "--i": i }}>
                    <div className="wd-swing"><Garment kind={item.kind} /></div>
                    <span className="wd-cap">{item.label}</span>
                  </li>
                ))}
                <li className="wd-bracket" aria-hidden="true" />
              </ul>
            </div>

            {edge.l && (
              <button type="button" className="wd-arrow wd-arrow-l" aria-label="Slide the rod left" onClick={() => slide(-1)}>
                &#8249;
              </button>
            )}
            {edge.r && (
              <button type="button" className="wd-arrow wd-arrow-r" aria-label="Slide the rod right" onClick={() => slide(1)}>
                &#8250;
              </button>
            )}
          </div>

          <div className="wd-door wd-door-l" aria-hidden="true">
            <div className="wd-face"><i className="wd-handle" /></div>
            <div className="wd-face wd-face-back" />
          </div>
          <div className="wd-door wd-door-r" aria-hidden="true">
            <div className="wd-face"><i className="wd-handle" /></div>
            <div className="wd-face wd-face-back" />
          </div>
        </div>

        <div className="wd-base" aria-hidden="true">
          <i className="wd-drawer" />
          <i className="wd-drawer" />
        </div>
      </div>
    </div>
  );
}
