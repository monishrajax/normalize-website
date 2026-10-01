import { Router } from "express";
import { upsertSignup } from "../models/Waitlist.js";

/* POST /api/waitlist — the early-access gate's one endpoint. No auth: this is
   the thing a visitor fills in BEFORE they have any reason to sign in, so it
   has to work for a stranger with nothing but a name and an email. */
const router = Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[6-9][0-9]{9}$/;

router.post("/", async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    const phone = String(body.phone || "").trim();
    // Free text, but bounded — this is a label off a fixed client-side pool,
    // never something a browser should be able to pour an essay into.
    const question = String(body.question || "").trim().slice(0, 120);
    const answer = String(body.answer || "").trim().slice(0, 60);

    if (!name) return res.status(400).json({ error: "Enter your name." });
    if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email." });
    // The phone is optional on this form — only checked when someone bothers
    // to type one, the same rule the checkout's own field follows.
    if (phone && !PHONE.test(phone)) {
      return res.status(400).json({ error: "Enter a 10-digit Indian mobile number." });
    }

    await upsertSignup({ name, email, phone, question, answer });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
