// Shapes DB documents (lean objects) into the JSON the storefront already consumes.

export function serializeCategory(c) {
  return {
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    description: c.description || "",
    image: c.image || null,
    active: !!c.active,
    showOnHomepage: !!c.showOnHomepage,
    showInNavbar: !!c.showInNavbar,
    order: c.order ?? 0,
  };
}

// `fallbackImages` = product-level images, passed only for the default color (see serializeProduct).
export function serializeVariant(v, fallbackImages = []) {
  const sizes = {};
  for (const s of v.sizes || []) sizes[s.size] = s.stock ?? 0;
  const own = (v.images || []).filter(Boolean);
  return { color: v.color, hex: v.hex, sku: v.sku || null, available: true, images: own.length ? own : fallbackImages, sizes };
}

// Variants explicitly marked unavailable are omitted. Returns null when none remain.
export function serializeProduct(p, category) {
  const available = (p.variants || []).filter((v) => v.available !== false);
  if (!available.length) return null;
  const productImages = [p.frontImage, p.backImage, ...(p.galleryImages || [])].filter(Boolean);
  // The product-level front/back/gallery images belong to the product's default color (its first variant),
  // or to the only color. Other colors get ONLY their own images, never another color's photos.
  const variants = available.map((v) => serializeVariant(v, v === p.variants[0] || available.length === 1 ? productImages : []));
  const firstOwn = (available[0].images || []).filter(Boolean);
  const cat = category ?? p.category;
  return {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    description: p.description || "",
    price: p.price,
    salePrice: p.salePrice ?? null,
    featured: !!p.featured,
    tags: p.tags || [],
    categoryId: String(cat?._id ?? p.category),
    category: cat && cat.slug ? serializeCategory(cat) : null,
    frontImage: p.frontImage || firstOwn[0] || null,
    backImage: p.backImage || firstOwn[1] || null,
    galleryImages: p.galleryImages || [],
    variants,
    seo: { title: p.seoTitle || null, description: p.seoDescription || null },
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
  };
}
