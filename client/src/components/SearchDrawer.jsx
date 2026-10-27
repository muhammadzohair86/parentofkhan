import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import Drawer from "./Drawer.jsx";
import ProductImage from "./ProductImage.jsx";
import { useDebounce } from "../hooks/useDebounce.js";
import { useUI } from "../store/useUI.js";
import { searchProducts } from "../services/catalog.js";
import { money, frontImageOf, MIN_SEARCH } from "../lib.js";

export const shopSearchUrl = (q) => {
  const term = q.trim();
  return term ? `/shop?${new URLSearchParams({ q: term })}` : "/shop";
};

function Body() {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ data: null, loading: false, error: false });
  const [hint, setHint] = useState("");
  const dq = useDebounce(q, 250);
  const close = useUI((s) => s.closeDrawer);
  const navigate = useNavigate();
  const term = q.trim();
  const dterm = dq.trim();
  const typed = dterm.length >= MIN_SEARCH;

  // Each run owns an AbortController: a newer query (or closing the drawer) cancels the old request,
  // so a slow earlier response can never overwrite newer results.
  useEffect(() => {
    if (dterm.length < MIN_SEARCH) { setState({ data: null, loading: false, error: false }); return; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: false }));
    searchProducts(dterm, ctrl.signal).then(
      (data) => { if (!ctrl.signal.aborted) setState({ data, loading: false, error: false }); },
      (e) => { if (!ctrl.signal.aborted && e?.name !== "AbortError") setState({ data: null, loading: false, error: true }); }
    );
    return () => ctrl.abort();
  }, [dterm]);

  const submit = (e) => {
    e.preventDefault();
    if (term.length === 1) return setHint(`Type at least ${MIN_SEARCH} characters to search.`);
    setHint("");
    close();
    navigate(shopSearchUrl(term));
  };

  const waiting = term.length >= MIN_SEARCH && term !== dterm; // typed but debounce has not fired yet
  const loading = typed && (state.loading || waiting);
  const showResults = typed && !waiting && !state.loading;
  return (
    <div className="p-6">
      <form role="search" onSubmit={submit}>
        <label htmlFor="search-input" className="sr-only">Search products</label>
        <div className="relative">
          <button type="submit" aria-label="Search" className="absolute inset-y-0 left-3 z-10 flex items-center opacity-60 hover:opacity-100"><Search size={18} /></button>
          <input id="search-input" data-autofocus type="search" value={q} maxLength={60}
            onChange={(e) => { setQ(e.target.value); setHint(""); }}
            placeholder="Search tees, hoodies, designs…" className="field pl-11!" autoComplete="off" />
        </div>
      </form>
      <div className="mt-6" aria-live="polite">
        {hint && <p className="text-sm text-error">{hint}</p>}
        {!hint && !typed && <p className="text-sm opacity-60">Type at least two characters to search. Press Enter to see every match in the shop.</p>}
        {loading && <p className="text-sm opacity-60">Searching…</p>}
        {showResults && state.error && <p role="alert" className="text-sm text-error">Search is unavailable right now. Please try again shortly.</p>}
        {showResults && state.data?.length === 0 && (
          <p className="text-sm">No products match “{dterm}”. Try a shorter word, or browse the shop from the menu.</p>
        )}
        {showResults && state.data?.length > 0 && (
          <ul className="divide-y divide-base-300">
            {state.data.map((p) => (
              <li key={p.id}>
                <Link to={`/product/${p.slug}`} onClick={close} className="flex items-center gap-4 py-3 hover:bg-base-200">
                  <div className="h-20 w-16 shrink-0 overflow-hidden bg-base-200">
                    <ProductImage src={frontImageOf(p, p.variants[0])} hex={p.variants[0].hex} alt={p.name} widths={[96, 192]} sizes="64px" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-sm opacity-60">{p.category?.name}</p>
                  </div>
                  <p className="text-sm">{money(p.salePrice ?? p.price)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {showResults && state.data?.length > 0 && (
          <button type="button" onClick={() => { close(); navigate(shopSearchUrl(term)); }} className="link-u mt-4 text-sm">See all results in the shop</button>
        )}
      </div>
    </div>
  );
}

export default function SearchDrawer() {
  return <Drawer id="search" title="Search"><Body /></Drawer>;
}
