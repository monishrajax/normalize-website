import { Router } from "express";
import { shiprocket, normaliseTracking, shiprocketConfigured } from "../lib/shiprocket.js";
import Order from "../models/Order.js";

const router = Router();

/* GET /api/track?awb=XXXX  (or ?orderNumber=NRM-...) */
router.get("/", async (req, res, next) => {
  try {
    let awb = String(req.query.awb || "").trim();
    const orderNumber = String(req.query.orderNumber || "").trim();

    if (!awb && !orderNumber) return res.status(400).json({ error: "Enter a tracking number." });

    // Customers know their order number, not the AWB, so accept either.
    if (!awb && orderNumber) {
      const order = await Order.findOne({ orderNumber });
      if (!order) return res.status(404).json({ error: "We couldn't find that order." });
      if (!order.shipping.awb) {
        return res.status(404).json({ error: "Your order isn't dispatched yet. Tracking appears once it ships." });
      }
      awb = order.shipping.awb;
    }

    // Keep the lookup key clean before it goes into a URL.
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(awb)) {
      return res.status(400).json({ error: "That doesn't look like a valid tracking number." });
    }

    if (!shiprocketConfigured()) {
      return res.status(503).json({ error: "Tracking is not configured yet." });
    }

    const result = await shiprocket(`/courier/track/awb/${encodeURIComponent(awb)}`, { method: "GET" });
    if (!result.ok) {
      return res.status(404).json({ error: "We couldn't find that tracking number yet." });
    }

    const out = normaliseTracking(Array.isArray(result.data) ? result.data[0] : result.data);
    if (!out.awb && out.scans.length === 0 && out.status === "In transit") {
      return res.status(404).json({ error: "No tracking information yet. Please check back a little later." });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
