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

---

# Design brief

The intended design of the site. Where this conflicts with what is currently in
the code, **this brief wins** — see "Spec vs. built" below for the open gaps.

## Brand

NORMALIZE is an Indian lifestyle label — bags, apparel, caps and accessories —
made in one workshop in Chennai. Slogan: **"Everything else is noise."**

The argument behind the name: a good bag should not be an event; it should be the
ordinary thing you reach for, that holds up, that you stop thinking about because
it simply works. Currently in launch mode — one product public (the Butterfly
Tote, ₹799, editions Dawn and Dusk), the rest of the catalogue behind a flag.

## Typography

The whole site is set in a typewriter face, **Courier Prime**, with exactly two
exceptions, which are identity rather than copy:

- NORMALIZE wordmark in the header — **Archivo Expanded 700**
- NORMALIZE wordmark in the hero — **Cormorant Garamond 300**
- Labels on the coin's branches — **Archivo Expanded 700**
- Everything else — **Courier Prime**

Uppercase labels carry wide tracking (.14–.3em). Reading copy sits near 64
characters wide with generous leading.

Fonts must be OFL or system. Proprietary faces are out.

## Colour

| Role | Value |
|---|---|
| Ground | `#f4ede0` cream |
| Ink | `#151210` |
| Muted | `#7a7166` |
| Hairlines | `#ddd2ba` |
| Gold | `#d4af37`, with `#8a6a1c` for rules and links |
| Dawn accent | `#b08d57` warm sand |
| Dusk accent | `#6d7c9a` slate blue |

**Gold is hairlines, small marks and one flat button — never large gradient
fills.** The animated sheen belongs only to the wordmark and the coin.
Shimmering every surface is what made an earlier version read as cheap.

## Structure, in scroll order

1. **Launch canvas** — pinned full-viewport macro stage holding a WebGL 3D coin
2. **Hero** — eyebrow, serif headline, one line of positioning, one gold button
3. **Spotlight** — dark full-bleed stage that *is* the product page during launch
4. **Footer**

The product grid exists but is hidden while launch mode is on.

## The coin

A genuine Three.js render, not a CSS approximation. Milled cylinder,
`MeshPhysicalMaterial` at metalness 1.0, roughness .18–.22, clearcoat, relief
bump from the artwork, brushed-metal micro normals. High-contrast procedural
PMREM environment — dark void, white softboxes, and a ±115° warm gold arc behind
the camera (a flat face's reflection swings at **twice** its rotation angle, so
the bright arc must be double the window you want). ACESFilmic tone mapping,
exposure 1.35, pixel ratio capped at 2, hardware AA.

**Rotation is a Y-axis flip** — backside to frontside, showing the coin's
thickness. Never a Z-axis wheel spin; `rotation.z` is pinned to 0.

Lighting is linked to rotation:

```
envMapIntensity = base × (0.14 + 1.45 × |cos(rotY)|³)
```

Blinding flash face-on, deep shadow at profile, rim constantly lit.

Opens at the full coin, face-on, draggable from the first frame — **no zoom-in
journey**. Falls back to a 2.5D CSS coin where WebGL is unavailable.

Three branch hotspots sprout on load and stay — organic gnarled SVG silhouettes
with metallic gradient strokes that grow via stroke-dash. All three appear at
once; the user never hunts for them. Labels: **The Launch · Your bag · Our
story**. The bag branch carries a live item count. On scroll the coin physically
tosses up into the header and docks, arcing rather than sliding, with spin
proportional to scroll velocity.

## Navigation and canvases

The coin + wordmark are centred in the header at all times. **PRODUCTS** sits
left; search, wishlist and bag sit right, icon-only below 768px.

**No drawers, no popups, no modals.** Every secondary surface is a full-viewport
canvas with its own scroll and a liquid clip-path reveal: Search, Products, Bag,
Wishlist, and the reading pages. PRODUCTS teleports to its own canvas rather than
scrolling the home page.

The reading pages — Our Story, Craftsmanship, Careers, Size Guide, Contact, Track
Order — share one **"typed document" chassis**: eyebrow, large title, typewriter
lede, short gold rule, body copy. Numbered entries carry their index in the
margin (01, 02, 03) with hairline dividers. Forms are underline fields, never
boxes.

## Motion

Add to bag is a macOS **"Genie"**: the product image warps into the header bag
icon, and the badge count updates **only when the animation completes** — never
mid-flight. No toast. No auto-opening cart.

Scroll reveals stagger cards up into view. The spotlight has a grand entrance:
the frame wipes open from the floor, the image settles out of a deep zoom, the
crest swells, and the product name rises word by word out of masked rows. Dawn
and Dusk each have their own mood animation.

Everything respects `prefers-reduced-motion`.

## Mobile

Below 768px the branches become an **outward radial halo** around a smaller coin
— never stacked over it. Minimum 44px touch targets on every header control.
Icon-only header actions, categories in a full-screen panel, no native selects.

## Commerce

Launch mode shows one product; **PREBOOK** replaces "Add to Bag"; the two sizes
are the editions. The browser sends only `{id, size, qty}` — price, shipping,
discount and total are decided server-side, and the checkout re-paints its
summary from the server's answer before the payment window opens. Razorpay
checkout, Shiprocket shipment and AWB, live tracking, Formspree contact.

## Standing rules

1. Centred header logo, always
2. Full-page canvases — never a drawer or a popup
3. Gold is an accent, never a fill
4. The coin flips on Y, never Z
5. The cart badge updates after the animation, never during
6. No toasts
7. Typewriter everywhere except the wordmark and the branch labels
8. Proprietary fonts are out — everything must be OFL or system

---

# Spec vs. built

The brief above describes the target. The code does not match it yet. Verified
gaps, as of the last audit:

## Standing rules currently violated

| Rule | Status |
|---|---|
| 4 — coin flips on Y, never Z | **Broken.** `coinScene.js:270` sets `coin.rotation.z = (1 - eased) * 0.16`. There is also no Y-flip at all: `tick()` only applies a small pointer-follow tilt (±0.22 rad) to `rotation.x/y`. |
| 5 — badge updates after the animation | **Not built.** No Genie animation exists; the badge reads `count` straight from `CartContext` and updates instantly. |
| 6 — no toasts | **Broken.** `ToastContext.jsx` exists and is called by `Spotlight.jsx` and `ProductModal.jsx` on add-to-bag. |
| 7 — typewriter except wordmark and branch labels | **Partly broken.** Branch labels use `font-display` (Cormorant), not Archivo Expanded. |
| 2 — full-page canvases, never a modal | **Mostly met.** Search, Bag, Wishlist, Product and the reading pages all render through `Panel.jsx`, which is a real `fixed inset-0` canvas. `CheckoutModal.jsx` is the exception — a `max-w-2xl` card floating on `bg-ink/70` with a backdrop blur. |

Also against the brief: "no auto-opening cart" — `Spotlight.handleAdd` and
`ProductModal.handleAdd` both call `onOpenCart()` right after adding.

## The coin

- **The zoom-in journey is still there.** `setProgress` dollies the camera from
  `z = 1.7` to `z = 4.7` across the scroll. The brief calls for opening at the
  full coin with no zoom.
- **No rotation-linked lighting.** `envMapIntensity` is a static `1.25`; the
  `0.14 + 1.45 × |cos(rotY)|³` curve is not implemented.
- **Material is off-spec.** Roughness is `0.3`/`0.34` against a target of
  .18–.22, and there is no `clearcoat`.
- **The coin does not toss into the header.** The header renders a separate CSS
  `<Coin>` component; there is no hand-off from the WebGL scene.
- **Branches fade, they do not grow.** Hotspots animate with `opacity` and a
  staggered `transitionDelay` — no stroke-dash growth.
- **Labels differ.** Built: Collections / Your bag / Our story. Brief: The Launch
  / Your bag / Our story. The bag branch carries no live item count.
- **No mobile radial halo.** `hotspots.js` uses fixed percentage positions; the
  `isSmall` flag only shortens the ScrollTrigger distance.

## Typography

**`Archivo Expanded` never loads.** It is not a Google Fonts family — Archivo's
expanded width is a variable `wdth` axis. The request in `client/index.html`
returns 200 but silently drops it; only Cormorant Garamond and Courier Prime come
back. The wordmark currently falls through `--font-brand` to Jost (also not
loaded) and lands on Helvetica Neue / Arial.

Fixing this without breaking rule 8 means either loading Archivo's variable font
and setting `font-stretch`, or choosing a different OFL expanded face.

## Layout and motion

- **Spotlight is light, not a dark full-bleed stage** — `bg-cream-dark/40` inside
  the normal container. None of the grand entrance is built: no floor wipe, no
  deep-zoom settle, no word-by-word title, no Dawn/Dusk mood animations.
- **Panel reveals are opacity fades**, not liquid clip-paths.
- **Header left is a category nav** (All / Bags / Apparel / Caps / Accessories),
  hidden entirely in launch mode — so on desktop the left slot is empty right
  now. The brief wants a single PRODUCTS link that teleports to its own canvas.
- **The "typed document" chassis is half-built.** `InfoModal` renders eyebrow,
  title and lede correctly, but there is no gold rule, and the `doc-list`,
  `doc-spec` and `doc-aside` classes used throughout `infoContent.js` have **zero
  styling** — so the numbered margin indices and hairline dividers do not render.
  `prose-normalize` is likewise unstyled; the real styling is inline arbitrary
  variants on the wrapper.
- **Edition accent colours are missing** from the `@theme` block — no `#b08d57`
  or `#6d7c9a` anywhere.

## What already matches

Scroll order, launch mode behaviour, PREBOOK copy, the centred header wordmark,
the full-screen mobile category panel, `prefers-reduced-motion` handling, the
WebGL→CSS coin fallback, Formspree contact, and the entire server-side pricing
model.
