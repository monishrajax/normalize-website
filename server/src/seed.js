/* Loads the catalogue into MongoDB. Safe to re-run: it upserts by slug, so
   existing orders keep pointing at the same product documents.
   Run with:  npm run seed        (from server/) */
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Product from "./models/Product.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogue = JSON.parse(readFileSync(path.join(__dirname, "data/catalogue.json"), "utf8"));

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Copy server/.env.example to server/.env first.");
  process.exit(1);
}

await mongoose.connect(uri);

let created = 0;
let updated = 0;
for (const item of catalogue) {
  const existing = await Product.findOne({ slug: item.slug });
  if (existing) {
    Object.assign(existing, item);
    await existing.save();
    updated++;
  } else {
    await Product.create(item);
    created++;
  }
}

const sellable = await Product.find({ isSellable: true });
console.log(`Seeded: ${created} created, ${updated} updated, ${catalogue.length} total.`);
console.log(`Sellable right now: ${sellable.map((p) => p.name).join(", ") || "none"}`);
console.log("To open the full catalogue after launch, flip isSellable to true:");
console.log('  db.products.updateMany({}, { $set: { isSellable: true } })');

await mongoose.disconnect();
