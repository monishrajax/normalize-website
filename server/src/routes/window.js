import { readFileSync } from "node:fs";
import { Router } from "express";
import { toPublic } from "../models/Product.js";
import { configPayload } from "./config.js";

/* THE WINDOW DISPLAY — what the API answers with while the database cannot.

   Why this exists: every product the storefront shows lives in Postgres, so
   when the database went away (a Supabase project that was paused, in this
   case) the whole shop went blank — "0 pieces", no Butterfly Tote — even though
   nothing about the products had changed. Looking at the stock should not need
   the till to be open.

   So when the serverless adapter (api/index.js) cannot reach the database it
   serves THIS instead of a bare 503. It is a shop window, nothing more:

     · The catalogue is read from server/src/data/catalogue.json — the very
       file the seed script loads into Postgres, so there is still only one
       place a product is defined. It is never a second copy.
     · Everything is reported as NOT sellable. Ordering needs the database
       (prices are looked up there, orders are written there), and a customer
       must never be able to fill in an address and then be told it failed. A
       piece that is normally for sale carries `paused: true`, so the page can
       say "Back shortly" for it and keep "Coming soon" for the ones that are
       genuinely unreleased.
     · Ids are the slug. The real ids are uuids made by Postgres and cannot be
       known here; nothing can be ordered anyway, and priceCart rejects a
       non-uuid id outright, so a slug can never reach a price.
     · Every other route answers 503, exactly as it did before this existed.

   The browser still never sends a price and the server still never takes one
   from it. Nothing in here can move money. */

const UNAVAILABLE = "The store is temporarily unavailable. Please try again shortly.";

let cache = null;

/* Read on first use, never at import. This module is imported by the real API,
   so a missing or damaged catalogue file must only ever cost the window display
   — it must not be able to stop the healthy path from loading. */
function catalogue() {
  cache ??= JSON.parse(
    readFileSync(new URL("../data/catalogue.json", import.meta.url), "utf8")
  ).map((item, order) => ({
    order,
    sortOrder: item.sortOrder ?? 0,
    /* The same allowlist as the real API, by way of the same function. Fields
       the file carries for the courier (sku, weight, dimensions) are not in it
       and so cannot leak from here either. */
    public: {
      ...toPublic({
        id: item.slug,
        slug: item.slug,
        name: item.name,
        category: item.category,
        price: item.price,
        sizes: item.sizes,
        image: item.image,
        images: item.images,
        description: item.desc,
        details: item.details,
        isSellable: false,
        isFeatured: item.isFeatured ?? false,
      }),
      paused: item.isSellable === true,
      /* The page hides the wishlist star on these. A star saves the piece's id,
         and these ids are slugs: once the database is back every id becomes a
         uuid, the saved slugs would match nothing, and the header would count
         saved pieces that no list can show. */
      window: true,
    },
    haystack: [item.name, item.desc, item.category].join("\n").toLowerCase(),
  }));
  return cache;
}

/* The same four orderings as models/Product.js. "Newest" is the reverse of file
   order, which is what a fresh seed gives created_at. */
const SORTS = {
  "price-asc":  (a, b) => a.public.price - b.public.price,
  "price-desc": (a, b) => b.public.price - a.public.price,
  newest:       (a, b) => b.order - a.order,
  featured:     (a, b) => a.sortOrder - b.sortOrder,
};

function answer(res, build) {
  try {
    const body = build();
    if (body) res.json(body);
  } catch (err) {
    console.error("Window display could not read the catalogue:", err);
    res.status(503).json({ error: UNAVAILABLE });
  }
}

/* `why()` reports the latest reason the database could not be reached. It is a
   function because that reason changes on every failed retry. */
export function windowRoutes({ why = () => "" } = {}) {
  const router = Router();

  router.use((req, res, next) => {
    /* Never let a browser or the CDN hold on to the window: the moment the
       database is back, the next request must get the real thing. */
    res.set({ "Cache-Control": "no-store", "X-Normalize-Mode": "window-display" });
    next();
  });

  // Honest, so anything watching the API still sees that it is not healthy.
  router.get("/health", (req, res) =>
    res.status(503).json({ ok: false, degraded: true, detail: String(why() || "") })
  );

  router.get("/config", (req, res) =>
    res.json({ ...configPayload(), ordering: "paused" })
  );

  router.get("/products", (req, res) =>
    answer(res, () => {
      const { category, q, sort } = req.query;
      const term = typeof q === "string" ? q.trim().slice(0, 80).toLowerCase() : "";
      const order = typeof sort === "string" && Object.hasOwn(SORTS, sort) ? SORTS[sort] : SORTS.featured;

      const rows = catalogue()
        .filter((p) => !category || category === "all" || p.public.category === category)
        .filter((p) => !term || p.haystack.includes(term))
        .sort(order);

      return { products: rows.map((p) => p.public) };
    })
  );

  router.get("/products/:slug", (req, res) =>
    answer(res, () => {
      const hit = catalogue().find((p) => p.public.slug === req.params.slug);
      if (!hit) {
        res.status(404).json({ error: "Product not found." });
        return null;
      }
      return { product: hit.public };
    })
  );

  // Orders, payments, accounts, tracking, the webhook: all need the database.
  router.use((req, res) => res.status(503).json({ error: UNAVAILABLE }));

  return router;
}
