import { money } from "../lib/api";
import { useCart } from "../context/CartContext";

export default function ProductCard({ product, onSelect }) {
  const { wishlist, toggleWishlist } = useCart();
  const wished = wishlist.includes(product.id);

  return (
    <article className="group relative">
      <button
        onClick={() => onSelect(product)}
        className="block w-full text-left"
        aria-label={`View ${product.name}`}
      >
        <div className="relative aspect-4/5 overflow-hidden bg-cream-dark">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              width="800"
              height="1000"
              /* Grid images are below the fold, so they stay out of the initial
                 page load entirely. */
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 ease-(--ease-out)
                         group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] tracking-[0.16em] text-muted uppercase">
              {product.category}
            </div>
          )}

          {!product.isSellable && (
            <div className="absolute inset-0 flex items-center justify-center bg-cream/70 backdrop-blur-[2px]">
              <span className="border border-ink/30 px-4 py-2 text-[10px] tracking-[0.16em] text-ink uppercase">
                Coming soon
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <h3 className="text-xs tracking-[0.08em] text-ink uppercase">{product.name}</h3>
          <p className="shrink-0 text-xs text-muted tabular-nums">{money(product.price)}</p>
        </div>
      </button>

      <button
        onClick={() => toggleWishlist(product.id)}
        aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
        aria-pressed={wished}
        className="absolute top-3 right-3 rounded-full bg-cream/85 p-2 backdrop-blur-sm
                   transition-transform duration-300 ease-(--ease-out) hover:scale-110"
      >
        <svg viewBox="0 0 24 24" strokeWidth="1.4"
             fill={wished ? "currentColor" : "none"} stroke="currentColor"
             className={`h-4 w-4 ${wished ? "text-gold-dark" : "text-ink"}`}>
          <path d="M12 21s-7.5-4.6-10-9.3C.5 8 2 4 6 4c2.2 0 3.7 1.3 6 3.8C14.3 5.3 15.8 4 18 4c4 0 5.5 4 4 7.7C19.5 16.4 12 21 12 21z" />
        </svg>
      </button>
    </article>
  );
}
