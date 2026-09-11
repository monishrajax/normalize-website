import { Router } from "express";
import { list, findBySlug, toPublic } from "../models/Product.js";

const router = Router();

/* GET /api/products?category=bags&sort=price-asc&q=tote
   Replaces the hardcoded PRODUCTS array that used to sit in index.html.
   Filtering, sorting and the ILIKE escaping all live in models/Product.js. */
router.get("/", async (req, res, next) => {
  try {
    const { category, q, sort } = req.query;
    const products = await list({ category, q, sort });
    res.json({ products: products.map(toPublic) });
  } catch (err) {
    next(err);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const product = await findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json({ product: toPublic(product) });
  } catch (err) {
    next(err);
  }
});

export default router;
