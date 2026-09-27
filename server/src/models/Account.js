import { db } from "../db.js";

/* Profile, saved addresses and the server-side wishlist.

   Every function here takes `userId` as its FIRST argument and every statement
   filters on it. That is not ceremony: these tables hold names, phone numbers
   and home addresses, and the only thing standing between one customer and
   another's is that filter. A query here that forgets it does not fail loudly —
   it quietly returns someone else's data. Callers pass `req.user.id`, which
   comes from a verified token and never from the request body. */

/* ---------------------------------------------------------------------------
   Profile
--------------------------------------------------------------------------- */

/* Upsert rather than select: a customer exists in auth.users the moment they
   sign up, but nothing has written a profile row for them yet. Making the first
   read create it removes a whole class of "works for me, 500s for new users"
   bug, and the ON CONFLICT means two tabs racing each other is harmless. */
export async function getProfile(userId) {
  const sql = db();
  const [row] = await sql`
    insert into profiles (user_id) values (${userId})
    on conflict (user_id) do update set user_id = excluded.user_id
    returning user_id, full_name, phone
  `;
  return { fullName: row.fullName, phone: row.phone };
}

export async function updateProfile(userId, { fullName, phone }) {
  const sql = db();
  const [row] = await sql`
    insert into profiles (user_id, full_name, phone)
    values (${userId}, ${fullName ?? ""}, ${phone ?? ""})
    on conflict (user_id) do update set
      full_name = excluded.full_name,
      phone     = excluded.phone
    returning full_name, phone
  `;
  return { fullName: row.fullName, phone: row.phone };
}

/* ---------------------------------------------------------------------------
   Addresses
--------------------------------------------------------------------------- */

const ADDRESS_FIELDS = ["label", "name", "phone", "line1", "city", "state", "pincode"];

export function toPublicAddress(row) {
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    phone: row.phone,
    line1: row.line1,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    isDefault: row.isDefault,
  };
}

export async function listAddresses(userId) {
  const sql = db();
  const rows = await sql`
    select * from addresses
    where user_id = ${userId}
    order by is_default desc, created_at desc
  `;
  return rows.map(toPublicAddress);
}

export async function createAddress(userId, data) {
  const sql = db();
  /* The first address a customer saves becomes their default with no extra
     click — otherwise checkout has nothing to prefill from until they go back
     and pick one, which reads as the feature being broken. */
  const [{ count }] = await sql`select count(*)::int as count from addresses where user_id = ${userId}`;
  const isDefault = data.isDefault === true || count === 0;

  if (isDefault) await clearDefault(sql, userId);

  const [row] = await sql`
    insert into addresses ${sql({
      userId,
      label: data.label || "Home",
      name: data.name,
      phone: data.phone,
      line1: data.line1,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      isDefault,
    })}
    returning *
  `;
  return toPublicAddress(row);
}

export async function updateAddress(userId, id, data) {
  const sql = db();
  const patch = {};
  for (const f of ADDRESS_FIELDS) if (data[f] !== undefined) patch[f] = data[f];

  if (data.isDefault === true) {
    await clearDefault(sql, userId);
    patch.isDefault = true;
  }
  if (Object.keys(patch).length === 0) return null;

  /* `and user_id = ...` is what makes an id from the URL safe. Without it,
     guessing another customer's address id would be enough to rewrite it. */
  const [row] = await sql`
    update addresses set ${sql(patch)}
    where id = ${id} and user_id = ${userId}
    returning *
  `;
  return row ? toPublicAddress(row) : null;
}

export async function deleteAddress(userId, id) {
  const sql = db();
  const rows = await sql`
    delete from addresses where id = ${id} and user_id = ${userId} returning id
  `;
  return rows.length > 0;
}

/* The partial unique index (one default per customer) rejects a second default
   rather than silently allowing it, so the old one has to be stood down first. */
function clearDefault(sql, userId) {
  return sql`update addresses set is_default = false where user_id = ${userId} and is_default`;
}

/* ---------------------------------------------------------------------------
   Wishlist
--------------------------------------------------------------------------- */

export async function listWishlist(userId) {
  const sql = db();
  const rows = await sql`
    select product_id from wishlists where user_id = ${userId} order by created_at desc
  `;
  return rows.map((r) => r.productId);
}

/** Add ids, keep what is already there. Returns the full list. */
export async function addToWishlist(userId, productIds) {
  const sql = db();
  const ids = [...new Set(productIds)].filter(isUuid);
  if (ids.length) {
    /* `do nothing` on the primary key is the whole reason this is a row per
       product rather than an array column: saving the same item from two
       devices at once cannot race, and the sign-in merge is one statement
       instead of a read-modify-write.

       The insert...select against products also means a wishlist can never
       hold an id that is not a real product — the foreign key would reject it,
       and a stale id from someone's localStorage would 500 the request. */
    await sql`
      insert into wishlists (user_id, product_id)
      select ${userId}, id from products where id in ${sql(ids)}
      on conflict do nothing
    `;
  }
  return listWishlist(userId);
}

export async function removeFromWishlist(userId, productId) {
  const sql = db();
  if (!isUuid(productId)) return listWishlist(userId);
  await sql`delete from wishlists where user_id = ${userId} and product_id = ${productId}`;
  return listWishlist(userId);
}

/* ---------------------------------------------------------------------------
   Orders
--------------------------------------------------------------------------- */

/* Only orders STAMPED with this user id at purchase time.

   Deliberately not "or where customer->>'email' = the token's email". Matching
   on email would hand a signed-up stranger the delivery address and phone
   number of every guest order placed with that address. The token's email being
   confirmed is not enough either — confirmation proves they can read the
   inbox today, not that they were the person who placed the order. */
export async function listOrders(userId, limit = 50) {
  const sql = db();
  return sql`
    select order_number, status, items, pricing, shipping, paid_at, created_at
    from orders
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return typeof v === "string" && UUID.test(v);
}
