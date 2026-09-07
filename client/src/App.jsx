import { lazy, Suspense, useMemo, useState } from "react";
import { CartProvider } from "./context/CartContext";
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
import Footer from "./components/Footer";

/* The launch canvas pulls in three.js and gsap — by far the heaviest thing on
   the page. Loading it lazily keeps that weight out of the initial bundle. */
const LaunchCanvas = lazy(() => import("./components/LaunchCanvas"));

/* Reading pages the coin's branches can open directly. */
const INFO_SECTIONS = new Set(["shipping", "sizeguide", "contact", "track", "story", "craft", "careers"]);

export default function App() {
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const { products, config, loading, error } = useCatalogue({ category, sort });

  /* Exactly one canvas is open at a time. Rule 2 — every secondary surface is
     a full-viewport canvas, so they are all mutually exclusive by nature and
     one piece of state is enough. */
  const [panel, setPanel] = useState(null);        // "search" | "cart" | "wishlist" | "products"
  const [selected, setSelected] = useState(null);  // product being quick-viewed
  const [infoSection, setInfoSection] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const close = () => setPanel(null);

  /* Launch mode is a property of the data, not a constant to redeploy: if
     exactly one product is sellable, the site is in launch. Opening the
     catalogue is a database update, and this follows automatically. */
  const sellable = useMemo(() => products.filter((p) => p.isSellable), [products]);
  const launchMode = sellable.length === 1;
  const launchProduct = launchMode ? sellable[0] : null;

  /* The coin's three branches. "The Launch" scrolls the page; the other two
     teleport to their own canvas. */
  const navigateFromCoin = (target) => {
    if (target === "cart") return setPanel("cart");
    if (INFO_SECTIONS.has(target)) return setInfoSection(target);
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <CartProvider products={products} config={config}>
      <AnnounceBar config={config} />

      <Header
        onOpenProducts={() => setPanel("products")}
        onOpenSearch={() => setPanel("search")}
        onOpenWishlist={() => setPanel("wishlist")}
        onOpenCart={() => setPanel("cart")}
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
      <WishlistPanel
        open={panel === "wishlist"}
        onClose={close}
        products={products}
        onSelect={setSelected}
      />
      <CartPanel
        open={panel === "cart"}
        onClose={close}
        onCheckout={() => { close(); setCheckoutOpen(true); }}
      />
      <ProductPanel product={selected} onClose={() => setSelected(null)} />
      <CheckoutPanel open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
      <InfoPanel
        section={infoSection}
        onClose={() => setInfoSection(null)}
        config={config}
      />
    </CartProvider>
  );
}
