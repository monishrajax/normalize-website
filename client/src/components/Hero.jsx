import Coin from "./Coin";

export default function Hero() {
  return (
    <section className="relative flex flex-col items-center px-6 pt-16 pb-20 text-center md:pt-24 md:pb-28">
      <div className="mb-8 flex flex-col items-center gap-6">
        <Coin size="lg" interactive />
        <span className="metallic-text font-brand text-3xl font-extrabold tracking-[0.28em] md:text-5xl">
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
        Bags, apparel, caps and accessories — made for people who dress with
        intention rather than noise.
      </p>

      <a
        href="#spotlight"
        className="border border-ink px-9 py-3.5 text-[11px] tracking-[0.18em] text-ink uppercase
                   transition-colors duration-400 ease-(--ease-out) hover:bg-ink hover:text-cream"
      >
        Shop the Collection
      </a>
    </section>
  );
}
