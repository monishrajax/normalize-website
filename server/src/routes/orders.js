import { Router } from "express";
import express from "express";
import {
  create as createOrder,
  findByRazorpayOrderId,
  findByOrderNumber,
  update as updateOrder,
  settleIfUnpaid,
  toPublic,
} from "../models/Order.js";
import { priceCart, PricingError } from "../lib/pricing.js";
import { createRazorpayOrder, isValidPaymentSignature, isValidWebhookSignature, publicKeyId } from "../lib/razorpay.js";
import { shiprocket, shiprocketConfigured } from "../lib/shiprocket.js";

const router = Router();

/* During a PRE-BOOK you take payment now and ship weeks later, so minting an
   AWB immediately is wrong — couriers expect dispatch soon after. Leave this
   false to record the payment only and book couriers by hand later. */
const CREATE_SHIPMENT = process.env.SHIPROCKET_CREATE_ON_PAYMENT === "true";

/* ---------------------------------------------------------------------------
   POST /api/orders — price the cart, open a Razorpay order, record it as
   "created". The amount is computed HERE; nothing about money is taken from
   the request body beyond which items and how many.
--------------------------------------------------------------------------- */
router.post("/", async (req, res, next) => {
  try {
    const { items, promo } = req.body || {};

    let priced;
    try {
      priced = await priceCart(items, promo);
    } catch (err) {
      if (err instanceof PricingError) return res.status(400).json({ error: err.message });
      throw err;
    }

    const orderNumber = "NRM-" + Date.now().toString(36).toUpperCase();
    const rzpOrder = await createRazorpayOrder({
      amountPaise: Math.round(priced.total * 100),   // Razorpay works in paise
      receipt: orderNumber,
      notes: { items: priced.lines.map((l) => `${l.name} (${l.variant}) x${l.qty}`).join(", ") },
    });

    await createOrder({
      orderNumber,
      razorpayOrderId: rzpOrder.id,
      status: "created",
      items: priced.lines.map((l) => ({
        productId: l.productId, name: l.name, price: l.price,
        variant: l.variant, qty: l.qty, sku: l.sku,
      })),
      pricing: {
        subtotal: priced.subtotal, discount: priced.discount,
        shipping: priced.shipping, total: priced.total, promo: priced.promo,
      },
    });

    res.json({
      orderNumber,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: publicKeyId(),          // public key — safe to send
      // Re-displayed by the client so the customer always sees the figure that
      // is actually being charged, not a locally computed guess.
      breakdown: {
        subtotal: priced.subtotal, discount: priced.discount,
        shipping: priced.shipping, total: priced.total, promo: priced.promo,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* Both settle paths share this. `settleIfUnpaid` updates only while the row is
   still "created", so whichever of the browser and the webhook arrives second
   gets null back and stops — the database is the referee rather than a status
   check in JavaScript that another request can slip past. */
async function settle(order, patch) {
  const settled = await settleIfUnpaid(order.id, patch);
  if (!settled) return null;          // someone else already settled it
  if (CREATE_SHIPMENT && shiprocketConfigured()) {
    await bookShipment(settled).catch((err) => console.error("Shipment booking failed:", err));
  }
  return settled;
}

/* ---------------------------------------------------------------------------
   POST /api/orders/verify — the security gate. Only a request carrying a
   signature Razorpay itself produced can mark an order paid.
--------------------------------------------------------------------------- */
router.post("/verify", async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, customer = {} } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details." });
    }

    const valid = isValidPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) {
      console.warn("Rejected payment with bad signature:", razorpay_order_id);
      return res.status(400).json({ error: "Payment could not be verified." });
    }

    const order = await findByRazorpayOrderId(razorpay_order_id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    const settled = await settle(order, {
      status: "paid",
      razorpayPaymentId: razorpay_payment_id,
      paidAt: new Date(),
      customer: {
        name: String(customer.name || "").slice(0, 120),
        email: String(customer.email || "").slice(0, 160),
        phone: String(customer.phone || "").replace(/\D/g, "").slice(-10),
        address: String(customer.address || "").slice(0, 300),
        city: String(customer.city || "").slice(0, 80),
        state: String(customer.state || "").slice(0, 80),
        pincode: String(customer.pincode || "").slice(0, 10),
      },
    });

    /* The webhook may have got here first — settling twice would double-book
       the courier, so treat an already-paid order as success and stop. */
    const current = settled || (await findByRazorpayOrderId(razorpay_order_id));
    res.json({ ok: true, order: toPublic(current) });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------------
   POST /api/orders/webhook — the safety net.
   If the customer's browser dies between paying and the success callback, the
   verify route above never runs and the sale would be invisible. Razorpay
   calls this server-to-server regardless, so the order still settles.
   Mounted with a RAW body parser: the signature covers the exact bytes sent.
--------------------------------------------------------------------------- */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.get("x-razorpay-signature");
  const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : "";

  if (!isValidWebhookSignature({ rawBody, signature })) {
    console.warn("Rejected webhook with bad signature.");
    return res.status(400).json({ error: "Invalid signature." });
  }

  // Acknowledge immediately — Razorpay retries on any non-2xx, and a slow
  // courier call here would earn us duplicate deliveries.
  res.json({ received: true });

  try {
    const event = JSON.parse(rawBody);
    if (event.event !== "payment.captured") return;

    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id) return;

    const order = await findByRazorpayOrderId(payment.order_id);
    if (!order) return;

    // Razorpay carries whatever the customer typed into checkout; it may be the
    // only contact detail we get if the browser never posted the form.
    const customer = { ...(order.customer ?? {}) };
    if (payment.email && !customer.email) customer.email = payment.email;
    if (payment.contact && !customer.phone) {
      customer.phone = String(payment.contact).replace(/\D/g, "").slice(-10);
    }

    const settled = await settle(order, {
      status: "paid",
      razorpayPaymentId: payment.id,
      paidAt: new Date(),
      notes: "Settled via webhook (browser never confirmed).",
      customer,
    });
    if (settled) console.log("Order settled by webhook:", settled.orderNumber);
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});

/* GET /api/orders/:orderNumber — order status lookup for the confirmation page. */
router.get("/:orderNumber", async (req, res, next) => {
  try {
    const order = await findByOrderNumber(req.params.orderNumber);
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json({ order: toPublic(order) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------------------- */
async function bookShipment(order) {
  const customer = order.customer ?? {};
  const first = (customer.name || "Customer").trim().split(/\s+/);
  const payload = {
    order_id: order.orderNumber,
    order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
    pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
    billing_customer_name: first[0],
    billing_last_name: first.slice(1).join(" ") || ".",
    billing_address: customer.address,
    billing_city: customer.city,
    billing_pincode: customer.pincode,
    billing_state: customer.state,
    billing_country: "India",
    billing_email: customer.email,
    billing_phone: customer.phone,
    shipping_is_billing: true,
    order_items: order.items.map((l) => ({
      name: `${l.name}${l.variant ? " — " + l.variant : ""}`,
      sku: `${l.sku}-${(l.variant || "STD").toUpperCase()}`,
      units: l.qty,
      selling_price: l.price,
    })),
    payment_method: "Prepaid",
    sub_total: order.pricing.total,   // what was actually collected
    length: 40, breadth: 12, height: 35,
    weight: order.items.reduce((w, l) => w + 0.35 * l.qty, 0),
  };

  const created = await shiprocket("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!created.ok || !created.data.shipment_id) {
    console.error("Shiprocket order failed:", created.status, created.data);
    // True when payment succeeded but the courier booking did not. These are
    // the orders a human needs to look at.
    await updateOrder(order.id, { shipping: { ...(order.shipping ?? {}), pending: true } });
    return;
  }

  const awbRes = await shiprocket("/courier/assign/awb", {
    method: "POST",
    body: JSON.stringify({ shipment_id: created.data.shipment_id }),
  });
  const awbData = awbRes.data?.response?.data || {};

  const shipping = {
    ...(order.shipping ?? {}),
    shiprocketOrderId: String(created.data.order_id || ""),
    shipmentId: String(created.data.shipment_id),
    awb: awbData.awb_code || null,
    courier: awbData.courier_name || null,
    pending: !awbData.awb_code,
  };
  await updateOrder(order.id, {
    shipping,
    ...(shipping.awb ? { status: "shipped" } : {}),
  });
}

export default router;
