import { useEffect, useRef, useState } from "react";
import Coin from "./Coin";
import { useCart } from "../context/CartContext";

function Icon({ path, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
         className={`h-[18px] w-[18px] ${className}`} aria-hidden="true">
      {path}
    </svg>
  );
}

/* Every header control is at least 44px square. Below 768px the actions lose
   their words and keep only the icon — and their counts ride ON the icon as a
   badge rather than sitting beside it as text, because three counts laid out
   inline push the centred wordmark off a 375px screen. */
const ACTION =
  "grid h-11 min-w-11 grid-flow-col place-items-center gap-1.5 text-muted transition-colors hover:text-ink";

function Count({ n, tone = "" }) {
  /* Always a badge on the icon, at every width. Letting it fall back into the
     flow at lg pushed it onto a second line under the word. */
  return (
    <span
      className={`absolute -top-1 -right-2 text-[9px] leading-none tabular-nums ${tone}`}
    >
      ({n})
    </span>
  );
}

export default function Header({ onOpenProducts, onOpenSearch, onOpenWishlist, onOpenCart }) {
  const { badge, wishlist, registerBagTarget } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const bagIconRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Hand the bag icon to the cart so a product image anywhere on the site knows
     where to fly. */
  useEffect(() => {
    registerBagTarget(bagIconRef.current);
    return () => registerBagTarget(null);
  }, [registerBagTarget]);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-500 ease-(--ease-out)
                  ${scrolled ? "border-line bg-cream/95 backdrop-blur-md" : "border-transparent bg-cream"}`}
    >
      <div className="mx-auto flex max-w-(--container-site) items-center justify-between gap-2 px-3 py-2 md:gap-3 md:px-8">
        {/* Left: one link, to the products canvas. It teleports — it does not
            scroll the home page. */}
        <div className="flex flex-1 items-center">
          <button
            onClick={onOpenProducts}
            className="grid h-11 place-items-center px-1 text-[10px] tracking-[0.1em] text-muted
                       uppercase transition-colors hover:text-ink md:text-[11px] md:tracking-[0.16em]"
          >
            Products
          </button>
        </div>

        {/* Centre: the coin and the wordmark. Rule 1 — always centred.
            #header-coin-slot is the dock the launch canvas's WebGL coin arcs
            into on scroll; see LaunchCanvas. */}
        <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="Normalize — home">
          <span id="header-coin-slot" className="hidden sm:inline-block">
            <Coin size="sm" />
          </span>
          <span className="metallic-text wordmark text-[13px] tracking-[0.1em] sm:text-lg sm:tracking-[0.2em]">
            NORMALIZE
          </span>
        </a>

        {/* Right: actions. Icon-only below 768px. */}
        <div className="flex flex-1 items-center justify-end gap-1 md:gap-4">
          <button onClick={onOpenSearch} aria-label="Search" className={ACTION}>
            <Icon path={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>} />
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Search</span>
          </button>

          <button onClick={onOpenWishlist} aria-label={`Wishlist (${wishlist.length})`} className={ACTION}>
            <span className="relative grid place-items-center">
              <Icon path={<path d="M12 21s-7.5-4.6-10-9.3C.5 8 2 4 6 4c2.2 0 3.7 1.3 6 3.8C14.3 5.3 15.8 4 18 4c4 0 5.5 4 4 7.7C19.5 16.4 12 21 12 21z" />} />
              <Count n={wishlist.length} />
            </span>
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Wishlist</span>
          </button>

          <button onClick={onOpenCart} aria-label={`Bag (${badge})`} className={ACTION}>
            {/* The genie lands here — hence the ref on the icon itself rather
                than the button, so the artwork aims at the bag, not the label. */}
            <span ref={bagIconRef} className="relative grid place-items-center">
              <Icon path={<><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></>} />
              <Count n={badge} tone={badge > 0 ? "text-gold-dark" : ""} />
            </span>
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Bag</span>
          </button>
        </div>
      </div>
    </header>
  );
}
