import { money } from "../lib/api";
import { useCart } from "../context/CartContext";
import { StarIcon } from "./icons";

/* One cell of the catalogue grid.

   The grid is edge to edge with no gutters, so the cell carries its own
   hairline on the right and bottom — that is what draws the lattice. Text sits
   inside the cell beneath the image rather than floating under a card, which is
   what stops a gutterless grid reading as a wall of photographs.

   `reveal` is OPT-IN, and deliberately so. The class starts the card at
   opacity 0 and waits for useReveal's observer to add .reveal-in. A container
   that renders these cards WITHOUT that hook — the wishlist did exactly this —
   leaves every card in the DOM at full size, with its content, and permanently
   invisible. Defaulting to off means a forgetful caller gets a card that
   appears without a stagger, rather than a panel that looks empty while it is
   actually holding your saved items. */
export default function ProductCard({ product, onSelect, reveal = false }) {
  const { wishlist, toggleWishlist } = useCart();
  const saved = wishlist.includes(product.id);

  return (
    <article className={`${reveal ? "reveal " : ""}group relative border-r border-b border-line/60 bg-white-warm`}>
      <button
        onClick={() => onSelect(product)}
        className="block w-full text-left"
        aria-label={`View ${product.name}`}
      >
        <div className="relative aspect-4/5 overflow-hidden bg-cream-dark/25">
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

        <div className="px-4 pt-4 pb-6 md:px-5">
          <h3 className="text-xs tracking-[0.08em] text-ink uppercase">{product.name}</h3>
          <p className="mt-1.5 text-xs text-muted tabular-nums">{money(product.price)}</p>
        </div>
      </button>

      <button
        onClick={() => toggleWishlist(product.id)}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        aria-pressed={saved}
        className="absolute top-2 right-2 grid h-11 w-11 place-items-center
                   transition-transform duration-300 ease-(--ease-out) hover:scale-110"
      >
        <StarIcon filled={saved} className={`h-[18px] w-[18px] ${saved ? "text-gold-dark" : "text-ink"}`} />
      </button>
    </article>
  );
}
