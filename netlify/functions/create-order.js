/* POST /.netlify/functions/create-order
   Creates a Razorpay order. The amount is computed HERE from the server's own
   catalogue — never taken from the browser.

   Body: { items: [{ id, size, qty }] }
   Returns: { orderId, amount, currency, keyId }  (keyId is the PUBLIC key)
*/
const { reply, priceCart } = require("./_lib");

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS") return reply(204, {});
  if(event.httpMethod !== "POST") return reply(405, { error: "Method not allowed." });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if(!keyId || !keySecret) return reply(500, { error: "Payments are not configured yet." });

  let items, promo;
  try { ({ items, promo } = JSON.parse(event.body || "{}")); }
  catch { return reply(400, { error: "Malformed request." }); }

  let priced;
  try { priced = priceCart(items, promo); }
  catch(err){ return reply(400, { error: err.message }); }

  // Charge the TOTAL — subtotal less any discount, plus shipping. Charging the
  // bare subtotal would silently eat the shipping fee on every small order.
  const amountPaise = Math.round(priced.total * 100);   // Razorpay works in paise

  try{
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64")
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: "NRM-" + Date.now(),
        // Capture the money as soon as it is authorised. Without this the
        // charge depends on the account's auto-capture dashboard setting, and
        // an authorised-but-uncaptured payment is released back to the
        // customer after about five days — the order looks paid, then isn't.
        payment_capture: 1,
        notes: {
          // Razorpay caps a note value at 256 characters and rejects the whole
          // order if it runs over, so this is trimmed rather than trusted.
          items: priced.lines.map(l => `${l.name} (${l.variant}) x${l.qty}`).join(", ").slice(0, 255)
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){
      console.error("Razorpay order failed:", data);
      return reply(502, { error: "Could not start the payment. Please try again." });
    }
    return reply(200, {
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId,                                   // public key — safe to send
      // The page re-displays these so the customer always sees the figure that
      // is actually being charged, not a locally computed guess.
      breakdown: {
        subtotal: priced.subtotal,
        discount: priced.discount,
        shipping: priced.shipping,
        total: priced.total,
        promo: priced.promo
      },
      summary: priced.lines.map(l => ({ name: l.name, variant: l.variant, qty: l.qty }))
    });
  }catch(err){
    console.error("create-order error:", err);
    return reply(500, { error: "Could not start the payment. Please try again." });
  }
};
