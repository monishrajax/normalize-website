import Panel from "./Panel";
import { money } from "../lib/api";
import { useCart } from "../context/CartContext";

export default function CartPanel({ open, onClose, onCheckout }) {
  const { items, totals, setQty, removeLine } = useCart();

  return (
    <Panel open={open} onClose={onClose} eyebrow="Your bag" wide>
      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="mb-6 font-display text-3xl text-ink">Your bag is empty.</p>
          <button onClick={onClose}
                  className="min-h-11 border border-ink px-8 text-[11px] tracking-[0.16em] text-ink uppercase
                             transition-colors hover:bg-ink hover:text-cream">
            Continue shopping
          </button>
        </div>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
          <div>
            {items.map((l) => (
              <div key={`${l.productId}-${l.variant}`}
                   className="flex gap-5 border-b border-line py-6">
                <div className="h-32 w-26 shrink-0 overflow-hidden bg-cream-dark">
                  {l.image && (
                    <img src={l.image} alt={l.name} loading="lazy" decoding="async"
                         className="h-full w-full object-cover" />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <h3 className="text-xs tracking-[0.08em] text-ink uppercase">{l.name}</h3>
                    {l.variant && <p className="mt-1 text-[11px] text-muted uppercase">{l.variant}</p>}
                    <p className="mt-2 text-xs text-muted tabular-nums">{money(l.price)}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center border border-line">
                      <button onClick={() => setQty(l.productId, l.variant, l.qty - 1)}
                              aria-label={`Decrease quantity of ${l.name}`}
                              className="grid h-11 w-11 place-items-center text-sm text-muted transition-colors hover:text-ink">
                        −
                      </button>
                      <span className="min-w-8 text-center text-xs text-ink tabular-nums">{l.qty}</span>
                      <button onClick={() => setQty(l.productId, l.variant, l.qty + 1)}
                              aria-label={`Increase quantity of ${l.name}`}
                              className="grid h-11 w-11 place-items-center text-sm text-muted transition-colors hover:text-ink">
                        +
                      </button>
                    </div>

                    <button onClick={() => removeLine(l.productId, l.variant)}
                            className="flex min-h-11 items-center text-[11px] tracking-[0.12em] text-muted uppercase
                                       underline underline-offset-4 transition-colors hover:text-brown">
                      Remove
                    </button>
                  </div>
                </div>

                <p className="shrink-0 text-xs text-ink tabular-nums">{money(l.lineTotal)}</p>
              </div>
            ))}
          </div>

          {/* Summary */}
          <aside className="h-fit border border-line p-6 lg:sticky lg:top-24">
            <h3 className="mb-5 text-[11px] tracking-[0.18em] text-muted uppercase">Summary</h3>

            <dl className="space-y-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-ink tabular-nums">{money(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Discount</dt>
                  <dd className="text-gold-dark tabular-nums">−{money(totals.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="text-ink tabular-nums">
                  {totals.shipping === 0 ? "Free" : money(totals.shipping)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-sm">
                <dt className="text-ink">Total</dt>
                <dd className="text-ink tabular-nums">{money(totals.total)}</dd>
              </div>
            </dl>

            <button onClick={onCheckout}
                    className="mt-6 min-h-11 w-full bg-ink px-8 py-4 text-[11px] tracking-[0.18em] text-cream uppercase
                               transition-opacity hover:opacity-85">
              Checkout
            </button>

            <p className="mt-4 text-center text-[10px] tracking-wide text-muted">
              Taxes included · Easy 14-day returns
            </p>
          </aside>
        </div>
      )}
    </Panel>
  );
}
