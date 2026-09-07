# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**NORMALIZE** — a single-product-launch storefront for an Indian apparel/bags brand,
built on the MERN stack. It is a rewrite of a 2.4 MB single-file HTML site, which is
still kept in `legacy/` for reference. Many comments in the codebase are framed as
"here is what the old build got wrong" — that history is intentional, not stale.

Currency is INR, in **whole rupees** everywhere except the Razorpay boundary, which
works in paise (`Math.round(total * 100)`).

## Layout

```
client/     React 18 + Vite 6 + Tailwind v4   (~2,700 LOC)
server/     Express 4 + Mongoose              (~880 LOC)
api/        Vercel serverless adapter (imports server/src/index.js)
legacy/     the old single-file site + Netlify functions — dead, not deployed
netlify/    orphan leftover; only functions/_lib.js, the real copy is in legacy/
```

## Commands

```bash
npm run install:all     # installs client + server
npm run seed            # loads server/src/data/catalogue.json into MongoDB
npm run dev             # server :5050 + client :5173 (Vite proxies /api)
npm run dev:memory      # same, but with an in-memory MongoDB
npm test                # e2e — SEE CAVEAT BELOW
npm run build           # vite build → client/dist
```

`.npmrc` at the root and in `client/` set `ignore-scripts=false` on purpose:
without it esbuild never fetches its platform binary and `vite build` fails.

## The central invariant: the browser never sends a price

Everything on the server is organised around this. Do not break it.

- The client posts `{ productId, variant, qty }` — nothing else about money.
- `server/src/lib/pricing.js` (`priceCart`) looks prices up in MongoDB and computes
  subtotal / discount / shipping / total itself.
- `localStorage` holds only ids, variants and quantities. Names, prices and images
  are joined back on from the catalogue the server sent. Tampering with storage can
  change *what you ask for*, never *what it costs*.
- After `POST /api/orders` returns, `CheckoutModal` repaints its summary from the
  server's `breakdown`, so the figure on screen is the figure being charged.
- Shipping fee, free-shipping threshold and promo codes live in `pricing.js`.
  `GET /api/config` exposes the two display figures **but not promo rates** — a code's
  worth is only learned by applying it.

Product prices, promo rules and shipping rules have exactly one definition. The old
build kept a second copy in the page and the two had already drifted; that is the bug
this design exists to prevent.

## Payment flow (Razorpay)

1. `POST /api/orders` — prices the cart, opens a Razorpay order with
   `payment_capture: 1`, records it as `created`.
2. Razorpay's hosted checkout takes the card details; they never touch this server.
3. `POST /api/orders/verify` — HMAC-SHA256 over `<order_id>|<payment_id>`, compared
   with `crypto.timingSafeEqual` (guarded for length). Marks the order `paid`.
4. `POST /api/orders/webhook` — the safety net. If the customer's browser dies before
   step 3, Razorpay calls this server-to-server and the order still settles.

Things to preserve when touching this area:

- The webhook uses a **different secret** (`RAZORPAY_WEBHOOK_SECRET`) and signs the
  **raw bytes**. `server/src/index.js` deliberately skips JSON parsing for
  `/api/orders/webhook`; the route mounts its own `express.raw()`. Do not move the
  webhook behind the JSON parser.
- The webhook responds 2xx *immediately*, then does its work — Razorpay retries on any
  non-2xx and a slow courier call would earn duplicate deliveries.
- Both settle paths are idempotent: an order already `paid` or `shipped` returns early.
- Shiprocket failures are caught and recorded as `shipping.pending: true`, never
  surfaced to the customer as a failed order. The money is already taken.
- The client's `handler` catch shows "Payment received / we're on it", not an error —
  by that point the charge has gone through.

## Rate limiting

`/api` gets 120 req/min; `/api/orders` gets a tighter 30 req/min. Two deliberate
exemptions on the tighter limiter: the webhook (must never be throttled) and GET
status lookups (a customer refreshing a confirmation page is not a payment attempt).

## Launch mode is data, not code

`isSellable` is a per-product boolean. The client derives launch mode as "exactly one
sellable product" (`App.jsx`) — one product renders `<Spotlight>`, more than one
renders `<ProductGrid>`. `priceCart` refuses to sell anything not flagged sellable.

Currently only **Butterfly Tote** (₹799, Dawn/Dusk) is sellable, out of 12 catalogue
items. Opening the full catalogue is a database update, not a redeploy:

```js
db.products.updateMany({}, { $set: { isSellable: true } })
```

## Data model

- **Product** — the only source of truth for price. `toPublic()` is the allowlist of
  what reaches the browser; courier dims, weight and internal SKU stay server-side.
- **Order** — created the moment a Razorpay order is opened, so nothing can vanish.
  Line items copy `name` and `price` at purchase time: if the catalogue price changes
  next week, the order must still show what was actually charged.

## Client notes

- No router, no state library, no data-fetching library. Overlay state is one
  `useState` panel string in `App.jsx`. Keep it that way unless the app grows.
- `LaunchCanvas` / `coinScene.js` — a pinned three.js macro-lens coin intro driven by
  GSAP ScrollTrigger. `three` and `gsap` are dynamically imported so they stay out of
  the initial bundle, split into their own chunks in `vite.config.js`. It bails out
  entirely on `prefers-reduced-motion`, and `createCoinScene` returns `null` with no
  WebGL — nothing below it depends on it.
- `coinScene.js` targets the modern three colour-space API (`outputColorSpace` /
  `SRGBColorSpace`). The r128-era `outputEncoding` / `sRGBEncoding` were removed in
  r152 and are silently undefined — the gold renders washed out if reintroduced.
- No `scroll-behavior: smooth` in the CSS, on purpose: it fights ScrollTrigger's
  pinning. Smooth scroll is done per-link with `scrollIntoView`.
- Tailwind v4 with `@theme` tokens in `styles/index.css`. The hand-written CSS layer
  is small and only holds what utilities genuinely cannot express (3D transforms,
  gradient text clipping, keyframes). Layout, spacing, colour and type stay in classes.
- `useRazorpay` caches the *promise*, not just the script tag, so two rapid clicks
  await one load.
- `lib/api.js` is the only place that talks to the API. Base is `/api` — Vite proxies
  it in dev, same origin in production, so there is no environment-specific URL.

## Deployment

Two supported shapes:

- **Vercel** (current) — `vercel.json` routes `/api/*` to `api/index.js`, which
  connects Mongo once per warm instance and delegates to the Express app. Static
  assets come off Vercel's CDN, so `createApp` skips its `express.static` block when
  `VERCEL === "1"`.
- **Single Node host** — `npm run build && npm start` serves `client/dist` from the
  API origin, which removes CORS entirely.

`CLIENT_ORIGIN` must be set in production; without it CORS only allows localhost.
Secrets go in the host's environment variable settings, never in a committed file.
See `.env.example` for the full list.

## Known issues

**`start()` runs on import — `server/src/index.js`.** The comment says it is only
called when the file is the process entry point, but there is no guard. `api/index.js`
imports `createApp` from this module, so on Vercel a cold start also fires
`mongoose.connect()` and `app.listen(PORT)` alongside the adapter's own `ensureDb()`.
Needs a `process.env.VERCEL !== "1"` check or the `import.meta.url === process.argv[1]`
idiom.

**`npm test` cannot run without credentials.** `server/test/e2e.mjs` spins up an
in-memory MongoDB and the real server, but requires live-looking `rzp_test_*` keys in
`server/.env` and exits early without them. It refuses outright if the key is not a
test key. The README's "33 checks" therefore need credentials that are correctly not
in the repo.
