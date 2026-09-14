import ProductCard from "./ProductCard";
import { useReveal } from "../hooks/useReveal";

/* Just the grid and its empty/loading/error states. The chrome around it —
   categories, sort, the canvas itself — lives in ProductsPanel. */
export default function ProductGrid({ products, loading, error, onSelect }) {
  // Re-keyed on the product list so a filter change replays the stagger.
  const gridRef = useReveal({ enabled: !loading && !error && products.length > 0 });

  if (error) return <p className="py-16 text-center text-sm text-brown">{error}</p>;

  if (loading) {
    // Skeletons hold the grid's shape so the page doesn't jump when the real
    // products arrive.
    return (
      <div className="grid grid-cols-2 gap-0 border-t border-l border-line/60 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-4/5 bg-cream-dark" />
            <div className="mt-3 h-3 w-2/3 bg-cream-dark" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        Nothing here yet. Try another category.
      </p>
    );
  }

  return (
    <div
      ref={gridRef}
      key={products.map((p) => p.id).join(",")}
      className="grid grid-cols-2 gap-0 border-t border-l border-line/60 md:grid-cols-3 lg:grid-cols-4"
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} onSelect={onSelect} />
      ))}
    </div>
  );
}
