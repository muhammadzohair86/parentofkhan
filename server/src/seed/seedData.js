// DEMO DATA ONLY. These are placeholders, not the real Parent Of Khan catalog.
// Everything here is inserted with isDemo: true so it can be removed without touching real data.
// Remove it later with: npm run seed:remove

const COLORS = {
  black: { color: "Black", hex: "#151515" },
  white: { color: "White", hex: "#fbfaf6" },
  sand: { color: "Sand", hex: "#cdbd9a" },
  forest: { color: "Forest", hex: "#2f4a3a" },
};

const sizes = (s, m, l, xl) => [{ size: "S", stock: s }, { size: "M", stock: m }, { size: "L", stock: l }, { size: "XL", stock: xl }];
const variant = (slug, key, sz) => ({
  ...COLORS[key],
  sku: `${slug}-${key}`.toUpperCase(),
  sizes: sz,
  images: [`/assets/products/${slug}-${key}-front.jpg`, `/assets/products/${slug}-${key}-back.jpg`],
});
const product = (slug, name, categorySlug, extra) => {
  const first = extra.variants[0];
  return {
    slug, name, categorySlug,
    description: "Demo product. Replace with a real description.",
    tags: ["demo"],
    frontImage: first.images[0], backImage: first.images[1],
    active: true, featured: false,
    ...extra,
  };
};

export const seedCategories = [
  { slug: "t-shirts", name: "T-Shirts", description: "Printed on heavyweight cotton.", order: 1, active: true, showOnHomepage: true, showInNavbar: true },
  { slug: "hoodies", name: "Hoodies", description: "Coming soon in small runs.", order: 2, active: true, showOnHomepage: true, showInNavbar: true },
  // Inactive on purpose, to verify public endpoints exclude it and its products.
  { slug: "demo-archived", name: "Demo Archived", description: "Inactive demo category.", order: 99, active: false, showOnHomepage: false, showInNavbar: false },
];

export const seedProducts = [
  product("demo-tee-01", "Demo Tee 01", "t-shirts", { price: 29, featured: true, tags: ["demo", "tee"], variants: [variant("demo-tee-01", "black", sizes(5, 8, 6, 2)), variant("demo-tee-01", "white", sizes(3, 0, 4, 1))] }),
  product("demo-tee-02", "Demo Tee 02", "t-shirts", { price: 32, salePrice: 26, featured: true, tags: ["demo", "tee"], variants: [variant("demo-tee-02", "sand", sizes(4, 4, 4, 4)), variant("demo-tee-02", "black", sizes(2, 0, 0, 0))] }),
  product("demo-tee-03", "Demo Tee 03", "t-shirts", { price: 29, featured: true, tags: ["demo", "tee"], variants: [variant("demo-tee-03", "forest", sizes(6, 6, 6, 6))] }),
  // All stock is zero on purpose: must still be listed and purchasable (printed on demand).
  product("demo-tee-04", "Demo Tee 04", "t-shirts", { price: 34, featured: true, tags: ["demo", "tee", "zero-stock"], variants: [variant("demo-tee-04", "white", sizes(0, 0, 0, 0)), variant("demo-tee-04", "forest", sizes(0, 0, 0, 0))] }),
  product("demo-tee-05", "Demo Tee 05", "t-shirts", { price: 29, tags: ["demo", "tee"], variants: [variant("demo-tee-05", "black", sizes(5, 5, 5, 5))] }),
  product("demo-hoodie-01", "Demo Hoodie 01", "hoodies", { price: 64, tags: ["demo", "hoodie"], variants: [variant("demo-hoodie-01", "black", sizes(3, 5, 5, 2)), variant("demo-hoodie-01", "sand", sizes(2, 3, 3, 1))] }),
  product("demo-hoodie-02", "Demo Hoodie 02", "hoodies", { price: 68, tags: ["demo", "hoodie"], variants: [variant("demo-hoodie-02", "forest", sizes(2, 4, 4, 2))] }),
  // Inactive on purpose: must never appear in public results.
  product("demo-inactive-tee", "Demo Inactive Tee", "t-shirts", { price: 25, active: false, tags: ["demo", "inactive"], variants: [variant("demo-inactive-tee", "black", sizes(5, 5, 5, 5))] }),
  // In an inactive category: must be hidden too.
  product("demo-archived-tee", "Demo Archived Tee", "demo-archived", { price: 25, tags: ["demo", "archived"], variants: [variant("demo-archived-tee", "black", sizes(5, 5, 5, 5))] }),
  // Only color is explicitly production-unavailable: hidden because of the flag, not stock.
  product("demo-unavailable-tee", "Demo Unavailable Tee", "t-shirts", { price: 25, tags: ["demo", "unavailable"], variants: [{ ...variant("demo-unavailable-tee", "black", sizes(9, 9, 9, 9)), available: false }] }),
];
