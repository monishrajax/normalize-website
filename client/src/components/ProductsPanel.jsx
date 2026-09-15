import Panel from "./Panel";
import ProductGrid from "./ProductGrid";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "bags", label: "Bags" },
  { key: "apparel", label: "Apparel" },
  { key: "caps", label: "Caps" },
  { key: "accessories", label: "Accessories" },
];

/* The arrow is its own glyph, not part of the label, so it can be set larger
   than the wide-tracked uppercase it sits beside. At matching size a ↑ is
   almost invisible against 11px letterspaced caps — it reads as a speck of
   punctuation rather than the thing that tells you which way the prices run. */
const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price", arrow: "↑" },
  { value: "price-desc", label: "Price", arrow: "↓" },
  { value: "newest", label: "Newest" },
];

/* The catalogue as its own full-viewport canvas. "PRODUCTS" in the header
   teleports here rather than scrolling the home page.

   Both control rows are buttons, not <select>s: a native select opens the OS
   picker on mobile, which is the one piece of chrome on the site nobody can
   style. */
export default function ProductsPanel({
  open, onClose, products, loading, error,
  category, onCategoryChange, sort, onSortChange, onSelect,
}) {
  const pill = (active) =>
    `grid h-11 place-items-center px-3 text-[11px] tracking-[0.14em] uppercase transition-colors ` +
    (active ? "text-ink" : "text-muted hover:text-ink");

  return (
    <Panel open={open} onClose={onClose} eyebrow="The catalogue" wide>
      <h2 className="mb-8 font-display text-4xl text-ink md:text-5xl">Everything we make.</h2>
      <hr className="doc-rule" />

      <div className="mb-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line pb-2">
        <nav className="flex flex-wrap items-center gap-x-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => onCategoryChange(c.key)}
              aria-pressed={category === c.key}
              className={`relative ${pill(category === c.key)}`}
            >
              {c.label}
              {category === c.key && (
                <span className="absolute right-3 bottom-1.5 left-3 h-px bg-gold-dark" />
              )}
            </button>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-x-1">
          <span className="mr-1 text-[10px] tracking-[0.14em] text-muted uppercase">Sort</span>
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => onSortChange(s.value)}
              aria-pressed={sort === s.value}
              aria-label={s.arrow ? `Sort by price, ${s.value === "price-asc" ? "low to high" : "high to low"}` : `Sort by ${s.label}`}
              className={`${pill(sort === s.value)} grid-flow-col gap-1`}
            >
              {s.label}
              {s.arrow && (
                <span aria-hidden="true" className="text-[15px] leading-none">{s.arrow}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-8 text-[11px] tracking-[0.14em] text-muted uppercase">
        {loading ? "Loading…" : `${products.length} ${products.length === 1 ? "piece" : "pieces"}`}
      </p>

      {/* Full-bleed: the grid escapes the panel's reading measure and runs to
          both edges of the viewport, which is what makes a gutterless lattice
          read as a catalogue rather than a boxed-in widget. */}
      <div className="full-bleed">
        <ProductGrid
          products={products}
          loading={loading}
          error={error}
          onSelect={onSelect}
        />
      </div>
    </Panel>
  );
}
