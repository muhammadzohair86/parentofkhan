// Cross-field checks shared by the create and update validators (pure, so they are unit-tested).
// Returns a list of { path, message }; empty = fine. Fields that are absent (partial updates) are skipped.
export function findProductProblems(d) {
  const out = [];
  if (typeof d.price === "number" && typeof d.salePrice === "number" && d.salePrice >= d.price) {
    out.push({ path: ["salePrice"], message: "Sale price must be lower than the base price." });
  }
  if (Array.isArray(d.variants)) {
    const colors = new Set();
    d.variants.forEach((v, i) => {
      const c = String(v.color ?? "").trim().toLowerCase();
      if (c && colors.has(c)) out.push({ path: ["variants", i, "color"], message: `The color "${v.color}" is used more than once.` });
      colors.add(c);
      const sizes = new Set();
      (v.sizes || []).forEach((s, j) => {
        const k = String(s.size ?? "").trim().toLowerCase();
        if (k && sizes.has(k)) out.push({ path: ["variants", i, "sizes", j, "size"], message: `The size "${s.size}" is listed more than once.` });
        sizes.add(k);
      });
    });
  }
  return out;
}
