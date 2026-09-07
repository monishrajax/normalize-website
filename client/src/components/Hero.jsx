import Coin from "./Coin";

/* Coin, eyebrow, serif headline, one line of positioning, one gold button.

   The wordmark here is Cormorant Garamond 300 — the hero's is the serif cut,
   the header's is Archivo Expanded 700. Those two are the only places on the
   site not set in the typewriter.

   The coin here is the CSS one, and it is interactive: drag to turn it, tap to
   flip it. It deliberately teaches the same gestures as the WebGL coin on the
   launch stage above, so a visitor who learns one knows the other. */
export default function Hero() {
  return (
    <section className="relative flex flex-col items-center px-6 pt-16 pb-20 text-center md:pt-24 md:pb-28">
      <div className="mb-8 flex flex-col items-center gap-6">
        <Coin size="lg" interactive />
        <span className="metallic-text font-display text-4xl font-light tracking-[0.28em] md:text-6xl">
          NORMALIZE
        </span>
      </div>

      <p className="mb-5 text-[11px] tracking-[0.22em] text-muted uppercase">
        Everything else is noise.
      </p>

      <h1 className="mb-6 font-display text-4xl leading-[1.15] text-ink md:text-6xl">
        Quiet luxury,
        <br />
        made deliberate.
      </h1>

      <p className="mb-10 max-w-md text-sm leading-relaxed text-muted">
        Bags, apparel, caps and accessories — made in one workshop in Chennai,
        for people who dress with intention rather than noise.
      </p>

      {/* Rule 3: gold is hairlines, small marks and ONE flat button. This is
          that button — flat, never a gradient. */}
      <button
        type="button"
        onClick={() =>
          document.getElementById("spotlight")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        className="min-h-11 bg-gold px-9 text-[11px] tracking-[0.18em] text-ink uppercase
                   transition-colors duration-400 ease-(--ease-out) hover:bg-gold-dark hover:text-cream"
      >
        See the launch
      </button>
    </section>
  );
}
