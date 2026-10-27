import { useEffect } from "react";
import { useCart } from "../store/useCart.js";
import { getProduct } from "../services/catalog.js";

// Refreshes cart lines from the API (name, price, color, image, availability) on load and whenever
// the set of products in the cart changes. A product that is gone is flagged, never crashes the cart.
export function useCartSync() {
  const slugs = useCart((s) => [...new Set(s.items.map((i) => i.slug))].sort().join(","));
  useEffect(() => {
    if (!slugs) return;
    let cancelled = false;
    Promise.all(
      slugs.split(",").slice(0, 25).map(async (slug) => {
        try { return [slug, await getProduct(slug)]; } // null when 404/invalid
        catch { return null; } // network/server error: leave the line as it is
      })
    ).then((entries) => {
      if (!cancelled) useCart.getState().sync(new Map(entries.filter(Boolean)));
    });
    return () => { cancelled = true; };
  }, [slugs]);
}
