import ProductCard from "./ProductCard";

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

export default function ProductGrid({ products, loading, error, sort, onSortChange, onSelect }) {
  return (
    <section id="shop" className="mx-auto max-w-(--container-site) px-6 py-16 md:px-8">
      <div className="mb-8 flex items-center justify-between border-b border-line pb-4">
        <span className="text-[11px] tracking-[0.14em] text-muted uppercase">
          {loading ? "Loading…" : `${products.length} ${products.length === 1 ? "product" : "products"}`}
        </span>

        <label className="flex items-center gap-3">
          <span className="hidden text-[11px] tracking-[0.14em] text-muted uppercase sm:inline">Sort by</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            className="border border-line bg-transparent px-3 py-1.5 text-[11px] tracking-[0.1em]
                       text-ink uppercase focus:border-gold-dark focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="py-16 text-center text-sm text-brown">{error}</p>
      )}

      {loading && !error && (
        // Skeletons hold the grid's shape so the page doesn't jump when the
        // real products arrive.
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-4/5 bg-cream-dark" />
              <div className="mt-3 h-3 w-2/3 bg-cream-dark" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">
          Nothing here yet. Try another category.
        </p>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}
