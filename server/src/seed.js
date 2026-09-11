/* Loads the catalogue into Postgres. Safe to re-run: it upserts by slug, so
   existing orders keep pointing at the same product rows.

   Run with:  npm run seed        (from server/)

   The schema must exist first — apply server/sql/001_init.sql once, in the
   Supabase SQL editor or with psql. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsertBySlug, listSellable } from "./models/Product.js";
import { closeDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogue = JSON.parse(readFileSync(path.join(__dirname, "data/catalogue.json"), "utf8"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy server/.env.example to server/.env first.");
  process.exit(1);
}

let created = 0;
let updated = 0;
for (const item of catalogue) {
  (await upsertBySlug(item)) === "created" ? created++ : updated++;
}

const sellable = await listSellable();
console.log(`Seeded: ${created} created, ${updated} updated, ${catalogue.length} total.`);
console.log(`Sellable right now: ${sellable.map((p) => p.name).join(", ") || "none"}`);
console.log("To open the full catalogue after launch, flip is_sellable:");
console.log("  update products set is_sellable = true;");

await closeDb();
