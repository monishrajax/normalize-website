import { lazy, Suspense, useMemo, useState } from "react";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import { useCatalogue } from "./hooks/useProducts";

import AnnounceBar from "./components/AnnounceBar";
import Header from "./components/Header";
import MobileMenu from "./components/MobileMenu";
import Hero from "./components/Hero";
import Spotlight from "./components/Spotlight";
import ProductGrid from "./components/ProductGrid";
import SearchPanel from "./components/SearchPanel";
import CartPanel from "./components/CartPanel";
import WishlistPanel from "./components/WishlistPanel";
import ProductModal from "./components/ProductModal";
import CheckoutModal from "./components/CheckoutModal";
import InfoModal from "./components/InfoModal";
import Footer from "./components/Footer";

/* The launch canvas pulls in three.js and gsap — by far the heaviest thing on
   the page. Loading it lazily keeps that weight out of the initial bundle. */
const LaunchCanvas = lazy(() => import("./components/LaunchCanvas"));

export default function App() {
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const { products, config, loading, error } = useCatalogue({ category, sort });

  const [panel, setPanel] = useState(null);        // "search" | "cart" | "wishlist" | "menu"
  const [selected, setSelected] = useState(null);  // product being quick-viewed
  const [infoSection, setInfoSection] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const close = () => setPanel(null);

  /* Launch mode is now a property of the data, not a constant to redeploy:
     if exactly one product is sellable, the site is in launch. Opening the
     catalogue is a database update, and this follows automatically. */
  const sellable = useMemo(() => products.filter((p) => p.isSellable), [products]);
  const launchMode = sellable.length === 1;
  const launchProduct = launchMode ? sellable[0] : null;

  return (
    <ToastProvider>
      <CartProvider products={products} config={config}>
        <AnnounceBar config={config} />

        <Header
          activeCategory={category}
          onCategoryChange={setCategory}
          onOpenSearch={() => setPanel("search")}
          onOpenWishlist={() => setPanel("wishlist")}
          onOpenCart={() => setPanel("cart")}
          onOpenMenu={() => setPanel("menu")}
          launchMode={launchMode}
        />

        <main id="top">
          {/* Nothing below the canvas depends on it, so a failure to load
              three.js degrades to a site without the intro rather than a
              blank page. */}
          <Suspense fallback={null}>
            <LaunchCanvas
              onNavigate={(target) => {
                if (target === "cart") setPanel("cart");
                else document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </Suspense>

          <Hero />

          {launchProduct && (
            <Spotlight product={launchProduct} onOpenCart={() => setPanel("cart")} />
          )}

          {!launchMode && (
            <ProductGrid
              products={products}
              loading={loading}
              error={error}
              sort={sort}
              onSortChange={setSort}
              onSelect={setSelected}
            />
          )}
        </main>

        <Footer onOpenInfo={setInfoSection} />

        {/* Overlays */}
        <MobileMenu
          open={panel === "menu"}
          onClose={close}
          onCategoryChange={setCategory}
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
        <ProductModal
          product={selected}
          onClose={() => setSelected(null)}
          onOpenCart={() => setPanel("cart")}
        />
        <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
        <InfoModal
          section={infoSection}
          onClose={() => setInfoSection(null)}
          config={config}
        />
      </CartProvider>
    </ToastProvider>
  );
}
