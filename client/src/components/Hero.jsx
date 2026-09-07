/* Eyebrow, serif headline, one line of positioning, one gold button.

   The wordmark here is Cormorant Garamond 300 — the hero's is the serif cut,
   the header's is Archivo Expanded 700. Those two are the only places on the
   site not set in the typewriter.

   No coin in this section: the coin's home is the launch canvas directly
   above, and it docks into the header on the way past. */
export default function Hero() {
  return (
    <section className="relative flex flex-col items-center px-6 pt-16 pb-20 text-center md:pt-24 md:pb-28">
      <span className="metallic-text mb-8 font-display text-4xl font-light tracking-[0.28em] md:text-6xl">
        NORMALIZE
      </span>

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
