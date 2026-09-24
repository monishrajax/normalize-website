/* One place that knows how to talk to the API. In development Vite proxies
   /api to the Express server, and in production both are served from the same
   origin, so there is no environment-specific base URL anywhere in the app. */
const BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (err) {
    /* An abort is the caller's own doing — a superseded search, a panel that
       closed — not a connection problem, so it is rethrown as itself and the
       caller can tell "I cancelled this" from "the network failed". */
    if (err?.name === "AbortError") throw err;
    // A network failure has no JSON body to read, so it needs its own message.
    throw new Error("Couldn't reach the server. Check your connection.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export const api = {
  getConfig: () => request("/config"),

  /* `options` is fetch's, not the query string's — it is how a caller hands in
     an AbortSignal. Keep the two apart: anything in `params` becomes a URL
     parameter, so a signal passed there would be serialised into the query. */
  getProducts: (params = {}, options = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v != null)
    ).toString();
    return request(`/products${q ? "?" + q : ""}`, options);
  },

  getProduct: (slug) => request(`/products/${encodeURIComponent(slug)}`),

  // Only ids, variants and quantities travel — the server prices the cart.
  createOrder: (items, promo) =>
    request("/orders", { method: "POST", body: JSON.stringify({ items, promo }) }),

  verifyPayment: (payload) =>
    request("/orders/verify", { method: "POST", body: JSON.stringify(payload) }),

  trackOrder: (awb) => request(`/track?awb=${encodeURIComponent(awb)}`),
};

export function money(n) {
  return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
}
