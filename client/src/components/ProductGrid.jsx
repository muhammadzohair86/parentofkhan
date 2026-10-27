import ProductCard from "./ProductCard.jsx";

// `compact` = the mobile three-per-row layout. It only applies below the md breakpoint; desktop is unchanged.
const gridCls = (compact) => `grid ${compact ? "grid-cols-3 gap-x-2 gap-y-6" : "grid-cols-2 gap-x-4 gap-y-10"} md:grid-cols-3 md:gap-x-4 md:gap-y-10 xl:grid-cols-4`;

export function GridSkeleton({ n = 4, compact = false }) {
  return (
    <div className={gridCls(compact)} aria-busy="true" aria-label="Loading products">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i}><div className="aspect-[4/5] animate-pulse bg-base-200" /><div className="mt-3 h-4 w-2/3 animate-pulse bg-base-200" /></div>
      ))}
    </div>
  );
}

export default function ProductGrid({ products, eagerCount = 0, compact = false }) {
  return (
    <div className={gridCls(compact)}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} eager={i < eagerCount} compact={compact} />)}
    </div>
  );
}
