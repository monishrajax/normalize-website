import { useState } from "react";
import { money } from "../lib/api";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";

/* The launch piece, front and centre. Choosing an edition swaps the photograph
   as well as the cart line, because Dawn and Dusk are genuinely different cloth
   rather than a label. */
export default function Spotlight({ product, onOpenCart }) {
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const [variant, setVariant] = useState(product?.sizes?.[0] || "");

  if (!product) return null;

  const image = product.images?.[variant] || product.image;

  const handleAdd = () => {
    addToCart(product, variant, 1);
    showToast(`${product.name} — ${variant} added to your bag.`);
    onOpenCart?.();
  };

  return (
    <section id="spotlight" className="relative overflow-hidden border-y border-line bg-cream-dark/40 py-16 md:py-24">
      <div className="mx-auto grid max-w-(--container-site) items-center gap-10 px-6 md:grid-cols-2 md:gap-16 md:px-8">
        {/* Photograph */}
        <div className="relative">
          <img
            src={image}
            alt={`${product.name} — ${variant} edition`}
            width="1000"
            height="1250"
            className="w-full bg-cream object-cover transition-opacity duration-500 ease-(--ease-reveal)"
            /* The launch photo is the largest thing on the page and sits above
               the fold, so it loads eagerly and is decoded off the main thread. */
            loading="eager"
            decoding="async"
            fetchpriority="high"
          />
          <span className="absolute top-4 left-4 bg-ink px-3 py-1.5 text-[10px] tracking-[0.16em] text-cream uppercase">
            First Launch
          </span>
        </div>

        {/* Copy */}
        <div>
          <p className="mb-3 text-[11px] tracking-[0.2em] text-gold-dark uppercase">
            Launch · Edition 001
          </p>
          <h2 className="mb-3 font-display text-4xl text-ink md:text-5xl">{product.name}</h2>
          <p className="mb-6 text-lg text-ink tabular-nums">{money(product.price)}</p>
          <p className="mb-8 max-w-prose text-sm leading-relaxed text-muted">{product.desc}</p>

          <p className="mb-3 text-[11px] tracking-[0.16em] text-muted uppercase">Choose your edition</p>
          <div className="mb-8 flex gap-3">
            {product.sizes.map((s) => (
              <button
                key={s}
                onClick={() => setVariant(s)}
                aria-pressed={variant === s}
                className={`border px-6 py-2.5 text-[11px] tracking-[0.14em] uppercase
                            transition-all duration-300 ease-(--ease-out)
                            ${variant === s
                              ? "border-ink bg-ink text-cream"
                              : "border-line text-muted hover:border-ink hover:text-ink"}`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={handleAdd}
            className="w-full border border-ink bg-ink px-9 py-4 text-[11px] tracking-[0.18em] text-cream uppercase
                       transition-colors duration-400 ease-(--ease-out) hover:bg-transparent hover:text-ink sm:w-auto"
          >
            Prebook — {money(product.price)}
          </button>

          <ul className="mt-8 space-y-1.5 text-[11px] tracking-wide text-muted">
            <li>Natural ecru cotton handles · white lining</li>
            <li>Made in small batches</li>
            <li>Easy 14-day returns</li>
            <li>Made in India</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
