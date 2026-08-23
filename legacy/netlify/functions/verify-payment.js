/* POST /.netlify/functions/verify-payment

   1. Verifies the Razorpay signature (HMAC-SHA256 with the KEY SECRET).
      This is the security gate — without it anyone could POST
      "payment succeeded" and get free goods.
   2. Only if the signature is valid, creates the Shiprocket order and
      assigns an AWB.

   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature,
           customer: {...}, items: [{id,size,qty}] }
   Returns: { ok, awb, courier, shipmentId, shiprocketOrderId }
*/
const crypto = require("crypto");
const { reply, priceCart, shiprocket } = require("./_lib");

/* During a PRE-BOOK you usually take payment now and ship weeks later, so
   minting an AWB immediately is wrong — couriers expect dispatch soon after.
   Set SHIPROCKET_CREATE_ON_PAYMENT=false to record the payment only, and
   create shipments later from the Shiprocket dashboard. */
const CREATE_SHIPMENT = process.env.SHIPROCKET_CREATE_ON_PAYMENT !== "false";

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS") return reply(204, {});
  if(event.httpMethod !== "POST") return reply(405, { error: "Method not allowed." });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if(!keySecret) return reply(500, { error: "Payments are not configured yet." });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return reply(400, { error: "Malformed request." }); }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, customer = {}, items, promo } = body;
  if(!razorpay_order_id || !razorpay_payment_id || !razorpay_signature){
    return reply(400, { error: "Missing payment details." });
  }

  // ---- 1. Signature check (timing-safe) ----
  const expected = crypto.createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(razorpay_signature), "utf8");
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if(!valid){
    console.warn("Rejected payment with bad signature:", razorpay_order_id);
    return reply(400, { error: "Payment could not be verified." });
  }

  if(!CREATE_SHIPMENT){
    return reply(200, { ok: true, paymentId: razorpay_payment_id, shipmentDeferred: true });
  }

  // ---- 2. Create the Shiprocket order ----
  let priced;
  try { priced = priceCart(items, promo); }
  catch(err){ return reply(400, { error: err.message }); }

  const today = new Date().toISOString().slice(0, 19).replace("T", " ");
  const first = (customer.name || "Customer").trim().split(/\s+/);

  const orderPayload = {
    order_id: "NRM-" + razorpay_payment_id.replace(/^pay_/, ""),
    order_date: today,
    pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
    billing_customer_name: first[0],
    billing_last_name: first.slice(1).join(" ") || ".",
    billing_address: customer.address || "",
    billing_city: customer.city || "",
    billing_pincode: customer.pincode || "",
    billing_state: customer.state || "",
    billing_country: "India",
    billing_email: customer.email || "",
    billing_phone: String(customer.phone || "").replace(/\D/g, "").slice(-10),
    shipping_is_billing: true,
    order_items: priced.lines.map(l => ({
      name: `${l.name}${l.variant ? " — " + l.variant : ""}`,
      sku: `${l.sku}-${(l.variant || "STD").toUpperCase()}`,
      units: l.qty,
      selling_price: l.price
    })),
    payment_method: "Prepaid",
    sub_total: priced.total,          // what was actually collected, not the line subtotal
    length: priced.lines[0].dims.length,
    breadth: priced.lines[0].dims.breadth,
    height: priced.lines[0].dims.height,
    weight: priced.lines.reduce((w, l) => w + l.weightKg * l.qty, 0)
  };

  try{
    const created = await shiprocket("/orders/create/adhoc", {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });
    if(!created.ok || !created.data.shipment_id){
      console.error("Shiprocket order failed:", created.status, created.data);
      // Payment already succeeded — never fail the customer for our logistics issue.
      return reply(200, {
        ok: true, paymentId: razorpay_payment_id, shipmentPending: true,
        note: "Payment received. Shipment will be arranged manually."
      });
    }

    // ---- 3. Assign an AWB ----
    const awbRes = await shiprocket("/courier/assign/awb", {
      method: "POST",
      body: JSON.stringify({ shipment_id: created.data.shipment_id })
    });
    const awbData = (awbRes.data && (awbRes.data.response || {}).data) || {};

    return reply(200, {
      ok: true,
      paymentId: razorpay_payment_id,
      shiprocketOrderId: created.data.order_id,
      shipmentId: created.data.shipment_id,
      awb: awbData.awb_code || null,
      courier: awbData.courier_name || null,
      shipmentPending: !awbData.awb_code
    });
  }catch(err){
    console.error("verify-payment shipment error:", err);
    return reply(200, {
      ok: true, paymentId: razorpay_payment_id, shipmentPending: true,
      note: "Payment received. Shipment will be arranged manually."
    });
  }
};
