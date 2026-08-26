/* End-to-end test of the running stack: an in-memory MongoDB, the real Express
   server as a child process, and real Razorpay test-mode API calls.

   Run with:  npm test          (from server/)

   It needs no local MongoDB and moves no real money — test-mode keys only.

   Credentials come from server/.env and are never written into this file: a
   key committed to the repo is a key published to everyone who can read it. */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the server package from this file, so the test runs from anywhere.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBHOOK_SECRET = "test_webhook_secret_for_this_run_only";
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!KEY_ID || !KEY_SECRET) {
  console.error(
    "\nRAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.\n" +
    "Copy server/.env.example to server/.env and fill in your TEST keys\n" +
    "(rzp_test_*), then run this again.\n"
  );
  process.exit(1);
}
if (!KEY_ID.startsWith("rzp_test_")) {
  // A live key here would create real orders against real money.
  console.error("\nRefusing to run: RAZORPAY_KEY_ID is not a test key (rzp_test_*).\n");
  process.exit(1);
}

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? "  → " + detail : ""}`);
  if (!ok) failures++;
};

const mongo = await MongoMemoryServer.create();
const uri = mongo.getUri("normalize");
console.log("In-memory MongoDB up.\n");

const env = {
  ...process.env,
  MONGODB_URI: uri,
  PORT: "5099",
  NODE_ENV: "development",
  CLIENT_ORIGIN: "http://localhost:5173",
  RAZORPAY_KEY_ID: KEY_ID,
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  SHIPROCKET_CREATE_ON_PAYMENT: "false",
  SHIPPING_FEE: "199",
  FREE_SHIPPING_THRESHOLD: "1499",
};

// ---- seed ----
await new Promise((resolve, reject) => {
  const p = spawn("node", ["src/seed.js"], { cwd: ROOT, env, stdio: "inherit" });
  p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("seed failed"))));
});

// ---- boot server ----
const server = spawn("node", ["src/index.js"], { cwd: ROOT, env });
server.stderr.on("data", (d) => process.stderr.write("[server] " + d));

const BASE = "http://localhost:5099";
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json() }; };
const post = async (p, b, h = {}) => {
  const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

try {
  console.log("\n=== 1. Catalogue ===");
  const all = await get("/api/products");
  check("12 products served from MongoDB", all.body.products?.length === 12, `${all.body.products?.length} returned`);
  const tote = all.body.products.find((p) => p.slug === "butterfly-tote");
  check("launch piece is sellable", tote?.isSellable === true, `${tote?.name} ₹${tote?.price}`);
  check("only the launch piece is sellable", all.body.products.filter((p) => p.isSellable).length === 1);
  check("editorial copy survived the port", tote.details.material.includes("jute"));
  check("Dawn/Dusk images point at real files", tote.images.Dawn === "/assets/tote-dawn.webp");
  check("internal SKU is NOT exposed", tote.sku === undefined && tote.weightKg === undefined);

  const bags = await get("/api/products?category=bags");
  check("category filter works", bags.body.products.every((p) => p.category === "bags"), `${bags.body.products.length} bags`);
  const asc = await get("/api/products?sort=price-asc");
  check("price sort works", asc.body.products[0].price <= asc.body.products.at(-1).price);
  const search = await get("/api/products?q=butterfly");
  check("search finds the tote", search.body.products.some((p) => p.slug === "butterfly-tote"));
  const evil = await get("/api/products?q=" + encodeURIComponent("c++ (*)"));
  check("regex metacharacters don't crash search", evil.status === 200);

  console.log("\n=== 2. Config is server-driven ===");
  const cfg = await get("/api/config");
  check("threshold + fee served to client", cfg.body.freeShippingThreshold === 1499 && cfg.body.shippingFee === 199);

  console.log("\n=== 3. Pricing (real Razorpay test orders) ===");
  const id = tote.id;
  const cases = [
    ["1 tote → 799 + 199 shipping", [{ productId: id, variant: "Dawn", qty: 1 }], "", 998],
    ["WELCOME10 → 10% off", [{ productId: id, variant: "Dawn", qty: 1 }], "WELCOME10", 918],
    ["2 totes → free shipping at 1598", [{ productId: id, variant: "Dusk", qty: 2 }], "", 1598],
    ["bad promo ignored, not an error", [{ productId: id, variant: "Dawn", qty: 1 }], "NOPE", 998],
  ];
  let live = null;
  for (const [label, items, promo, expect] of cases) {
    const r = await post("/api/orders", { items, promo });
    const ok = r.status === 200 && r.body.breakdown.total === expect && r.body.amount === expect * 100;
    check(label, ok, `₹${r.body.breakdown?.total}, ${r.body.amount} paise, ${r.body.orderNumber}`);
    if (!live) live = r.body;
  }

  console.log("\n=== 4. Money cannot be tampered with ===");
  const tamper = await post("/api/orders", { items: [{ productId: id, variant: "Dawn", qty: 1, price: 1, lineTotal: 1 }] });
  check("client-sent price is ignored", tamper.body.amount === 99800, `${tamper.body.amount} paise`);
  const notSellable = all.body.products.find((p) => !p.isSellable);
  const blocked = await post("/api/orders", { items: [{ productId: notSellable.id, qty: 1 }] });
  check("unsellable product is refused", blocked.status === 400, blocked.body.error);
  check("unknown id refused", (await post("/api/orders", { items: [{ productId: "5".repeat(24), qty: 1 }] })).status === 400);
  check("empty cart refused", (await post("/api/orders", { items: [] })).status === 400);
  check("qty is clamped, not trusted",
    (await post("/api/orders", { items: [{ productId: id, variant: "Dawn", qty: 99999 }] })).body.breakdown.total === 799 * 99);
  check("secret never appears in a response", !JSON.stringify(live).includes(KEY_SECRET));
  check("only the PUBLIC key is sent", live.keyId.startsWith("rzp_test_"), live.keyId);

  console.log("\n=== 5. Signature gate ===");
  const payId = "pay_E2ESIMULATED001";
  const sign = (o, p) => crypto.createHmac("sha256", KEY_SECRET).update(`${o}|${p}`).digest("hex");

  const forged = await post("/api/orders/verify", {
    razorpay_order_id: live.orderId, razorpay_payment_id: payId,
    razorpay_signature: "deadbeef".repeat(8), customer: { name: "X" },
  });
  check("forged signature REJECTED", forged.status === 400, forged.body.error);
  check("order still unpaid after forgery", (await get(`/api/orders/${live.orderNumber}`)).body.order.status === "created");

  const good = await post("/api/orders/verify", {
    razorpay_order_id: live.orderId, razorpay_payment_id: payId,
    razorpay_signature: sign(live.orderId, payId),
    customer: { name: "Test Buyer", email: "t@example.com", phone: "9876543210",
                address: "1 Test St", city: "Chennai", state: "Tamil Nadu", pincode: "600001" },
  });
  check("genuine signature ACCEPTED", good.status === 200 && good.body.ok === true);
  check("order persisted as paid", (await get(`/api/orders/${live.orderNumber}`)).body.order.status === "paid");
  check("short signature can't crash timingSafeEqual",
    (await post("/api/orders/verify", { razorpay_order_id: live.orderId, razorpay_payment_id: payId, razorpay_signature: "ab" })).status === 400);
  check("replay is idempotent, not a double-book", (await post("/api/orders/verify", {
    razorpay_order_id: live.orderId, razorpay_payment_id: payId, razorpay_signature: sign(live.orderId, payId), customer: {},
  })).status === 200);

  console.log("\n=== 6. Webhook safety net (browser died mid-payment) ===");
  const wOrder = (await post("/api/orders", { items: [{ productId: id, variant: "Dusk", qty: 1 }] })).body;
  check("order starts as created", (await get(`/api/orders/${wOrder.orderNumber}`)).body.order.status === "created");

  const evt = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_WEBHOOK001", order_id: wOrder.orderId, email: "w@example.com", contact: "+919876543210" } } },
  });
  const badHook = await post("/api/orders/webhook", evt, { "x-razorpay-signature": "nope" });
  check("unsigned webhook REJECTED", badHook.status === 400);
  check("order untouched by forged webhook", (await get(`/api/orders/${wOrder.orderNumber}`)).body.order.status === "created");

  const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(evt).digest("hex");
  const okHook = await post("/api/orders/webhook", evt, { "x-razorpay-signature": sig });
  check("signed webhook accepted", okHook.status === 200);
  await new Promise((r) => setTimeout(r, 400));   // it acks first, then processes
  check("order settled WITHOUT the browser", (await get(`/api/orders/${wOrder.orderNumber}`)).body.order.status === "paid");

  console.log("\n=== 7. Misc ===");
  check("unknown order → 404", (await get("/api/orders/NRM-NOPE")).status === 404);
  check("tracking needs a number", (await get("/api/track")).status === 400);
  check("malformed AWB refused", (await get("/api/track?awb=%20%20")).status === 400);
} finally {
  server.kill();
  await mongo.stop();
}

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
