import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import * as Account from "../models/Account.js";

/* Everything a signed-in customer can see or change about themselves.

   `requireAuth` is mounted on the ROUTER, not sprinkled per route. Adding a
   route to this file therefore cannot accidentally ship it unauthenticated,
   which is the usual way an endpoint like this leaks. */
const router = Router();
router.use(requireAuth);

/* The checkout form's rules, enforced again here.

   The browser already checks these with `pattern` attributes, and that check is
   worth nothing: it is trivially bypassed and these values end up on a courier
   label. A malformed phone or PIN is a parcel that does not arrive. The
   database has the same two constraints a third time — this layer exists to
   turn a constraint violation into a sentence the customer can act on rather
   than a 500. */
const PHONE = /^[6-9][0-9]{9}$/;
const PIN = /^[1-9][0-9]{5}$/;

function cleanAddress(body, { partial = false } = {}) {
  const out = {};
  const str = (v) => String(v ?? "").trim();

  const required = { name: 80, line1: 200, city: 60, state: 60 };
  for (const [field, max] of Object.entries(required)) {
    if (partial && body[field] === undefined) continue;
    const v = str(body[field]);
    if (!v) return { error: `${field === "line1" ? "Address" : field[0].toUpperCase() + field.slice(1)} is required.` };
    out[field] = v.slice(0, max);
  }

  if (!partial || body.phone !== undefined) {
    const phone = str(body.phone);
    if (!PHONE.test(phone)) return { error: "Enter a 10-digit Indian mobile number." };
    out.phone = phone;
  }
  if (!partial || body.pincode !== undefined) {
    const pincode = str(body.pincode);
    if (!PIN.test(pincode)) return { error: "Enter a valid 6-digit PIN code." };
    out.pincode = pincode;
  }
  if (body.label !== undefined) out.label = str(body.label).slice(0, 24) || "Home";
  if (body.isDefault !== undefined) out.isDefault = body.isDefault === true;

  return { value: out };
}

/* ---- Profile ---- */

router.get("/", async (req, res, next) => {
  try {
    const [profile, addresses] = await Promise.all([
      Account.getProfile(req.user.id),
      Account.listAddresses(req.user.id),
    ]);
    res.json({ user: { id: req.user.id, email: req.user.email }, profile, addresses });
  } catch (err) { next(err); }
});

router.put("/", async (req, res, next) => {
  try {
    const fullName = String(req.body?.fullName ?? "").trim().slice(0, 80);
    const phone = String(req.body?.phone ?? "").trim();
    if (phone && !PHONE.test(phone)) {
      return res.status(400).json({ error: "Enter a 10-digit Indian mobile number." });
    }
    res.json({ profile: await Account.updateProfile(req.user.id, { fullName, phone }) });
  } catch (err) { next(err); }
});

/* ---- Addresses ---- */

router.get("/addresses", async (req, res, next) => {
  try {
    res.json({ addresses: await Account.listAddresses(req.user.id) });
  } catch (err) { next(err); }
});

router.post("/addresses", async (req, res, next) => {
  try {
    const { error, value } = cleanAddress(req.body || {});
    if (error) return res.status(400).json({ error });
    res.status(201).json({ address: await Account.createAddress(req.user.id, value) });
  } catch (err) { next(err); }
});

router.put("/addresses/:id", async (req, res, next) => {
  try {
    const { error, value } = cleanAddress(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    const address = await Account.updateAddress(req.user.id, req.params.id, value);
    /* 404 whether the address belongs to someone else or does not exist at all.
       Telling the two apart would confirm which ids are real. */
    if (!address) return res.status(404).json({ error: "Address not found." });
    res.json({ address });
  } catch (err) { next(err); }
});

router.delete("/addresses/:id", async (req, res, next) => {
  try {
    const ok = await Account.deleteAddress(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "Address not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---- Wishlist ---- */

router.get("/wishlist", async (req, res, next) => {
  try {
    res.json({ wishlist: await Account.listWishlist(req.user.id) });
  } catch (err) { next(err); }
});

/* POST merges rather than replaces, which is what sign-in needs: the ids this
   browser collected while signed out are ADDED to whatever other devices have
   already saved. A replace here would mean signing in on a fresh phone wiped
   the wishlist built up on a laptop. */
router.post("/wishlist", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.productIds) ? req.body.productIds.slice(0, 200) : [];
    res.json({ wishlist: await Account.addToWishlist(req.user.id, ids) });
  } catch (err) { next(err); }
});

router.delete("/wishlist/:productId", async (req, res, next) => {
  try {
    res.json({ wishlist: await Account.removeFromWishlist(req.user.id, req.params.productId) });
  } catch (err) { next(err); }
});

/* ---- Orders ---- */

router.get("/orders", async (req, res, next) => {
  try {
    const rows = await Account.listOrders(req.user.id);
    res.json({
      orders: rows.map((row) => ({
        orderNumber: row.orderNumber,
        status: row.status,
        items: (row.items ?? []).map((l) => ({
          name: l.name, variant: l.variant, qty: l.qty, price: l.price,
        })),
        pricing: row.pricing,
        awb: row.shipping?.awb ?? null,
        courier: row.shipping?.courier ?? null,
        paidAt: row.paidAt,
        createdAt: row.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
