import { useEffect, useRef, useState } from "react";
import { money } from "../lib/api";
import { useCart } from "../context/CartContext";

/* The launch piece, front and centre — during launch this section IS the
   product page. A dark full-bleed stage, so the photograph is the only lit
   thing on the screen.

   The entrance is deliberately sequenced rather than a single fade: the frame
   wipes open from the floor, the photograph settles out of a deep zoom, the
   crest swells, and the name rises word by word out of masked rows. Each step
   is a transition with its own delay, all gated on one `entered` flag. */

/* Each edition carries its own light across the stage rather than just
   relabelling the same picture.

   COLOUR ONLY. This used to carry a line of product copy per edition, and that
   copy was wrong — it described an "ecru body" when the body is indigo jute.
   Product facts belong in the catalogue, which is the one place that is allowed
   to describe the thing being sold; the difference between the editions is
   carried by the photograph, which swaps with the choice. */
const MOODS = {
  Dawn: {
    accent: "var(--color-dawn)",
    wash: "radial-gradient(120% 90% at 26% 18%, rgba(176,141,87,0.34), transparent 62%)",
  },
  Dusk: {
    accent: "var(--color-dusk)",
    wash: "radial-gradient(120% 90% at 74% 22%, rgba(109,124,154,0.34), transparent 62%)",
  },
};

/* The long-form copy, straight off the product document. During launch this
   section IS the product page, so it has to carry the same detail the quick-view
   panel does — not a hand-written summary of it. */
const ACCORDIONS = [
  ["material", "Material"],
  ["design", "Design"],
  ["care", "Care"],
];

export default function Spotlight({ product }) {
  const { addToBag } = useCart();
  const [variant, setVariant] = useState(product?.sizes?.[0] || "");
  const [openDetail, setOpenDetail] = useState("material");
  const [entered, setEntered] = useState(false);
  const sectionRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setEntered(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setEntered(true);
        observer.disconnect();     // the entrance plays once, not on every pass
      },
      { threshold: 0.22 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!product) return null;

  const image = product.images?.[variant] || product.image;
  const mood = MOODS[variant] || MOODS.Dawn;
  const words = product.name.split(/\s+/);

  const handleAdd = () => {
    // The line lands now; the badge waits for the artwork to reach the bag.
    // No toast, and the cart does not open itself — the flight is the receipt.
    addToBag(product, variant, 1, imageRef.current, image);
  };

  return (
    <section
      id="spotlight"
      ref={sectionRef}
      className="relative overflow-hidden bg-ink py-20 text-cream md:py-28"
    >
      {/* The edition's mood light. Cross-fades when the edition changes. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[background] duration-[1200ms] ease-(--ease-luxe)"
        style={{ background: mood.wash }}
      />

      <div className="relative mx-auto grid max-w-(--container-site) items-center gap-10 px-6 md:grid-cols-2 md:gap-16 md:px-8">
        {/* Photograph — the frame wipes open from the floor, the image settles
            out of a deep zoom behind it. */}
        <div
          className="relative overflow-hidden transition-[clip-path] duration-[1100ms] ease-(--ease-luxe)"
          style={{ clipPath: entered ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)" }}
        >
          <img
            ref={imageRef}
            src={image}
            alt={`${product.name} — ${variant} edition`}
            width="1000"
            height="1250"
            className="w-full bg-ink object-cover transition-transform duration-[1500ms] ease-(--ease-reveal)"
            style={{ transform: entered ? "scale(1)" : "scale(1.28)", transitionDelay: "120ms" }}
            /* The launch photo is the largest thing on the page and sits above
               the fold, so it loads eagerly and is decoded off the main thread. */
            loading="eager"
            decoding="async"
            fetchpriority="high"
          />

          {/* The crest, swelling into place over the corner of the frame. */}
          <span
            className="absolute top-4 left-4 border px-3 py-1.5 text-[10px] tracking-[0.16em] uppercase
                       transition-all duration-700 ease-(--ease-out)"
            style={{
              borderColor: mood.accent,
              color: mood.accent,
              transform: entered ? "scale(1)" : "scale(0.5)",
              opacity: entered ? 1 : 0,
              transitionDelay: "820ms",
            }}
          >
            First Launch
          </span>
        </div>

        {/* Copy */}
        <div>
          <p
            className="mb-3 text-[11px] tracking-[0.2em] uppercase transition-all duration-700 ease-(--ease-out)"
            style={{
              color: mood.accent,
              opacity: entered ? 1 : 0,
              transform: entered ? "none" : "translateY(10px)",
              transitionDelay: "240ms",
            }}
          >
            Launch · Edition 001
          </p>

          {/* The name rises word by word out of masked rows. */}
          <h2 className="mb-3 font-display text-4xl text-cream md:text-5xl">
            {words.map((w, i) => (
              <span key={`${w}-${i}`} className="mr-[0.28em] inline-block overflow-hidden align-bottom">
                <span
                  className="inline-block transition-transform duration-[900ms] ease-(--ease-reveal)"
                  style={{
                    transform: entered ? "translateY(0)" : "translateY(105%)",
                    transitionDelay: `${420 + i * 110}ms`,
                  }}
                >
                  {w}
                </span>
              </span>
            ))}
          </h2>

          <div
            className="transition-opacity duration-700 ease-(--ease-out)"
            style={{ opacity: entered ? 1 : 0, transitionDelay: "900ms" }}
          >
            <p className="mb-6 text-lg text-cream tabular-nums">{money(product.price)}</p>
            <p className="mb-8 max-w-prose text-sm leading-relaxed text-cream/70">{product.desc}</p>

            <p className="mb-3 text-[11px] tracking-[0.16em] text-cream/60 uppercase">
              Choose your edition
            </p>
            <div className="mb-4 flex gap-3">
              {product.sizes.map((s) => {
                const active = variant === s;
                return (
                  <button
                    key={s}
                    onClick={() => setVariant(s)}
                    aria-pressed={active}
                    className="min-h-11 border px-6 text-[11px] tracking-[0.14em] uppercase
                               transition-all duration-300 ease-(--ease-out)"
                    style={
                      active
                        ? { borderColor: (MOODS[s] || mood).accent, background: (MOODS[s] || mood).accent, color: "var(--color-ink)" }
                        : { borderColor: "rgba(244,237,224,0.28)", color: "rgba(244,237,224,0.72)" }
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            {/* Launch mode: PREBOOK, not "Add to Bag". */}
            <button
              onClick={handleAdd}
              className="min-h-11 w-full border px-9 py-4 text-[11px] tracking-[0.18em] uppercase
                         transition-colors duration-400 ease-(--ease-out) sm:w-auto"
              style={{ borderColor: mood.accent, background: mood.accent, color: "var(--color-ink)" }}
            >
              Prebook — {money(product.price)}
            </button>

            {/* Material · Design · Care, exactly as the catalogue holds them. */}
            <div className="mt-10 border-t border-cream/15">
              {ACCORDIONS.map(([key, label]) => {
                const body = product.details?.[key];
                if (!body) return null;
                const isOpen = openDetail === key;
                return (
                  <div key={key} className="border-b border-cream/15">
                    <button
                      onClick={() => setOpenDetail(isOpen ? "" : key)}
                      aria-expanded={isOpen}
                      className="flex min-h-11 w-full items-center justify-between text-left"
                    >
                      <span className="text-[11px] tracking-[0.16em] text-cream uppercase">{label}</span>
                      <span className={`text-cream/50 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>
                        +
                      </span>
                    </button>
                    {/* Animating the grid row keeps open/close smooth without
                        measuring the content on every render. */}
                    <div className={`grid transition-all duration-400 ease-(--ease-out)
                                     ${isOpen ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <div className="overflow-hidden">
                        <div
                          className="max-w-prose space-y-3 text-sm leading-relaxed text-cream/70 [&_p]:mb-3"
                          dangerouslySetInnerHTML={{ __html: body }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Brand-level facts only — nothing here describes the product, so
                nothing here can drift from it. */}
            <ul className="mt-8 space-y-1.5 text-[11px] tracking-wide text-cream/50">
              <li>Made in small batches</li>
              <li>Easy 14-day returns</li>
              <li>Made in Chennai</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
