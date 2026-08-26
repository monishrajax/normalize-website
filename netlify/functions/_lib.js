/* Shared helpers for the Normalize serverless functions.
   Nothing in here ever reaches the browser — this file lives on the server. */

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": process.env.SITE_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function reply(statusCode, body){
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/* ---------------- Catalogue: the ONLY source of truth for price ----------------
   Prices are never taken from the browser. The client sends {id, size, qty};
   the server looks the price up here. Otherwise a customer could edit the
   request and pay ₹1. Keep this in sync with PRODUCTS in index.html. */
const CATALOGUE = {
  5: { name: "Butterfly Tote", price: 799, sku: "NRM-BT-001", weightKg: 0.35,
       dims: { length: 40, breadth: 12, height: 35 } }
};

/* Shipping and promo rules also live here, for the same reason prices do: the
   customer is charged what THIS file works out, not what the page displayed.
   These three must match FREE_SHIPPING_THRESHOLD / SHIPPING_FEE / PROMO_CODES
   in index.html, which are for display only. */
const SHIPPING_FEE = 199;
const FREE_SHIPPING_THRESHOLD = 1499;
const PROMO_CODES = { "WELCOME10": 0.10 };

function priceCart(items, promoCode){
  if(!Array.isArray(items) || !items.length) throw new Error("Cart is empty.");
  const lines = items.map(raw => {
    const product = CATALOGUE[Number(raw.id)];
    if(!product) throw new Error("Unknown item in cart.");
    const qty = Math.min(99, Math.max(1, Math.floor(Number(raw.qty) || 1)));
    const variant = typeof raw.size === "string" ? raw.size.slice(0, 40) : "";
    return { ...product, id: Number(raw.id), qty, variant, lineTotal: product.price * qty };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  // An unknown or misspelled code is simply worth nothing — never an error,
  // so a typo can't block a customer who is ready to pay.
  const code = typeof promoCode === "string" ? promoCode.trim().toUpperCase().slice(0, 32) : "";
  const rate = PROMO_CODES[code] || 0;
  const discount = Math.round(subtotal * rate);

  const shipping = (subtotal - discount) >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal - discount + shipping;

  return { lines, subtotal, discount, shipping, total, promo: rate ? code : "" };
}

/* ---------------- Shiprocket auth (token cached across warm invocations) ---- */
let cachedToken = null;
let cachedTokenExpiry = 0;

async function shiprocketToken(){
  const now = Date.now();
  if(cachedToken && now < cachedTokenExpiry) return cachedToken;

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if(!email || !password) throw new Error("Shiprocket credentials are not configured.");

  const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok || !data.token){
    throw new Error("Shiprocket login failed: " + (data.message || res.status));
  }
  cachedToken = data.token;
  // Shiprocket tokens last 10 days; refresh ours after 8 to stay clear of the edge.
  cachedTokenExpiry = now + 8 * 24 * 60 * 60 * 1000;
  return cachedToken;
}

async function shiprocket(path, options = {}){
  const token = await shiprocketToken();
  const res = await fetch("https://apiv2.shiprocket.in/v1/external" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

module.exports = {
  reply, JSON_HEADERS, CATALOGUE, priceCart, shiprocket, shiprocketToken,
  SHIPPING_FEE, FREE_SHIPPING_THRESHOLD, PROMO_CODES
};