/* The window display: what the API answers with while the database is away.

   Run with:  npm run test:window     (from server/)

   Needs NO database, NO Razorpay keys and NO network — that is the point. It
   builds the window app on its own and talks to it over a real socket, so what
   is checked is what a browser would get. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWindowApp } from "../src/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = JSON.parse(readFileSync(path.join(ROOT, "src/data/catalogue.json"), "utf8"));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${!ok && detail ? "  → " + detail : ""}`);
  if (!ok) failures++;
};

const server = createWindowApp({ why: () => "tenant/user not found" }).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const get = async (p, init) => {
  const res = await fetch(base + p, init);
  return { res, body: await res.json().catch(() => null) };
};
const names = (body) => body.products.map((p) => p.slug);

console.log("\nCatalogue");
{
  const { res, body } = await get("/api/products");
  check("200, and every piece of the catalogue is listed", res.status === 200 && body.products.length === file.length, `${res.status} / ${body?.products?.length}`);
  check("never cacheable, and says what mode it is in",
    res.headers.get("cache-control") === "no-store" && res.headers.get("x-normalize-mode") === "window-display");

  const tote = body.products.find((p) => p.slug === "butterfly-tote");
  const src = file.find((p) => p.slug === "butterfly-tote");
  check("the Butterfly Tote is there", Boolean(tote));
  check("…at the catalogue file's price, name and both editions",
    tote?.price === src.price && tote?.name === "Butterfly Tote" &&
    tote?.sizes?.join() === "Dawn,Dusk" && tote?.images?.Dawn === "/assets/tote-dawn.webp" && tote?.images?.Dusk === "/assets/tote-dusk.webp");
  check("…with its description and material/design/care copy",
    typeof tote?.desc === "string" && tote.desc.length > 40 && ["material", "design", "care"].every((k) => tote?.details?.[k]));
  check("…held back (paused), not 'coming soon'", tote?.paused === true && tote?.isSellable === false);

  check("nothing at all is sellable while the database is away", body.products.every((p) => p.isSellable === false));
  check("only what is normally on sale is marked paused",
    body.products.filter((p) => p.paused).map((p) => p.slug).join() === file.filter((p) => p.isSellable).map((p) => p.slug).join());
  check("ids are slugs, never anything that could pass for a price lookup key",
    body.products.every((p) => p.id === p.slug));
  check("every piece declares itself a window piece (the page hides the wishlist star on these)",
    body.products.every((p) => p.window === true));
  check("courier-only fields never leave the server",
    body.products.every((p) => !("sku" in p) && !("weightKg" in p) && !("dims" in p) && !("sortOrder" in p)));
}

console.log("\nFilters and sorting");
{
  const bags = await get("/api/products?category=bags");
  check("category=bags is exactly the bags", names(bags.body).join() === file.filter((p) => p.category === "bags").map((p) => p.slug).join(), names(bags.body).join());
  check("category=all is everything", (await get("/api/products?category=all")).body.products.length === file.length);
  check("an unknown category is empty, not an error", (await get("/api/products?category=nope")).body.products.length === 0);

  check("search finds the tote by 'jute'", names((await get("/api/products?q=jute")).body).join() === "butterfly-tote");
  check("search ignores case and padding", names((await get("/api/products?q=%20%20TOTE%20")).body).join() === "butterfly-tote");
  check("a search for nothing in the shop is empty", (await get("/api/products?q=zzzzzz")).body.products.length === 0);

  const asc = (await get("/api/products?sort=price-asc")).body.products.map((p) => p.price);
  const desc = (await get("/api/products?sort=price-desc")).body.products.map((p) => p.price);
  check("price ascending", asc.every((v, i) => i === 0 || asc[i - 1] <= v), asc.join());
  check("price descending", desc.every((v, i) => i === 0 || desc[i - 1] >= v), desc.join());
  check("newest is the reverse of file order", (await get("/api/products?sort=newest")).body.products[0].slug === file.at(-1).slug);
  check("featured follows sortOrder",
    names((await get("/api/products?sort=featured")).body).join() === [...file].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.slug).join());
  check("a nonsense sort falls back to featured instead of failing",
    (await get("/api/products?sort=__proto__")).res.status === 200);
}

console.log("\nOne piece");
{
  const hit = await get("/api/products/butterfly-tote");
  check("a piece by slug", hit.res.status === 200 && hit.body.product.slug === "butterfly-tote" && hit.body.product.paused === true);
  const miss = await get("/api/products/does-not-exist");
  check("an unknown slug is a 404 with the usual message", miss.res.status === 404 && miss.body.error === "Product not found.");
}

console.log("\nConfig");
{
  const { res, body } = await get("/api/config");
  check("same display figures as the real route, plus the pause",
    res.status === 200 && Number.isFinite(body.shippingFee) && Number.isFinite(body.freeShippingThreshold) &&
    body.currency === "INR" && body.ordering === "paused", JSON.stringify(body));
}

console.log("\nEverything that needs the database says so");
{
  const order = await get("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [] }) });
  check("creating an order is refused with the usual 503 message", order.res.status === 503 && /temporarily unavailable/i.test(order.body.error), `${order.res.status}`);
  check("verifying a payment is refused", (await get("/api/orders/verify", { method: "POST" })).res.status === 503);
  check("the Razorpay webhook gets a non-2xx, so Razorpay retries it later",
    (await get("/api/orders/webhook", { method: "POST", body: "{}" })).res.status === 503);
  check("accounts are refused", (await get("/api/account")).res.status === 503);
  check("tracking is refused", (await get("/api/track?awb=1")).res.status === 503);

  const health = await get("/api/health");
  check("health stays honest: 503, degraded, with the reason",
    health.res.status === 503 && health.body.ok === false && health.body.degraded === true && health.body.detail === "tenant/user not found");
  check("anything outside /api is a plain 404", (await get("/nope")).res.status === 404);
}

server.close();
console.log(failures ? `\n${failures} check(s) FAILED.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
