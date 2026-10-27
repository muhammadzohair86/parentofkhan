import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_QTY, frontImageOf } from "../lib.js";

export const lineKey = (productId, color, size) => `${productId}|${color}|${size}`;
export const unitPrice = (p) => p.salePrice ?? p.price;

const SYNCED = ["productId", "name", "price", "hex", "image", "unavailable"];

// Client-side cart for guests. Prices here are for display only —
// the server recalculates and revalidates them at checkout (Phase 3).
// Lines are refreshed from the API by useCartSync, so images/prices/availability never go stale.
export const useCart = create(
  persist(
    (set, get) => ({
      items: [],
      add: (product, variant, size, qty = 1) => {
        if (!(size in variant.sizes)) return false;
        const max = MAX_QTY;
        const key = lineKey(product.id, variant.color, size);
        const existing = get().items.find((i) => i.key === key);
        const nextQty = Math.min((existing?.qty ?? 0) + qty, max);
        if (nextQty <= 0) return false;
        const line = {
          key, productId: product.id, slug: product.slug, name: product.name,
          price: unitPrice(product), color: variant.color, hex: variant.hex,
          size, qty: nextQty, max, image: frontImageOf(product, variant), unavailable: false,
        };
        set((s) => ({ items: existing ? s.items.map((i) => (i.key === key ? line : i)) : [...s.items, line] }));
        return true;
      },
      setQty: (key, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.min(qty, i.max)) } : i)),
        })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
      // products: Map(slug -> product | null). null = the product is gone (404); slugs that failed to load are omitted.
      sync: (products) =>
        set((s) => {
          let changed = false;
          const items = s.items.map((i) => {
            if (!products.has(i.slug)) return i;
            const p = products.get(i.slug);
            const v = p?.variants?.find((x) => x.color === i.color);
            const ok = !!v && i.size in v.sizes;
            const next = ok
              ? { ...i, productId: p.id, name: p.name, price: unitPrice(p), hex: v.hex, image: frontImageOf(p, v), unavailable: false }
              : { ...i, unavailable: true };
            if (SYNCED.some((k) => next[k] !== i[k])) changed = true;
            return next;
          });
          return changed ? { items } : s;
        }),
    }),
    {
      name: "pok-cart",
      version: 3,
      // v2 carts are kept (their missing images are repaired by useCartSync); anything older is reset.
      migrate: (state, version) => (version >= 2 && Array.isArray(state?.items) ? state : { items: [] }),
    }
  )
);

export const cartCount = (s) => s.items.reduce((n, i) => n + (i.unavailable ? 0 : i.qty), 0);
export const cartSubtotal = (s) => s.items.reduce((n, i) => n + (i.unavailable ? 0 : i.qty * i.price), 0);
