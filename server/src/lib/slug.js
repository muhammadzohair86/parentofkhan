// "Black Hoodie 01!" -> "black-hoodie-01". Accents are folded; anything else becomes a hyphen.
export function slugify(input) {
  return String(input ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 100).replace(/-+$/g, "");
}

// Given a base slug and the slugs already taken that look like it, returns the first free one: base, base-2, base-3...
export function nextFreeSlug(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
