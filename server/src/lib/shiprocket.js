/* Shiprocket credentials stay here, on the server. The token is cached in
   module scope so a warm process reuses it instead of logging in per request. */
let cachedToken = null;
let cachedTokenExpiry = 0;

export function shiprocketConfigured() {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

async function shiprocketToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) throw new Error("Shiprocket credentials are not configured.");

  const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error("Shiprocket login failed: " + (data.message || res.status));
  }
  cachedToken = data.token;
  // Shiprocket tokens last 10 days; refresh after 8 to stay clear of the edge.
  cachedTokenExpiry = now + 8 * 24 * 60 * 60 * 1000;
  return cachedToken;
}

export async function shiprocket(path, options = {}) {
  const token = await shiprocketToken();
  const res = await fetch("https://apiv2.shiprocket.in/v1/external" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

/* Shiprocket nests its tracking payload differently for AWB vs order_id
   lookups, so dig for whichever shape came back and return one flat form. */
export function normaliseTracking(payload) {
  const box = payload && (payload.tracking_data || payload);
  const track = box && (box.shipment_track || [])[0];
  const activities = (box && box.shipment_track_activities) || [];

  return {
    awb: track && track.awb_code ? String(track.awb_code) : null,
    courier: (track && track.courier_name) || null,
    status: (track && track.current_status) || (box && box.shipment_status) || "In transit",
    etd: (track && track.edd) || null,
    scans: activities.slice(0, 25).map((a) => ({
      activity: a.activity || a["sr-status-label"] || "",
      location: a.location || "",
      date: a.date || "",
    })),
  };
}
