import { useEffect, useRef, useState } from "react";
import Coin from "./Coin";
import { STAR_PATH } from "./icons";
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

function Count({ n, tone = "", nudge = 0 }) {
  /* The number sits INSIDE the icon rather than beside it — no brackets, no
     extra width. Each glyph is centred on the icon's own visual mass, which is
     not its bounding-box centre: a heart carries its weight high, a bag low.
     Hence the per-icon nudge. */
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 grid place-items-center
                  text-[9px] leading-none font-semibold tabular-nums ${tone}`}
      style={{ transform: `translateY(${nudge}px)` }}
    >
      {n}
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
          {/* The chassis the launch coin is REPARENTED into at the end of the
              toss. A real clipped DOM boundary, not a numeric clamp — the
              canvas physically cannot overflow the header, however the scroll
              maths behaves. The CSS coin sits inside until the WebGL one
              arrives and replaces it. */}
          <span
            id="header-coin-slot"
            className="relative hidden h-[50px] w-[50px] shrink-0 overflow-hidden sm:inline-block"
          >
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
              <Icon path={<path d={STAR_PATH} strokeLinejoin="round" />} />
              <Count n={wishlist.length} nudge={-1} />
            </span>
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Wishlist</span>
          </button>

          <button onClick={onOpenCart} aria-label={`Bag (${badge})`} className={ACTION}>
            {/* The genie lands here — hence the ref on the icon itself rather
                than the button, so the artwork aims at the bag, not the label. */}
            <span ref={bagIconRef} className="relative grid place-items-center">
              <Icon path={<><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></>} />
              <Count n={badge} tone={badge > 0 ? "text-gold-dark" : ""} nudge={2} />
            </span>
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Bag</span>
          </button>
        </div>
      </div>
    </header>
  );
}
