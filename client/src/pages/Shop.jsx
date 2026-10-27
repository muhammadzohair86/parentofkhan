import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import ProductGrid, { GridSkeleton } from "../components/ProductGrid.jsx";
import Drawer from "../components/Drawer.jsx";
import Pagination from "../components/Pagination.jsx";
import ShopSearch from "../components/ShopSearch.jsx";
import { CategoryFilter, ColorFilter, SortFilter } from "../components/ShopFilters.jsx";
import { useAsync, useTitle } from "../hooks/useAsync.js";
import { useUI } from "../store/useUI.js";
import { getCategories, getProductsPage, getFacets } from "../services/catalog.js";
import { MIN_SEARCH, PAGE_SIZE } from "../lib.js";

// Mobile grid-layout selector icons: 4 blocks (2 per row, default) and 6 blocks (3 per row).
const Blocks = ({ cols, rows }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    {Array.from({ length: cols * rows }).map((_, i) => {
      const size = cols === 2 ? 9 : 6, gap = cols === 2 ? 2 : 1.5, x0 = (24 - (cols * size + (cols - 1) * gap)) / 2, y0 = (24 - (rows * size + (rows - 1) * gap)) / 2;
      return <rect key={i} x={x0 + (i % cols) * (size + gap)} y={y0 + Math.floor(i / cols) * (size + gap)} width={size} height={size} />;
    })}
  </svg>
);

const LAYOUT_KEY = "pok-shop-layout";
const readLayout = () => { try { return localStorage.getItem(LAYOUT_KEY) === "6" ? "6" : "4"; } catch { return "4"; } };

export default function Shop() {
  const { category } = useParams();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const openDrawer = useUI((s) => s.openDrawer);
  const closeDrawer = useUI((s) => s.closeDrawer);

  // The URL is the single source of truth for every filter, the search query and the page.
  const sort = sp.get("sort") || "";
  const color = sp.get("color") || "";
  const q = (sp.get("q") || "").trim().slice(0, 60);
  const activeQ = q.length >= MIN_SEARCH ? q : "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);

  const [text, setText] = useState(q);
  const [hint, setHint] = useState("");
  const [layout, setLayout] = useState(readLayout);
  useEffect(() => { setText(q); setHint(""); }, [q]); // keeps the inputs in sync on refresh, back/forward and sidebar searches

  const cats = useAsync(getCategories, []);
  const current = cats.data?.find((c) => c.slug === category);
  const list = useAsync(() => getProductsPage({ category, sort, color, q: activeQ, page, limit: PAGE_SIZE }), [category, sort, color, activeQ, page]);
  const facets = useAsync(() => getFacets({ category, q: activeQ }), [category, activeQ]);
  const colors = (facets.data || []).map((f) => [f.name, f.hex]);
  const products = list.data?.data;
  const meta = list.data?.meta;
  const { loading, error } = list;
  useTitle(current?.name || "All Items");

  const pageOutOfRange = !loading && !!meta && meta.total > 0 && page > meta.totalPages;
  useEffect(() => { // e.g. a stale ?page=9 in the URL: fall back to the last real page
    if (!pageOutOfRange) return;
    const n = new URLSearchParams(sp);
    meta.totalPages > 1 ? n.set("page", String(meta.totalPages)) : n.delete("page");
    setSp(n, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageOutOfRange]);

  // Any change to the search or a filter returns to page 1.
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete("page"); setSp(n); };
  const setPage = (p) => { const n = new URLSearchParams(sp); p > 1 ? n.set("page", String(p)) : n.delete("page"); setSp(n); window.scrollTo({ top: 0, behavior: "smooth" }); };
  // Switching category keeps the search and sort; color is dropped (colors differ per category) and so is the page.
  const pickCategory = (slug) => {
    const n = new URLSearchParams(sp);
    n.delete("color"); n.delete("page");
    navigate({ pathname: slug ? `/shop/${slug}` : "/shop", search: n.toString() ? `?${n}` : "" });
  };
  const clearFilters = () => navigate({ pathname: "/shop", search: q ? `?${new URLSearchParams({ q })}` : "" }); // keeps the search, drops category/color/sort/page
  const clearSearch = () => { setText(""); setHint(""); if (q) set("q", ""); };
  const submitSearch = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (t.length === 1) return setHint(`Type at least ${MIN_SEARCH} characters.`);
    set("q", t);
  };
  const onSearchChange = (v) => { setText(v); setHint(""); };
  const chooseLayout = (l) => { setLayout(l); try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* private mode */ } };

  // The filter drawer is phone-only: close it if the window grows, and never leave it "open" after leaving the page.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => { if (mq.matches && useUI.getState().drawer === "filters") closeDrawer(); };
    mq.addEventListener("change", on);
    return () => { mq.removeEventListener("change", on); if (useUI.getState().drawer === "filters") closeDrawer(); };
  }, [closeDrawer]);

  if (category && cats.data && !current) {
    return <div className="mx-auto max-w-3xl px-5 py-28 text-center"><h1 className="font-display text-5xl">Category not found</h1><Link to="/shop" className="link-u mt-6 inline-block">Back to all items</Link></div>;
  }

  const activeFilters = (category ? 1 : 0) + (color ? 1 : 0) + (sort ? 1 : 0);
  const compact = layout === "6";
  const showSkeleton = loading || pageOutOfRange;
  const iconBtn = (on) => `flex h-9 w-8 items-center justify-center ${on ? "text-neutral" : "text-neutral opacity-40"}`;

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-12 lg:px-10">
      <h1 className="font-display text-5xl md:text-7xl">{current?.name || "All Items"}</h1>
      {current?.description && <p className="mt-2 opacity-70">{current.description}</p>}
      {activeQ && !loading && !error && meta && (
        <p className="mt-2 opacity-70" role="status">{meta.total} {meta.total === 1 ? "result" : "results"} for “{activeQ}”</p>
      )}

      {/* Desktop toolbar (unchanged layout) */}
      <div className="my-8 hidden flex-wrap items-center justify-between gap-4 border-y border-base-300 py-3 text-sm md:flex">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <CategoryFilter cats={cats} category={category} onPick={pickCategory} />
          <ColorFilter colors={colors} color={color} onPick={(v) => set("color", v)} />
        </div>
        <ShopSearch id="shop-search" text={text} onChange={onSearchChange} onSubmit={submitSearch} onClear={clearSearch} hint={hint} />
        <SortFilter sort={sort} onChange={(v) => set("sort", v)} />
      </div>

      {/* Mobile toolbar: one row = Filter & Sort | search | grid layout (4-block / 6-block) */}
      <div className="my-6 border-y border-base-300 py-2 md:hidden">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => openDrawer("filters")} aria-label="Filter & Sort" aria-haspopup="dialog"
            className="relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap pr-1 text-[0.7rem] font-medium uppercase tracking-wider">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Filter<span className="max-[374px]:hidden"> &amp; Sort</span></span>
            {activeFilters > 0 && <span aria-hidden="true" className="flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral px-1 text-[0.6rem] leading-none text-neutral-content">{activeFilters}</span>}
          </button>
          <ShopSearch compact id="shop-search-m" text={text} onChange={onSearchChange} onSubmit={submitSearch} onClear={clearSearch} />
          <div role="group" aria-label="Grid layout" className="flex shrink-0 items-center">
            <button type="button" onClick={() => chooseLayout("4")} aria-label="Two products per row" aria-pressed={!compact} className={iconBtn(!compact)}><Blocks cols={2} rows={2} /></button>
            <button type="button" onClick={() => chooseLayout("6")} aria-label="Three products per row" aria-pressed={compact} className={iconBtn(compact)}><Blocks cols={3} rows={2} /></button>
          </div>
        </div>
        {hint && <p role="alert" className="pt-1 text-xs text-error">{hint}</p>}
      </div>

      {showSkeleton ? <GridSkeleton n={8} compact={compact} /> : error ? <p role="alert" className="py-16 text-center">Could not load products. Please refresh and try again.</p> : products?.length ? (
        <>
          <ProductGrid products={products} compact={compact} />
          <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
        </>
      ) : (
        <p className="py-16 text-center opacity-70">{activeQ ? <>No products match “{activeQ}”. <button onClick={() => set("q", "")} className="link-u underline">Clear search</button> or try a shorter word.</> : q ? `Type at least ${MIN_SEARCH} characters to search.` : "No products match these filters."}</p>
      )}

      {/* Right-side Filter & Sort drawer (phones). Same filter components and URL state as the desktop toolbar; changes apply immediately. */}
      <Drawer id="filters" title="Filter & Sort">
        <div className="flex min-h-full flex-col">
          <div className="flex-1 space-y-8 px-6 py-6">
            <CategoryFilter stacked cats={cats} category={category} onPick={pickCategory} />
            <ColorFilter stacked colors={colors} color={color} onPick={(v) => set("color", v)} />
            <SortFilter stacked sort={sort} onChange={(v) => set("sort", v)} />
          </div>
          <div className="sticky bottom-0 flex gap-3 border-t border-base-300 bg-base-100 px-6 pt-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <button type="button" onClick={clearFilters} disabled={!activeFilters} className="border border-black px-5 py-3 text-xs uppercase tracking-widest disabled:opacity-30">Clear all</button>
            <button type="button" onClick={closeDrawer} className="btn-khan flex-1">{meta && !loading ? `Show ${meta.total} ${meta.total === 1 ? "item" : "items"}` : "Done"}</button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
