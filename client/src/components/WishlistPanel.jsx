import Panel from "./Panel";
import ProductCard from "./ProductCard";
import { useCart } from "../context/CartContext";

export default function WishlistPanel({ open, onClose, products, onSelect }) {
  const { wishlist } = useCart();
  const saved = products.filter((p) => wishlist.includes(p.id));

  return (
    <Panel open={open} onClose={onClose} eyebrow="Wishlist" wide>
      {saved.length === 0 ? (
        <div className="py-20 text-center">
          <p className="mb-6 font-display text-3xl text-ink">Nothing saved yet.</p>
          <p className="text-sm text-muted">
            Tap the star on anything you want to keep an eye on.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {saved.map((p) => (
            <ProductCard key={p.id} product={p}
                         onSelect={(prod) => { onSelect(prod); onClose(); }} />
          ))}
        </div>
      )}
    </Panel>
  );
}
