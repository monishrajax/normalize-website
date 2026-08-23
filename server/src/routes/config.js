import { Router } from "express";
import { SHIPPING_FEE, FREE_SHIPPING_THRESHOLD } from "../lib/pricing.js";

const router = Router();

/* Display-only figures. The client reads these so the announcement bar and the
   cart summary quote the same numbers the server actually charges — the old
   site kept a second copy in index.html and they drifted. Promo RATES are
   deliberately not exposed; the client only learns a code's worth by applying it. */
router.get("/", (req, res) => {
  res.json({
    shippingFee: SHIPPING_FEE,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    currency: "INR",
  });
});

export default router;
