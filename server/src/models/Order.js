import { db } from "../db.js";

/* The old site had nowhere to record an order: money moved through Razorpay and
   a parcel appeared in Shiprocket, but nothing tied the two together. If the
   customer closed the tab mid-payment the sale simply vanished from view. Every
   order now lands here the moment it is created, and is updated as it is paid
   and shipped.

   items/pricing/customer are jsonb on purpose. They are a SNAPSHOT taken at
   purchase time: if the catalogue price changes next week, this order must
   still show what was actually charged. Joining live product rows would quietly
   rewrite history. */

const JSON_COLUMNS = new Set(["items", "pricing", "customer", "shipping"]);

/* postgres.js needs jsonb values wrapped, and every write here goes through one
   place so a caller can pass a plain object and not think about it. */
function encode(sql, patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] = JSON_COLUMNS.has(k) ? sql.json(v) : v;
  }
  return out;
}

/* Safe to hand back to the browser after checkout — no internal SKUs. */
export function toPublic(row) {
  const shipping = row.shipping ?? {};
  return {
    orderNumber: row.orderNumber,
    status: row.status,
    items: (row.items ?? []).map((l) => ({
      name: l.name, variant: l.variant, qty: l.qty, price: l.price,
    })),
    pricing: row.pricing,
    awb: shipping.awb ?? null,
    courier: shipping.courier ?? null,
    shipmentPending: shipping.pending ?? false,
    paidAt: row.paidAt,
  };
}

export async function create(data) {
  const sql = db();
  const row = encode(sql, {
    orderNumber: data.orderNumber,
    razorpayOrderId: data.razorpayOrderId,
    status: data.status ?? "created",
    items: data.items,
    pricing: data.pricing,
    customer: data.customer ?? {},
    shipping: data.shipping ?? {},
    /* Null for a guest, which is most orders. This list is an ALLOWLIST — a
       field the caller passes that is not named here is silently dropped, so
       anything new has to be added in both places or it vanishes without an
       error. */
    userId: data.userId ?? null,
  });
  const [created] = await sql`insert into orders ${sql(row)} returning *`;
  return created;
}

export async function findByRazorpayOrderId(razorpayOrderId) {
  const [row] = await db()`
    select * from orders where razorpay_order_id = ${razorpayOrderId} limit 1
  `;
  return row ?? null;
}

export async function findByOrderNumber(orderNumber) {
  const [row] = await db()`
    select * from orders where order_number = ${orderNumber} limit 1
  `;
  return row ?? null;
}

/* Returns the updated row, so callers never work from a stale copy. */
export async function update(id, patch) {
  const sql = db();
  const [row] = await sql`
    update orders set ${sql(encode(sql, patch))} where id = ${id} returning *
  `;
  return row ?? null;
}

/* Settling a payment is the one update that must not race. The webhook and the
   browser's verify call can arrive at the same instant, and settling twice
   would double-book the courier.

   `where status = 'created'` makes the database itself the referee: whichever
   request arrives second updates zero rows and gets null back, instead of both
   reading "created" and both proceeding. Checking the status in JavaScript
   first — as the previous implementation did — leaves a real window between the
   read and the save that a concurrent request can slip through. */
export async function settleIfUnpaid(id, patch) {
  const sql = db();
  const [row] = await sql`
    update orders set ${sql(encode(sql, patch))}
    where id = ${id} and status = 'created'
    returning *
  `;
  return row ?? null;
}
