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
  } catch {
    // A network failure has no JSON body to read, so it needs its own message.
    throw new Error("Couldn't reach the server. Check your connection.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export const api = {
  getConfig: () => request("/config"),

  getProducts: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v != null)
    ).toString();
    return request(`/products${q ? "?" + q : ""}`);
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
