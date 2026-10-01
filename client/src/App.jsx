import { lazy, Suspense, useMemo, useState } from "react";
import { CartProvider } from "./context/CartContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useCatalogue } from "./hooks/useProducts";

import AnnounceBar from "./components/AnnounceBar";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Spotlight from "./components/Spotlight";
import ProductsPanel from "./components/ProductsPanel";
import SearchPanel from "./components/SearchPanel";
import CartPanel from "./components/CartPanel";
import WishlistPanel from "./components/WishlistPanel";
import ProductPanel from "./components/ProductPanel";
import CheckoutPanel from "./components/CheckoutPanel";
import InfoPanel from "./components/InfoPanel";
import AuthPanel from "./components/AuthPanel";
import EarlyAccessGate from "./components/EarlyAccessGate";
import Footer from "./components/Footer";

/* The launch canvas pulls in three.js and gsap — by far the heaviest thing on
   the page. Loading it lazily keeps that weight out of the initial bundle. */
const LaunchCanvas = lazy(() => import("./components/LaunchCanvas"));

/* Reading pages the coin's branches can open directly. */
const INFO_SECTIONS = new Set(["shipping", "sizeguide", "contact", "track", "story", "craft", "careers"]);

/* Off unless explicitly turned on — this fronts the ENTIRE site, including
   checkout, so it must never flip on by a default. Set VITE_EARLY_ACCESS=true
   in the host's env vars (Vercel, or client/.env for local testing) when the
   gate should actually go live, and VITE_GATE_PASSWORD so the team can still
   reach the real site while it's up. Undoing it is the same switch in
   reverse — no code change either way. */
const EARLY_ACCESS = import.meta.env.VITE_EARLY_ACCESS === "true";
const GATE_UNLOCK_KEY = "normalize_gate_unlocked";

export default function App() {
  return (
    <AuthProvider>
      <GatedApp />
    </AuthProvider>
  );
}

/* Split out from App so it can call useAuth() — which only works inside
   AuthProvider — to let an already signed-in customer straight past the
   gate without re-answering anything. */
function GatedApp() {
  const { signedIn, loading: authLoading } = useAuth();
  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem(GATE_UNLOCK_KEY) === "1"; } catch { return false; }
  });

  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const { products, allProducts, config, loading, error } = useCatalogue({ category, sort });

  /* Exactly one canvas is open at a time. Rule 2 — every secondary surface is
     a full-viewport canvas, so they are all mutually exclusive by nature and
     one piece of state is enough. */
  const [panel, setPanel] = useState(null);        // "search" | "cart" | "wishlist" | "products" | "account"
  const [selected, setSelected] = useState(null);  // product being quick-viewed
  const [infoSection, setInfoSection] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const close = () => setPanel(null);

  /* Launch mode is a property of the data, not a constant to redeploy: if
     exactly one product is sellable, the site is in launch. Opening the
     catalogue is a database update, and this follows automatically. */
  const sellable = useMemo(() => allProducts.filter((p) => p.isSellable), [allProducts]);
  const launchMode = sellable.length === 1;
  const launchProduct = launchMode ? sellable[0] : null;

  /* The coin's three branches. "The Launch" scrolls the page; the other two
     teleport to their own canvas. */
  const navigateFromCoin = (target) => {
    if (target === "cart") return setPanel("cart");
    if (INFO_SECTIONS.has(target)) return setInfoSection(target);
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
  };

  /* While Supabase is still reading back a stored session, render nothing
     rather than flashing the gate at a customer who is about to turn out to
     be signed in. Guest visitors (accounts not configured, or genuinely
     signed out) pass straight through once authLoading settles. */
  if (EARLY_ACCESS && !unlocked && authLoading) return null;
  if (EARLY_ACCESS && !unlocked && !signedIn) {
    return <EarlyAccessGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <CartProvider products={allProducts} config={config}>
      <AnnounceBar config={config} />

      <Header
        onOpenProducts={() => setPanel("products")}
        onOpenSearch={() => setPanel("search")}
        onOpenWishlist={() => setPanel("wishlist")}
        onOpenCart={() => setPanel("cart")}
        onOpenAccount={() => setPanel("account")}
      />

      <main id="top">
        {/* Nothing below the canvas depends on it, so a failure to load
            three.js degrades to a site without the intro rather than a
            blank page. */}
        <Suspense fallback={null}>
          <LaunchCanvas onNavigate={navigateFromCoin} />
        </Suspense>

        <Hero />

        {/* During launch the spotlight IS the product page. The grid is not on
            the home page at all any more — it lives in the products canvas. */}
        {launchProduct && <Spotlight product={launchProduct} />}
      </main>

      <Footer onOpenInfo={setInfoSection} />

      {/* Canvases */}
      <ProductsPanel
        open={panel === "products"}
        onClose={close}
        products={products}
        loading={loading}
        error={error}
        category={category}
        onCategoryChange={setCategory}
        sort={sort}
        onSortChange={setSort}
        onSelect={(p) => { close(); setSelected(p); }}
      />
      <SearchPanel open={panel === "search"} onClose={close} onSelect={setSelected} />
      {/* The wishlist stores ids, so it resolves them against the FULL
          catalogue — filtering the grid to a category must not hide saved
          items that happen to live in another one. */}
      <WishlistPanel
        open={panel === "wishlist"}
        onClose={close}
        products={allProducts}
        onSelect={setSelected}
      />
      <CartPanel
        open={panel === "cart"}
        onClose={close}
        onCheckout={() => { close(); setCheckoutOpen(true); }}
      />
      <ProductPanel product={selected} onClose={() => setSelected(null)} />
      <CheckoutPanel open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
      <AuthPanel open={panel === "account"} onClose={close} />

      <InfoPanel
        section={infoSection}
        onClose={() => setInfoSection(null)}
        config={config}
      />
    </CartProvider>
  );
}
