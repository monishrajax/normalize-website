import Product from "../models/Product.js";

/* Shipping and promo rules live on the server for the same reason prices do:
   the customer is charged what THIS file works out, not what the page showed.
   The client fetches these via GET /api/config purely to display them, so the
   two can never drift the way the old FREE_SHIPPING_THRESHOLD pair did. */
export const SHIPPING_FEE = Number(process.env.SHIPPING_FEE || 199);
export const FREE_SHIPPING_THRESHOLD = Number(process.env.FREE_SHIPPING_THRESHOLD || 1499);
export const PROMO_CODES = { WELCOME10: 0.1 };

export class PricingError extends Error {}

/* Turns the browser's {productId, variant, qty} list into real money.
   Never trusts a price, a name, or a total from the request. */
export async function priceCart(items, promoCode) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PricingError("Cart is empty.");
  }
  if (items.length > 50) {
    throw new PricingError("Too many items in cart.");
  }

  // One round trip for the whole cart rather than a query per line.
  const ids = [...new Set(items.map((i) => String(i.productId || "")))];
  const found = await Product.find({ _id: { $in: ids.filter(isObjectId) } });
  const byId = new Map(found.map((p) => [p._id.toString(), p]));

  const lines = items.map((raw) => {
    const product = byId.get(String(raw.productId));
    if (!product) throw new PricingError("Unknown item in cart.");
    if (!product.isSellable) throw new PricingError(`${product.name} is not available right now.`);

    const qty = Math.min(99, Math.max(1, Math.floor(Number(raw.qty) || 1)));
    const variant = typeof raw.variant === "string" ? raw.variant.slice(0, 40) : "";

    return {
      product,
      productId: product._id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      weightKg: product.weightKg,
      dims: product.dims,
      qty,
      variant,
      lineTotal: product.price * qty,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  // An unknown or misspelled code is simply worth nothing — never an error, so
  // a typo can't block a customer who is ready to pay.
  const code = typeof promoCode === "string" ? promoCode.trim().toUpperCase().slice(0, 32) : "";
  const rate = PROMO_CODES[code] || 0;
  const discount = Math.round(subtotal * rate);

  const shipping = subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal - discount + shipping;

  return { lines, subtotal, discount, shipping, total, promo: rate ? code : "" };
}

function isObjectId(v) {
  return /^[a-f\d]{24}$/i.test(v);
}
