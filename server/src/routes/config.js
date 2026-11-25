import { Router } from "express";
import { SHIPPING_FEE, FREE_SHIPPING_THRESHOLD } from "../lib/pricing.js";

const router = Router();

/* Display-only figures. The client reads these so the announcement bar and the
   cart summary quote the same numbers the server actually charges — the old
   site kept a second copy in index.html and they drifted. Promo RATES are
   deliberately not exposed; the client only learns a code's worth by applying it.

   A function rather than an inline object so the window display (routes/window.js,
   served while the database is away) answers with the same fields from the same
   place instead of a hand-copied second list. */
export function configPayload() {
  return {
    shippingFee: SHIPPING_FEE,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    currency: "INR",
  };
}

router.get("/", (req, res) => {
  res.json(configPayload());
});

export default router;
