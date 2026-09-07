import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { flyToBag, prefersReducedMotion } from "../lib/genie";

const CartContext = createContext(null);

const CART_KEY = "normalize_cart";
const WISH_KEY = "normalize_wishlist";

/* Storage holds ONLY {productId, variant, qty} — never a price, a name or an
   image. Those are joined back on from the catalogue the server sent, so a
   tampered localStorage entry has nothing to tamper with: editing it can change
   what you are asking for, never what it costs. The server prices the order
   again from its own database regardless. */
function readStorage(key, validate) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validate) : [];
  } catch (err) {
    console.warn(`Normalize: could not read "${key}", starting fresh.`, err);
    return [];
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Normalize: could not save "${key}" (storage may be full or blocked).`, err);
  }
}

const isCartLine = (l) =>
  l && typeof l.productId === "string" && Number.isFinite(l.qty) && l.qty > 0;

export function CartProvider({ children, products, config }) {
  const [lines, setLines] = useState(() => readStorage(CART_KEY, isCartLine));
  const [wishlist, setWishlist] = useState(() =>
    readStorage(WISH_KEY, (id) => typeof id === "string")
  );
  const [promoCode, setPromoCode] = useState("");
  const [promoRate, setPromoRate] = useState(0);

  useEffect(() => writeStorage(CART_KEY, lines), [lines]);
  useEffect(() => writeStorage(WISH_KEY, wishlist), [wishlist]);

  const byId = useMemo(
    () => new Map((products || []).map((p) => [p.id, p])),
    [products]
  );

  /* The cart the UI actually renders: storage lines joined to live catalogue
     data. A line whose product has been withdrawn or is no longer sellable
     simply falls out, so nothing unbuyable can reach checkout. */
  const items = useMemo(
    () =>
      lines
        .map((l) => {
          const product = byId.get(l.productId);
          if (!product || !product.isSellable) return null;
          const qty = Math.min(99, Math.max(1, Math.floor(l.qty)));
          return {
            productId: product.id,
            variant: l.variant || product.sizes[0] || "",
            qty,
            name: product.name,
            price: product.price,
            image: product.images?.[l.variant] || product.image,
            slug: product.slug,
            lineTotal: product.price * qty,
          };
        })
        .filter(Boolean),
    [lines, byId]
  );

  const count = useMemo(() => items.reduce((n, l) => n + l.qty, 0), [items]);

  /* ---- The bag badge lags the cart on purpose --------------------------------
     `count` is the truth; `badge` is what the header renders. While a genie
     flight is in the air the badge is held at its old value, because the brief's
     rule is that the count ticks over when the artwork lands — never mid-flight.
     Everything that is not an add-to-bag (removing a line, a quantity step, the
     cart being cleared after payment) syncs immediately.                        */
  const [badge, setBadge] = useState(count);
  const flightsRef = useRef(0);
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    if (flightsRef.current === 0) setBadge(count);
  }, [count]);

  /* The header registers its bag icon here so a product image anywhere on the
     site knows where to fly to, without prop-drilling a ref through every
     component that can add to the bag. */
  const bagTargetRef = useRef(null);
  const registerBagTarget = useCallback((el) => { bagTargetRef.current = el; }, []);

  const addLine = useCallback((product, variant, qty) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === product.id && l.variant === variant);
      if (i === -1) return [...prev, { productId: product.id, variant, qty }];
      const next = [...prev];
      next[i] = { ...next[i], qty: Math.min(99, next[i].qty + qty) };
      return next;
    });
  }, []);

  /**
   * Add to bag, with the flight. `sourceEl` is the product image the artwork is
   * cloned from; pass null and it degrades to a plain add.
   *
   * The line lands in the cart immediately — only the badge waits — so a
   * customer who opens the bag mid-flight sees the right contents.
   */
  const addToBag = useCallback(async (product, variant, qty = 1, sourceEl = null, imageSrc = null) => {
    addLine(product, variant, qty);

    if (!sourceEl || !bagTargetRef.current || prefersReducedMotion()) return;

    flightsRef.current += 1;
    try {
      await flyToBag(sourceEl, bagTargetRef.current, imageSrc);
    } finally {
      flightsRef.current = Math.max(0, flightsRef.current - 1);
      // Read the live count, not the one captured when the flight began — a
      // second add may have landed while this one was in the air.
      if (flightsRef.current === 0) setBadge(countRef.current);
    }
  }, [addLine]);

  const setQty = useCallback((productId, variant, qty) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => !(l.productId === productId && l.variant === variant))
        : prev.map((l) =>
            l.productId === productId && l.variant === variant
              ? { ...l, qty: Math.min(99, qty) }
              : l
          )
    );
  }, []);

  const removeLine = useCallback((productId, variant) => {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.variant === variant)));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
    setPromoCode("");
    setPromoRate(0);
  }, []);

  const toggleWishlist = useCallback((productId) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  /* Display figures only. The server recomputes every one of these from its own
     catalogue before a rupee moves, and the checkout re-paints the summary from
     the server's answer, so what is on screen is always what is charged. */
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, l) => sum + l.lineTotal, 0);
    const discount = Math.round(subtotal * promoRate);
    const threshold = config?.freeShippingThreshold ?? 1499;
    const fee = config?.shippingFee ?? 199;
    const shipping = items.length === 0 || subtotal - discount >= threshold ? 0 : fee;
    return { subtotal, discount, shipping, total: subtotal - discount + shipping };
  }, [items, promoRate, config]);

  const value = {
    items, count, badge, totals, wishlist,
    addToBag, setQty, removeLine, clearCart, toggleWishlist,
    registerBagTarget,
    promoCode, promoRate, setPromoCode, setPromoRate,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
