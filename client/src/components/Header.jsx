import { useEffect, useState } from "react";
import Coin from "./Coin";
import { useCart } from "../context/CartContext";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "bags", label: "Bags" },
  { key: "apparel", label: "Apparel" },
  { key: "caps", label: "Caps" },
  { key: "accessories", label: "Accessories" },
];

function Icon({ path, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
         className={`h-[18px] w-[18px] ${className}`} aria-hidden="true">
      {path}
    </svg>
  );
}

export default function Header({
  activeCategory, onCategoryChange, onOpenSearch, onOpenWishlist,
  onOpenCart, onOpenMenu, launchMode,
}) {
  const { count, wishlist } = useCart();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-500 ease-(--ease-out)
                  ${scrolled ? "border-line bg-cream/95 backdrop-blur-md" : "border-transparent bg-cream"}`}
    >
      <div className="mx-auto flex max-w-(--container-site) items-center justify-between gap-4 px-5 py-3 md:px-8">
        {/* Left: category nav (desktop) / menu button (mobile) */}
        <div className="flex flex-1 items-center gap-6">
          <button
            onClick={onOpenMenu}
            aria-label="Menu"
            className="text-ink transition-opacity hover:opacity-60 md:hidden"
          >
            <Icon path={<path d="M3 7h18M3 15h12" />} />
          </button>

          {!launchMode && (
            <nav className="hidden items-center gap-6 md:flex">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => onCategoryChange(c.key)}
                  className={`relative py-1 text-[11px] tracking-[0.16em] uppercase transition-colors
                              ${activeCategory === c.key ? "text-ink" : "text-muted hover:text-ink"}`}
                >
                  {c.label}
                  {activeCategory === c.key && (
                    <span className="absolute -bottom-0.5 left-0 h-px w-full bg-gold-dark" />
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Centre: wordmark */}
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <Coin size="sm" className="hidden sm:inline-block" />
          <span className="metallic-text font-brand text-lg font-extrabold tracking-[0.2em] sm:text-xl">
            NORMALIZE
          </span>
        </a>

        {/* Right: actions */}
        <div className="flex flex-1 items-center justify-end gap-4 md:gap-6">
          <button onClick={onOpenSearch} aria-label="Search"
                  className="flex items-center gap-1.5 text-muted transition-colors hover:text-ink">
            <Icon path={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>} />
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Search</span>
          </button>

          <button onClick={onOpenWishlist} aria-label="Wishlist"
                  className="flex items-center gap-1.5 text-muted transition-colors hover:text-ink">
            <Icon path={<path d="M12 21s-7.5-4.6-10-9.3C.5 8 2 4 6 4c2.2 0 3.7 1.3 6 3.8C14.3 5.3 15.8 4 18 4c4 0 5.5 4 4 7.7C19.5 16.4 12 21 12 21z" />} />
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Wishlist</span>
            <span className="text-[11px] tabular-nums">({wishlist.length})</span>
          </button>

          <button onClick={onOpenCart} aria-label="Bag"
                  className="flex items-center gap-1.5 text-muted transition-colors hover:text-ink">
            <Icon path={<><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></>} />
            <span className="hidden text-[11px] tracking-[0.14em] uppercase lg:inline">Cart</span>
            <span className={`text-[11px] tabular-nums transition-colors ${count > 0 ? "text-gold-dark" : ""}`}>
              ({count})
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
