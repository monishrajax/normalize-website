import { db } from "../db.js";

/* One row per sellable piece. This table is the ONLY source of truth for price
   — the browser sends {productId, variant, qty} and the server looks the money
   up here. In the old single-file site the price existed twice (once in
   index.html, once in the functions' CATALOGUE) and the two had already
   drifted apart; there is now exactly one copy. */

/* What the browser is allowed to see. Anything not listed here — courier
   dimensions, internal SKU, weight — stays on the server. */
export function toPublic(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    price: row.price,
    sizes: row.sizes ?? [],
    image: row.image,
    images: row.images ?? {},
    desc: row.description,
    details: row.details ?? {},
    isSellable: row.isSellable,
    isFeatured: row.isFeatured,
  };
}

const SORTS = {
  "price-asc":  (sql) => sql`price asc`,
  "price-desc": (sql) => sql`price desc`,
  newest:       (sql) => sql`created_at desc`,
  featured:     (sql) => sql`sort_order asc`,
};

/* GET /api/products?category=bags&sort=price-asc&q=tote */
export async function list({ category, q, sort } = {}) {
  const sql = db();
  const term = typeof q === "string" ? q.trim().slice(0, 80) : "";

  /* ILIKE treats % and _ as wildcards, so a search for "50%" would otherwise
     match everything. Escaping them (and the escape character itself) keeps a
     search a search. This replaces a regex-escaping step: the old query built a
     regular expression from user input, so it had to neutralise regex
     metacharacters too. ILIKE has a smaller blast radius. */
  const pattern = term
    ? `%${term.replace(/([\\%_])/g, "\\$1")}%`
    : null;

  const order = (SORTS[sort] || SORTS.featured)(sql);

  return sql`
    select * from products
    where ${
      category && category !== "all"
        ? sql`category = ${category}`
        : sql`true`
    }
    and ${
      pattern
        ? sql`(name ilike ${pattern} escape '\' or description ilike ${pattern} escape '\' or category ilike ${pattern} escape '\')`
        : sql`true`
    }
    order by ${order}
  `;
}

export async function findBySlug(slug) {
  const [row] = await db()`select * from products where slug = ${slug} limit 1`;
  return row ?? null;
}

/* Used by the pricing engine: one round trip for the whole cart rather than a
   query per line. */
export async function findByIds(ids) {
  if (!ids.length) return [];
  return db()`select * from products where id = any(${ids}::uuid[])`;
}

export async function listSellable() {
  return db()`select * from products where is_sellable = true order by sort_order asc`;
}

/* Seeding. Upserts by slug so existing orders keep pointing at the same product
   rows and re-running is safe. Returns 'created' or 'updated' so the seed
   script can report honestly. */
export async function upsertBySlug(item) {
  const sql = db();
  const row = {
    slug: item.slug,
    name: item.name,
    category: item.category,
    price: item.price,
    sizes: item.sizes ?? [],
    image: item.image ?? "",
    images: sql.json(item.images ?? {}),
    description: item.desc ?? "",
    details: sql.json(item.details ?? {}),
    sku: item.sku,
    weightKg: item.weightKg ?? 0.5,
    dims: sql.json(item.dims ?? { length: 30, breadth: 10, height: 25 }),
    isSellable: item.isSellable ?? false,
    isFeatured: item.isFeatured ?? false,
    sortOrder: item.sortOrder ?? 0,
  };

  const [result] = await sql`
    insert into products ${sql(row)}
    on conflict (slug) do update set ${sql(row)}
    returning id, (xmax = 0) as inserted
  `;
  return result.inserted ? "created" : "updated";
}
