import { useEffect, useState } from "react";
import { api } from "../lib/api";

/* Products and the pricing config both come from the server now — the old site
   carried a hardcoded PRODUCTS array in the page and a second copy of the
   prices in the serverless functions, and the two had already drifted. */
export function useCatalogue({ category, sort }) {
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Config is fetched once; it does not depend on the filters.
  useEffect(() => {
    let cancelled = false;
    api.getConfig()
      .then((c) => { if (!cancelled) setConfig(c); })
      .catch(() => { /* the UI falls back to sensible defaults without it */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    api.getProducts({ category, sort })
      .then((data) => { if (!cancelled) setProducts(data.products); })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setProducts([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Guards against a slow earlier request resolving after a newer one and
    // repainting the grid with stale results.
    return () => { cancelled = true; };
  }, [category, sort]);

  return { products, config, loading, error };
}
