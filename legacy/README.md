# Legacy build (superseded)

The original single-file site, kept for reference until the MERN rewrite has
been running in production for a while. Nothing here is deployed any more.

- `index.html` — the whole previous site: 2.4 MB, of which ~2.2 MB was four
  base64 blobs. Those are now real files in `client/public/assets/`.
- `netlify/functions/` — the Netlify serverless functions, replaced by the
  Express API in `server/`.
- `netlify.toml` — the old deploy config, including the guard that stopped
  `/.env` being served (the publish root was the project root).
- `.env` — the Razorpay test keys as the functions consumed them. The live
  equivalent is now `server/.env`.

Everything of substance was carried across:

| Was | Now |
|---|---|
| `PRODUCTS` array in the page | `products` table in Postgres |
| `CATALOGUE` in `_lib.js` (a second, drifted copy of the prices) | the same collection — one source of truth |
| `PRODUCT_DETAILS` | `details` on each product document |
| `INFO_CONTENT` | `client/src/data/infoContent.js` |
| `LAUNCH_MODE` / `LAUNCH_PRODUCT_ID` constants | `isSellable` flag per product |
| `create-order.js` / `verify-payment.js` | `server/src/routes/orders.js` |
| `track-order.js` | `server/src/routes/tracking.js` |

Safe to delete once you're confident in the new stack.
