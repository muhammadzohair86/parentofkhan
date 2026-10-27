const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n) => fmt.format(n);

// Shipping is charged in PKR (or, for a destination an admin priced that way, USD). Amounts come from the server; this only formats them.
const pkrFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export const pkr = (n) => `PKR ${pkrFmt.format(n)}`;
export const formatAmount = (n, currency) => (currency === "USD" ? money(n) : currency === "PKR" ? pkr(n) : `${pkrFmt.format(n)} ${currency}`);

// Products are printed on demand, so recorded stock never blocks a sale.
// A variant is purchasable unless the admin explicitly marks it available: false.
export const variantAvailable = (v) => v.available !== false;
// Per-line quantity cap (a sanity limit, not an inventory limit).
export const MAX_QTY = 10;

// The API rejects search terms shorter than this (see server validators).
export const MIN_SEARCH = 2;

// Front image for a color: that color's own front image only. The API already gives the default color
// the product-level images, and never lends them to other colors (which would show the wrong color).
export const frontImageOf = (_product, variant) => variant?.images?.[0] || null;

// Ordered images for a product card/sheet in the selected color (front, back, then extras), de-duplicated.
// Default color (index 0): the product-level images, as the card always showed. Other colors: their own images.
export function cardImages(product, variant, index) {
  const own = (variant?.images || []).filter(Boolean);
  if (index === 0 && (product.frontImage || product.backImage)) {
    return [...new Set([product.frontImage, product.backImage, ...(product.galleryImages || [])].filter(Boolean))];
  }
  return [...new Set(own)];
}

export const PAGE_SIZE = 20;

// Page numbers to show in pagination: first, last, and the current page +/- 1, with "…" for gaps.
export function pageWindow(page, total) {
  const keep = new Set([1, total, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => keep.add(n));
  const nums = [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push(n - nums[i - 1] === 2 ? n - 1 : "…");
    out.push(n);
  });
  return out;
}
