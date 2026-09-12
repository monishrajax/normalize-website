# NORMALIZE

Storefront for a single-product launch, built on the MERN stack.

- **client/** — React 18 + Vite + Tailwind CSS v4
- **server/** — Express + Supabase Postgres, Razorpay payments, Shiprocket logistics

---

## Setup

```bash
npm run install:all
```

Then create `server/.env` from the template and fill it in:

```bash
cp server/.env.example server/.env
```

You need a Postgres connection string in `DATABASE_URL`. Two easy options:

- **Supabase** (free tier, nothing to install) — create a project, then
  Project Settings → Database → Connection string. Use the **transaction pooler**
  (port 6543), not the direct connection: serverless opens a connection per
  instance and the pooler exists for exactly that.
- **Local** — `brew install postgresql@16 && brew services start postgresql@16`,
  then `createdb normalize` and use `postgres://postgres@127.0.0.1:5432/normalize`.

Create the tables once, before seeding:

```bash
npm run migrate --prefix server
```

That applies `server/sql/001_init.sql` and reports whether both tables exist and
RLS is on. It is idempotent — safe to re-run, and it will not touch seeded data.
On Supabase you can paste that file into the SQL editor instead.

Load the catalogue:

```bash
npm run seed
```

## Running

```bash
npm run dev
```

Client on http://localhost:5173, API on http://localhost:5050. Vite proxies
`/api` to the server, so there is no CORS to think about in development.

## Testing

```bash
npm test
```

Spins up a throwaway Postgres and the real server, then exercises the catalogue,
pricing, the payment signature gate and the webhook — 33 checks, no real money
moved. The database is created and deleted inside the run, so it can never touch
a real one. Needs `initdb`/`pg_ctl` on PATH (they come with Postgres), or set
`TEST_DATABASE_URL` to point the suite at a scratch database instead.

---

## How money works

The browser never sends a price. It sends `{ productId, variant, qty }`; the
server looks the price up in Postgres and charges what **it** computes.

1. `POST /api/orders` — prices the cart, opens a Razorpay order, records it as `created`
2. Razorpay's own checkout takes the card details (they never touch this server)
3. `POST /api/orders/verify` — checks the HMAC-SHA256 signature, marks the order `paid`
4. `POST /api/orders/webhook` — the safety net: if the customer's browser dies
   before step 3, Razorpay calls this server-to-server and the order still settles

Step 4 is why the old build lost sales it never knew about. Set it up in the
Razorpay dashboard: **Settings → Webhooks → Add**, URL
`https://your-domain.com/api/orders/webhook`, event `payment.captured`, and put
the secret it gives you in `RAZORPAY_WEBHOOK_SECRET`. That secret is *different*
from your key secret.

## Launch mode

Only products with `isSellable: true` can be bought, and the site shows the
single-product spotlight while exactly one qualifies. To open the full catalogue
there is no redeploy — it's a database update:

```sql
update products set is_sellable = true;
```

## Going live

Put the real values in your host's environment variable settings, never in a
committed file:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase transaction-pooler connection string (port 6543) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | `rzp_live_…`; needs a KYC-activated account |
| `RAZORPAY_WEBHOOK_SECRET` | from the dashboard webhook you create |
| `CLIENT_ORIGIN` | your real domain — without it CORS only allows localhost |
| `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` | leave blank to record payments without booking couriers |
| `SHIPROCKET_CREATE_ON_PAYMENT` | `false` for a pre-book (pay now, ship later) |

`npm run build` then `npm start` serves the built client from the API origin, so
one Node host runs the whole thing.

---

The previous single-file build is in `legacy/` — see the note there for what
moved where.
