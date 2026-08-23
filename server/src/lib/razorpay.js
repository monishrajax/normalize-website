import crypto from "node:crypto";

const API = "https://api.razorpay.com/v1";

function auth() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  return { keyId, keySecret, basic: Buffer.from(`${keyId}:${keySecret}`).toString("base64") };
}

export function publicKeyId() {
  return auth().keyId;   // safe to send to the browser; the secret never is
}

export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const { basic } = auth();
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${basic}` },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      // Capture as soon as the payment is authorised. Without this the charge
      // depends on an account-level dashboard toggle, and an authorised-but-
      // uncaptured payment is released back to the customer after ~5 days —
      // the order looks paid, then silently isn't.
      payment_capture: 1,
      // Razorpay rejects the whole order if a note value exceeds 256 chars.
      notes: Object.fromEntries(
        Object.entries(notes || {}).map(([k, v]) => [k, String(v).slice(0, 255)])
      ),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.description || "Could not start the payment.");
    err.razorpay = data;
    throw err;
  }
  return data;
}

/* The security gate. Razorpay signs "<order_id>|<payment_id>" with the key
   secret; anyone who cannot reproduce that HMAC did not come from Razorpay.
   Without this check a person could POST "payment succeeded" and get free goods. */
export function isValidPaymentSignature({ orderId, paymentId, signature }) {
  const { keySecret } = auth();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature || ""), "utf8");
  // timingSafeEqual throws on a length mismatch, so guard before comparing.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Webhooks are signed with a DIFFERENT secret (the one you set when creating
   the webhook), over the raw request body. */
export function isValidWebhookSignature({ rawBody, signature }) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
