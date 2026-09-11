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
server/     Express 4 + Postgres (postgres.js) (~900 LOC)
api/        Vercel serverless adapter (imports server/src/index.js)
legacy/     the old single-file site + Netlify functions — dead, not deployed
netlify/    orphan leftover; only functions/_lib.js, the real copy is in legacy/
```

## Commands

```bash
npm run install:all     # installs client + server
npm run seed            # loads server/src/data/catalogue.json into Postgres
npm run dev             # server :5050 + client :5173 (Vite proxies /api)
npm run dev:memory      # same, but against a throwaway Postgres
npm test                # e2e — SEE CAVEAT BELOW
npm run build           # vite build → client/dist
```

`.npmrc` at the root and in `client/` set `ignore-scripts=false` on purpose:
without it esbuild never fetches its platform binary and `vite build` fails.

## The central invariant: the browser never sends a price

Everything on the server is organised around this. Do not break it.

- The client posts `{ productId, variant, qty }` — nothing else about money.
- `server/src/lib/pricing.js` (`priceCart`) looks prices up in Postgres and computes
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

**The same rule covers product COPY, not just money.** No component may state a
fact about the thing being sold — material, colour, construction. The Spotlight
carried hand-written bullets and a per-edition line that had drifted into being
simply wrong: it described an "ecru body" when the Butterfly Tote's body is
indigo jute, and claimed ecru cotton handles for both editions when only Dawn
has them (Dusk's are blue-and-white striped — visible in
`client/public/assets/tote-dusk.webp`). It now renders `product.details`
straight from the catalogue, and the only list left on it is brand-level
(returns, batches, Chennai) with nothing product-specific to drift.

## The database — Supabase Postgres

`server/src/db.js` owns a single `postgres.js` pool;
`models/Product.js` and `models/Order.js` are plain query modules, not ORM
classes. Schema lives in `server/sql/001_init.sql` and is applied by hand once
(Supabase SQL editor, or `psql "$DATABASE_URL" -f`).

Five things here are deliberate and easy to undo by accident:

1. **`prepare: false` in db.js is required.** The Supabase connection string
   should point at the transaction-mode pooler (port 6543), where a connection
   is handed to a different client between statements. Prepared statements do
   not survive that; the symptom is an intermittent "prepared statement does not
   exist" under load.
2. **`weight_kg` is `double precision`, not `numeric`.** Postgres returns
   `numeric` as a *string* to preserve precision, so `weight_kg` arrived as
   `"0.350"` and arithmetic on it silently concatenated. Money is unaffected —
   `price` is `integer` rupees, which is the only column where exactness matters.
3. **`postgres.camel` transforms column names only**, verified — jsonb contents
   pass through untouched. That matters because `images` is keyed by variant
   (`Dawn`, `Dusk`) and those keys must survive verbatim.
4. **Order settling goes through `settleIfUnpaid`**, whose `where status =
   'created'` makes the database the referee. The browser's verify call and the
   webhook can arrive together, and checking status in JavaScript first leaves
   a real window between the read and the save.
5. **RLS is enabled on both tables with no policies.** The API connects over the
   Postgres protocol as the owner and bypasses RLS entirely, so this costs it
   nothing — what it does is shut the door on Supabase's auto-generated
   PostgREST API, which is public on every project. `orders` holds customer
   names, phone numbers and addresses. Do not add a permissive policy without a
   specific reason.

Product ids are `uuid` — `pricing.js` validates the uuid shape
before querying so a malformed id returns "Unknown item in cart" rather than a
Postgres 22P02 cast error surfacing as a 500.

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
  verifies the Postgres pool once per warm instance and delegates to the Express app. Static
  assets come off Vercel's CDN, so `createApp` skips its `express.static` block when
  `VERCEL === "1"`.
- **Single Node host** — `npm run build && npm start` serves `client/dist` from the
  API origin, which removes CORS entirely.

`CLIENT_ORIGIN` must be set in production; without it CORS only allows localhost.
Secrets go in the host's environment variable settings, never in a committed file.
See `.env.example` for the full list.

### Vercel's Root Directory must stay at the repo root

This is a monorepo and the deploy depends on it. `vercel.json`, `api/index.js`
and `server/` all live at the root; only the front end lives in `client/`.

Setting the project's **Root Directory** to `client` breaks the deploy twice
over. First the build dies immediately —

```
sh: line 1: cd: client: No such file or directory
Error: Command "cd client && npm ci && npm run build" exited with 1
```

— because `buildCommand` already does the `cd` itself. The tell is the install
line just above it: ~84 packages is `client/`'s dependency count, the repo root
installs ~232.

The second failure is the dangerous one, because it is silent. From inside
`client/` Vercel never sees the root `vercel.json` or `api/index.js`, so a build
that *did* succeed would ship a storefront with:

- no `/api/*` function at all — the catalogue never loads and no order can be placed
- no `/(.*)` rewrite — every deep link 404s
- none of the `X-Frame-Options` / `nosniff` / `Referrer-Policy` headers

So the fix for that `cd` error is **never** to drop `cd client` from the build
command. Clear the Root Directory setting (Project → Settings → Build and
Deployment → Root Directory) and leave it at `./`.

## Known issues

**`start()` runs on import — `server/src/index.js`.** The comment says it is only
called when the file is the process entry point, but there is no guard. `api/index.js`
imports `createApp` from this module, so on Vercel a cold start also fires
a second database pool and `app.listen(PORT)` alongside the adapter's own `ensureDb()`.
Needs a `process.env.VERCEL !== "1"` check or the `import.meta.url === process.argv[1]`
idiom.

**`npm test` cannot run without credentials.** `server/test/e2e.mjs` spins up an
throwaway Postgres and the real server, but requires live-looking `rzp_test_*` keys in
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

# As built — where each rule lives

The brief above is implemented. This maps each standing rule to the code that
enforces it, so a future change can be checked against the right file rather
than rediscovered.

| Rule | Where it is enforced |
|---|---|
| 1 — centred header logo | `Header.jsx`; the coin sits in `#header-coin-slot`, which is also the dock the launch coin flies into |
| 2 — full-page canvases, never a drawer or popup | `Panel.jsx` is the only chassis. Search, Products, Bag, Wishlist, Product, Checkout and all six reading pages go through it. There are no modals left — the old `*Modal.jsx` files were renamed `*Panel.jsx` so the filenames cannot re-suggest one |
| 3 — gold is an accent, never a fill | `.metallic-text` is restricted to the wordmark and the coin. The single flat gold button is the hero CTA in `Hero.jsx` |
| 4 — the coin flips on Y, never Z | `coinScene.js`: `spin.flip` drives `rotation.y`; `rotation.z = 0` is written explicitly every frame |
| 5 — badge updates after the animation | `CartContext.jsx` keeps `count` (truth) and `badge` (displayed). `badge` is held while `flightsRef` is non-zero and synced in the flight's `finally` |
| 6 — no toasts | `ToastContext` is deleted. Forms answer in place (`Footer.jsx`, `InfoForms.jsx`) |
| 7 — typewriter except the wordmark and branch labels | `.wordmark` and `.branch-label` in `styles/index.css` are the only two users of `--font-brand` |
| 8 — OFL or system fonts | Archivo (OFL), Cormorant Garamond, Courier Prime |

## Fonts — the trap that was here before

There is no Google Fonts family called "Archivo Expanded". The expanded width is
a **variable `wdth` axis** on Archivo. Requesting it by name returns HTTP 200
with the family silently dropped, which is why the wordmark used to render in
Helvetica. `client/index.html` requests
`family=Archivo:wdth,wght@62.5..125,400..800`, and `font-stretch: 125%` on
`.wordmark` / `.branch-label` is what actually selects Expanded. Do not "tidy"
that stretch away.

## The coin

- Opens full-size and face-on, draggable from the first frame. The camera never
  dollies — `resize()` solves the distance so the whole coin fits on both axes.
- `frameExtentFor(small)` in `LaunchCanvas.jsx` is the single source of truth for
  how much air surrounds the coin. It is passed into `createCoinScene` and used
  to place the branch anchors and to size the header dock, so the three can
  never drift apart. Mobile uses a wider extent — a smaller coin — because the
  halo's labels need room beside it on a 375px screen.
- Environment is built through `PMREMGenerator`, not assigned raw. A raw
  `CanvasTexture` is sampled without roughness convolution and the clearcoat
  reads as a sticker.
- The gold arc is centred at equirect `u = 0.75` (behind the camera) and spans
  ±115°, because a flat face's reflection sweeps at twice its rotation angle.
- `envMapIntensity` follows `0.14 + 1.45·|cos(rotY)|³` on the faces; the rim gets
  the inverse weighting so it stays lit while the faces go dark at profile.
- **The dock must be measured against the stage's PINNED geometry.** While
  pinned, ScrollTrigger fixes the stage to the viewport top, so its centre is
  `(offsetWidth/2, offsetHeight/2)`. Measuring `getBoundingClientRect()` at setup
  reads it where it sits in normal flow and the coin overshoots the header.

## Coin interaction

There are two coins and they must teach the same gestures: the WebGL one on the
launch stage (`lib/coinScene.js`) and the CSS one (`components/Coin.jsx`) used
in the hero and as the no-WebGL fallback. Both are real controls, not
decoration, and both implement the same model — change one, change the other:

- **Drag** horizontally to flip it, with momentum on release.
- **Tap** (a press that travels under 5px in under 350ms) turns it to its other
  face — `flipOver()` snaps to the nearest multiple of π, so it stays honest
  however many times it has been spun.
- **Keyboard**: the canvas takes a tab stop (`tabIndex = 0`, `role="button"`,
  with an aria-label). Arrow keys nudge it round; Enter/Space turns it over.
  Without this the coin is unreachable for anyone not using a mouse.
- `spin.target` suppresses both idle drift and scroll-spin while a deliberate
  flip is easing, so nothing fights the user. `addSpin()` returns early during a
  drag or a flip for the same reason.

The CSS coin stays passive in the header and footer — the header one lives
inside an `<a href="#top">`, and a draggable control inside a link fights it.

Four things here are easy to break by accident:

1. **The branch layer must keep `pointer-events: none`.** It is an
   `absolute inset-0` div sitting *above* the canvas, so without it every
   pointerdown meant for the coin is swallowed and the coin cannot be dragged at
   all — which is exactly how it shipped before. The branch buttons opt back in
   individually with `pointer-events-auto`.
2. **`touch-action: pan-y`, never `none`.** The canvas covers the whole pinned
   stage; with `none`, a phone user cannot swipe past the launch section. `pan-y`
   leaves vertical scrolling to the browser and keeps horizontal drags for the
   coin, which is exactly the split a Y-axis flip wants.
3. **Tap detection runs before `releasePointerCapture`.** That call throws when
   the pointer was never captured, and a throw there silently swallows the tap.
   Both capture calls are best-effort and wrapped.
4. **The CSS coin's pointer listeners belong on the OUTER span, never on
   `.coin-inner`.** The inner span is the element being rotated, and its hit box
   collapses to literally 0px wide as it passes edge-on — measured, not
   theorised. Listening there leaves the coin ungrabbable at exactly the angle a
   visitor most wants to correct.

## Product photography

Assets live in `client/public/assets/` as WebP at **1000×1250 (4:5)**, referenced
from `catalogue.json` per edition. Keep that ratio: the Spotlight's `<img>`
declares `width="1000" height="1250"` with `object-cover`, so a photo of a
different shape gets cropped to fit, and mismatched ratios make the frame jump
when the edition is switched.

The Spotlight is a dark stage (`bg-ink`), so a product shot on a **dark ground**
sits far better than one on a light wall — the background merges into the stage
and the bag reads as floating rather than sitting in a lit rectangle.

**Currently inconsistent, and worth resolving:** the Dusk photo is on dark
concrete (background ≈ RGB 41,41,41); the Dawn photo is still on the original
light warm wall (≈ 113,108,109). Switching editions therefore swaps the whole
background, not just the bag. Either re-shoot Dawn on the dark ground or grade
the existing one down — but do not grade it silently, it is the client's
photography.

Also note the weight: the dark concrete is heavily grained and costs bits. Dusk
is 334KB at WebP q82 against Dawn's 152KB, and it is eager-loaded with
`fetchpriority="high"`. Quality below ~q78 starts to mush the jute weave, which
the copy explicitly sells ("an open weave left honest").

## The genie

`lib/genie.js` — plain DOM plus the Web Animations API, deliberately not
React-shaped, because the badge has to wait on `animation.finished`. The flight
is a quadratic arc with a lifted control point; the horizontal pinch runs ahead
of the vertical collapse. `CartContext.addToBag` adds the line immediately (so
the bag's contents are right if opened mid-flight) and only the badge waits.

## Branch placement

Anchors sit on the coin's measured rim and the silhouette is pinned by its left
edge and rotated to the bearing, so a branch grows out of the metal rather than
floating near it. Bearings are hand-set and uneven; `angleSmall` in
`hotspots.js` is the sub-768px variant. A `useLayoutEffect` in `LaunchCanvas`
measures each label after layout and nudges it back inside the viewport — that
clamp is what keeps "Your bag (12)" on screen without per-breakpoint tuning.

## Judgement calls worth knowing

- **The hero coin was removed, then restored on request.** The brief's hero
  lists eyebrow, headline, one line of positioning, one gold button — no coin —
  so it was cut as repetition against the launch canvas above and the header it
  docks into. That call was reversed: the coin is back, and interactive.
- **`MobileMenu` is gone.** The brief wants categories in a full-screen panel;
  the Products canvas already is one, so a second panel duplicating it was
  removed rather than kept in parallel.
- **Desktop branch anchors are now radial too.** The old hand-placed percentages
  were tuned for the previous macro framing and put labels on top of the coin.
  Bearings and reach still differ per branch and per breakpoint, so the
  arrangement stays hand-placed rather than an evenly spaced ring.

## Verified behaviour

Checked in a real browser against the running stack, not inferred:

- The coin lands exactly on the header slot centre, with a visible arc mid-flight
- WebGL coin: a real mouse drag turns it (180px → 1.98 rad) with momentum; a tap
  sets a flip target of exactly π; the canvas takes focus and ArrowRight adds
  2.4 rad/s
- Hero (CSS) coin: 100px of drag turns it exactly 60° (0.6°/px) and carries
  momentum; the grab still works with the inner span measured at 0px wide;
  tap from 150° targets 360° and from 0° targets 180°; a 420ms press and a
  drag both correctly do *not* flip; arrows add and reverse velocity with
  `preventDefault`, Enter and Space flip
- The flip easing was simulated across 20/30/60fps: it lands exactly on target
  in ~0.9s, never overshoots, and is frame-rate independent
- Add to bag: badge reads (0) 120 ms into the flight and (1) once it lands; the
  bag never opens itself; storage holds only `{productId, variant, qty}`
- Products canvas: 12 cards, **zero** native `<select>` elements, body scroll
  locked while open and restored on close
- Reading pages: gold rule 54×1px `#8a6a1c`, numbered margin indices via
  `counter(doc, decimal-leading-zero)`, 1px `#ddd2ba` dividers, and form fields
  with `border-bottom: 1px` and no other borders
- Mobile 375px: every header control 44×44, no horizontal overflow, all three
  branch labels on screen and clear of the coin
- Header wordmark computes to `Archivo … / font-stretch 125%`; the hero
  wordmark to `Cormorant Garamond`

Two notes on verifying this in the Browser pane: it fires no scroll events for
scripted `window.scrollTo`, so ScrollTrigger has to be stepped with
`ScrollTrigger.update()`; and it freezes the document timeline whenever the pane
is hidden, so CSS transitions stall mid-flight. Neither is a fault in the site.

## Still open

Both predate this work and are unchanged — the server was not touched.

**~~`start()` runs on import~~ — FIXED.** It is now guarded by an entry-point
check (`process.argv[1]` vs `__filename`), so importing `createApp` from
`api/index.js` no longer starts a server. This was not theoretical: unguarded,
a missing database URL made `start()` call `process.exit(1)` at module load,
killing the serverless function before it could serve anything — every route,
including `/api/health`, returned `FUNCTION_INVOCATION_FAILED` in production.

`api/index.js` now also catches an `ensureDb()` failure and returns a readable
503 instead of letting the handler reject into an opaque
`FUNCTION_INVOCATION_FAILED`. The real error goes to the function log.

**`npm test` needs credentials.** `server/test/e2e.mjs` requires real `rzp_test_*`
keys in `server/.env` and exits early without them.
