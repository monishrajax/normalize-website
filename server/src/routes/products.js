import { Router } from "express";
import Product from "../models/Product.js";

const router = Router();

/* GET /api/products?category=bags&sort=price-asc&q=tote
   Replaces the hardcoded PRODUCTS array that used to sit in index.html. */
router.get("/", async (req, res, next) => {
  try {
    const { category, q, sort } = req.query;
    const filter = {};

    if (category && category !== "all") filter.category = category;
    if (q && String(q).trim()) {
      // Escape regex metacharacters so a search for "c++" can't blow up.
      const safe = String(q).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { desc: rx }, { category: rx }];
    }

    const sortMap = {
      "price-asc": { price: 1 },
      "price-desc": { price: -1 },
      newest: { createdAt: -1 },
      featured: { sortOrder: 1 },
    };

    const products = await Product.find(filter).sort(sortMap[sort] || sortMap.featured);
    res.json({ products: products.map((p) => p.toPublic()) });
  } catch (err) {
    next(err);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json({ product: product.toPublic() });
  } catch (err) {
    next(err);
  }
});

export default router;
