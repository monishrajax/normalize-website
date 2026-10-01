/* One place that knows how to talk to the API. In development Vite proxies
   /api to the Express server, and in production both are served from the same
   origin, so there is no environment-specific base URL anywhere in the app. */
const BASE = import.meta.env.VITE_API_BASE || "/api";

/* How this module gets an access token without importing the auth context.

   AuthContext already imports `api`, so importing it back would be a cycle —
   and the deeper reason is that this file should not know accounts exist. It
   holds a getter that AuthContext registers at mount; until then it returns
   null and every request goes out unauthenticated, which is exactly right for
   a storefront whose default path is guest checkout. */
let getAccessToken = async () => null;

export function setAccessTokenProvider(fn) {
  getAccessToken = typeof fn === "function" ? fn : async () => null;
}

async function request(path, options = {}) {
  let res;

  /* Asked for on every request rather than cached here, because the token
     expires (an hour) and supabase-js refreshes it in the background. A copy
     held in this module would go stale and start 401ing mid-session. A failure
     to get one is not fatal — the request simply goes out as a guest and the
     server decides. */
  let auth = {};
  try {
    const token = await getAccessToken();
    if (token) auth.Authorization = `Bearer ${token}`;
  } catch { /* signed out, or refresh failed: continue as a guest */ }

  try {
    res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json", ...auth, ...(options.headers || {}) },
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

  /* Account — every one of these 401s without a valid token, by design. */
  getAccount: () => request("/account"),
  updateProfile: (patch) => request("/account", { method: "PUT", body: JSON.stringify(patch) }),
  getMyOrders: () => request("/account/orders"),

  listAddresses: () => request("/account/addresses"),
  createAddress: (data) => request("/account/addresses", { method: "POST", body: JSON.stringify(data) }),
  updateAddress: (id, data) =>
    request(`/account/addresses/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAddress: (id) =>
    request(`/account/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getWishlist: () => request("/account/wishlist"),
  // Merges rather than replaces — see the route comment.
  mergeWishlist: (productIds) =>
    request("/account/wishlist", { method: "POST", body: JSON.stringify({ productIds }) }),
  unsaveProduct: (productId) =>
    request(`/account/wishlist/${encodeURIComponent(productId)}`, { method: "DELETE" }),

  // The early-access gate's one write. No auth — a stranger with just a name
  // and an email, before they have any reason to sign in.
  submitWaitlist: (data) =>
    request("/waitlist", { method: "POST", body: JSON.stringify(data) }),
};

export function money(n) {
  return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
}
