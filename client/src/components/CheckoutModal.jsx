import { useState } from "react";
import Panel from "./Panel";
import { api, money } from "../lib/api";
import { useCart } from "../context/CartContext";
import { useRazorpay } from "../hooks/useRazorpay";

const FIELDS = [
  { name: "name",    label: "Full name",   type: "text",  autoComplete: "name",            span: 2 },
  { name: "email",   label: "Email",       type: "email", autoComplete: "email",           span: 1 },
  { name: "phone",   label: "Phone",       type: "tel",   autoComplete: "tel",             span: 1 },
  { name: "address", label: "Address",     type: "text",  autoComplete: "street-address",  span: 2 },
  { name: "city",    label: "City",        type: "text",  autoComplete: "address-level2",  span: 1 },
  { name: "state",   label: "State",       type: "text",  autoComplete: "address-level1",  span: 1 },
  { name: "pincode", label: "PIN code",    type: "text",  autoComplete: "postal-code",     span: 1 },
];

const EMPTY = { name: "", email: "", phone: "", address: "", city: "", state: "", pincode: "" };

export default function CheckoutModal({ open, onClose }) {
  const { items, totals, clearCart, promoCode } = useCart();
  const loadRazorpay = useRazorpay();

  const [customer, setCustomer] = useState(EMPTY);
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  // Once the server has priced the cart, show ITS figures rather than ours.
  const [serverTotals, setServerTotals] = useState(null);

  const shown = serverTotals || totals;
  const set = (k, v) => setCustomer((c) => ({ ...c, [k]: v }));

  const close = () => {
    onClose();
    // Reset only after the closing transition, so the panel doesn't visibly
    // flip back to the form on its way out.
    setTimeout(() => { setConfirmed(null); setStatus({ text: "", kind: "" }); setServerTotals(null); }, 500);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setStatus({ text: "Starting secure payment…", kind: "" });

    try {
      const Razorpay = await loadRazorpay();

      // Only ids, variants and quantities travel. The server prices the cart.
      const payload = items.map((l) => ({ productId: l.productId, variant: l.variant, qty: l.qty }));
      const order = await api.createOrder(payload, promoCode);

      // The server has the final say on the amount; re-paint the summary from
      // its answer so the figure on screen is the figure being charged.
      if (order.breakdown) setServerTotals(order.breakdown);
      setStatus({ text: "", kind: "" });

      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "NORMALIZE",
        description: `Order ${order.orderNumber}`,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone },
        theme: { color: "#c9a961" },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setStatus({ text: "Payment cancelled — your bag is still saved.", kind: "err" });
          },
        },
        handler: async (response) => {
          setStatus({ text: "Confirming your order…", kind: "" });
          try {
            const result = await api.verifyPayment({ ...response, customer });
            setConfirmed({ order: result.order, orderNumber: order.orderNumber });
            clearCart();
          } catch {
            /* The money HAS been taken by this point — never imply otherwise.
               The webhook will settle the order server-side regardless, so this
               is a display problem, not a lost sale. */
            setConfirmed({
              failedToConfirm: true,
              paymentId: response.razorpay_payment_id,
              orderNumber: order.orderNumber,
            });
            clearCart();
          } finally {
            setBusy(false);
          }
        },
      });

      rzp.on("payment.failed", (res) => {
        setBusy(false);
        setStatus({ text: res?.error?.description || "Payment failed. Please try again.", kind: "err" });
      });

      rzp.open();
    } catch (err) {
      setStatus({ text: err.message, kind: "err" });
      setBusy(false);
    }
  }

  /* Rule 2: checkout is a full-viewport canvas like every other secondary
     surface — it was the last modal on the site. */
  return (
    <Panel open={open} onClose={close} eyebrow="Checkout">
      {confirmed ? (
        <ConfirmationView data={confirmed} onClose={close} />
      ) : (
        <>
          <h2 className="mb-5 font-display text-4xl text-ink md:text-5xl">Where should it go?</h2>
          <hr className="doc-rule" />

            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.name} className={f.span === 2 ? "sm:col-span-2" : ""}>
                  <span className="mb-1.5 block text-[10px] tracking-[0.14em] text-muted uppercase">
                    {f.label}
                  </span>
                  <input
                    type={f.type}
                    required
                    autoComplete={f.autoComplete}
                    value={customer[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                    /* Indian mobile numbers and PIN codes are fixed-length and
                       digits-only; catching that here saves a courier rejecting
                       the shipment later. */
                    {...(f.name === "phone"   ? { pattern: "[6-9][0-9]{9}", maxLength: 10,
                                                  title: "10-digit Indian mobile number" } : {})}
                    {...(f.name === "pincode" ? { pattern: "[1-9][0-9]{5}", maxLength: 6,
                                                  title: "6-digit PIN code" } : {})}
                    className="field"
                  />
                </label>
              ))}

              <div className="mt-2 border-t border-line pt-5 sm:col-span-2">
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="text-ink tabular-nums">{money(shown.subtotal)}</dd>
                  </div>
                  {shown.discount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Discount</dt>
                      <dd className="text-gold-dark tabular-nums">−{money(shown.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted">Shipping</dt>
                    <dd className="text-ink tabular-nums">
                      {shown.shipping === 0 ? "Free" : money(shown.shipping)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2 text-sm">
                    <dt className="text-ink">Total</dt>
                    <dd className="text-ink tabular-nums">{money(shown.total)}</dd>
                  </div>
                </dl>
              </div>

              {status.text && (
                <p role="status"
                   className={`sm:col-span-2 text-xs ${status.kind === "err" ? "text-brown" : "text-muted"}`}>
                  {status.text}
                </p>
              )}

              <button type="submit" disabled={busy || items.length === 0}
                      className="mt-2 min-h-11 w-full bg-ink px-8 py-4 text-[11px] tracking-[0.18em] text-cream uppercase
                                 transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2">
                {busy ? "Please wait…" : `Pay ${money(shown.total)}`}
              </button>

              <p className="text-center text-[10px] tracking-wide text-muted sm:col-span-2">
                Payments secured by Razorpay. Card details never touch our servers.
              </p>
          </form>
        </>
      )}
    </Panel>
  );
}

function ConfirmationView({ data, onClose }) {
  const { order, failedToConfirm, paymentId, orderNumber } = data;

  return (
    <div className="py-6 text-center">
      <p className="mb-2 text-[11px] tracking-[0.2em] text-gold-dark uppercase">
        {failedToConfirm ? "Payment received" : "Thank you"}
      </p>
      <h2 className="mb-6 font-display text-4xl text-ink">
        {failedToConfirm ? "We're on it." : "Order confirmed."}
      </h2>

      {failedToConfirm ? (
        <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-muted">
          Your payment went through, but we hit a snag confirming it automatically.
          Nothing is lost — quote payment id{" "}
          <strong className="text-ink">{paymentId}</strong> to{" "}
          <a href="mailto:contact@normalize.world"
             className="text-gold-dark underline underline-offset-4">contact@normalize.world</a>{" "}
          and we'll sort it out straight away.
        </p>
      ) : (
        <div className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-muted">
          <p className="mb-4">
            Order <strong className="text-ink">{order?.orderNumber || orderNumber}</strong>
          </p>
          {order?.awb ? (
            <p>
              Your tracking number is <strong className="text-ink">{order.awb}</strong>
              {order.courier ? ` with ${order.courier}` : ""}. Track it any time from
              the footer.
            </p>
          ) : (
            <p>We'll email your tracking number as soon as your parcel is dispatched.</p>
          )}
        </div>
      )}

      <button onClick={onClose}
              className="border border-ink px-9 py-3.5 text-[11px] tracking-[0.16em] text-ink uppercase
                         transition-colors hover:bg-ink hover:text-cream">
        Continue shopping
      </button>
    </div>
  );
}
