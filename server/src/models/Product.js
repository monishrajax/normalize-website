import mongoose from "mongoose";

/* One document per sellable piece. This collection is the ONLY source of truth
   for price — the browser sends {productId, variant, qty} and the server looks
   the money up here. In the old single-file site the price existed twice (once
   in index.html, once in the functions' CATALOGUE) and the two had already
   drifted apart; there is now exactly one copy. */
const productSchema = new mongoose.Schema(
  {
    slug:     { type: String, required: true, unique: true, index: true },
    name:     { type: String, required: true },
    category: { type: String, required: true, enum: ["apparel", "bags", "caps", "accessories"] },
    price:    { type: Number, required: true, min: 0 },   // whole rupees
    sizes:    { type: [String], default: [] },
    image:    { type: String, default: "" },
    images:   { type: Map, of: String, default: {} },     // variant -> image, e.g. Dawn/Dusk
    desc:     { type: String, default: "" },

    // Long-form copy for the product page accordions.
    details: {
      material: { type: String, default: "" },
      design:   { type: String, default: "" },
      care:     { type: String, default: "" },
    },

    // Courier needs these; they never reach the browser.
    sku:      { type: String, required: true },
    weightKg: { type: Number, default: 0.5 },
    dims: {
      length:  { type: Number, default: 30 },
      breadth: { type: Number, default: 10 },
      height:  { type: Number, default: 25 },
    },

    // Launch mode: only products flagged sellable can be bought. Replaces the
    // hardcoded LAUNCH_MODE / LAUNCH_PRODUCT_ID constants in the old file, so
    // the catalogue can be opened up from the database instead of a redeploy.
    isSellable: { type: Boolean, default: false, index: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* What the browser is allowed to see. Anything not listed here — courier
   dimensions, internal SKU, weight — stays on the server. */
productSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    slug: this.slug,
    name: this.name,
    category: this.category,
    price: this.price,
    sizes: this.sizes,
    image: this.image,
    images: Object.fromEntries(this.images || []),
    desc: this.desc,
    details: this.details,
    isSellable: this.isSellable,
    isFeatured: this.isFeatured,
  };
};

export default mongoose.model("Product", productSchema);
