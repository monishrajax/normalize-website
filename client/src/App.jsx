import { useState } from "react";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import { useCatalogue } from "./hooks/useProducts";

import AnnounceBar from "./components/AnnounceBar";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Catalogue from "./components/Catalogue";
import ProductsPanel from "./components/ProductsPanel";
import SearchPanel from "./components/SearchPanel";
import CartPanel from "./components/CartPanel";
import WishlistPanel from "./components/WishlistPanel";
import ProductPanel from "./components/ProductPanel";
import CheckoutPanel from "./components/CheckoutPanel";
import InfoPanel from "./components/InfoPanel";
import AuthPanel from "./components/AuthPanel";
import IntroCurtain from "./components/IntroCurtain";
import Footer from "./components/Footer";

export default function App() {
  return (
    <>
      <AuthProvider>
        <Storefront />
      </AuthProvider>
      {/* Over everything, from the first frame — the page loads beneath it. */}
      <IntroCurtain />
    </>
  );
}

function Storefront() {
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
        <Hero />

        {/* The whole catalogue, on the home page. Filter and sort state live
            here and are shared with the PRODUCTS canvas, so the two always
            show the same list. */}
        <section
          id="shop"
          className="relative mx-auto max-w-(--container-site) scroll-mt-20 px-6 pb-24 md:scroll-mt-24 md:px-8 md:pb-32"
        >
          <p className="mb-8 text-[11px] tracking-[0.2em] text-muted uppercase">The catalogue</p>
          <Catalogue
            products={products}
            loading={loading}
            error={error}
            category={category}
            onCategoryChange={setCategory}
            sort={sort}
            onSortChange={setSort}
            onSelect={setSelected}
          />
        </section>
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
