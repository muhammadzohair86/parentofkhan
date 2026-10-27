import { useRef } from "react";
import { Search, X } from "lucide-react";

// The Shop search box. Used twice (desktop toolbar, compact mobile toolbar) but both instances are driven by the
// same state/handlers in Shop, so there is a single search implementation. Exactly one clear (X) control.
export default function ShopSearch({ id, text, onChange, onSubmit, onClear, hint, compact = false }) {
  const ref = useRef(null);
  const clear = () => { onClear(); ref.current?.focus(); };
  return (
    <form role="search" onSubmit={onSubmit} className={compact ? "min-w-0 flex-1" : "flex items-center gap-2"}>
      <label htmlFor={id} className={compact ? "sr-only" : "eyebrow"}>{compact ? "Search products" : "Search"}</label>
      <div className="relative">
        <input id={id} ref={ref} type="search" value={text} maxLength={60} onChange={(e) => onChange(e.target.value)}
          placeholder="Search…" autoComplete="off" enterKeyHint="search"
          className={`no-native-clear border border-base-300 bg-transparent ${compact ? "w-full min-w-0 py-1.5 pl-8 pr-7 text-base" : "w-44 py-1 pl-2 pr-14 sm:w-56"}`} />
        {compact ? (
          <>
            <button type="submit" aria-label="Search" className="absolute inset-y-0 left-0 flex w-8 items-center justify-center opacity-60"><Search size={14} /></button>
            {text && <button type="button" aria-label="Clear search" onClick={clear} className="absolute inset-y-0 right-0 flex w-7 items-center justify-center opacity-60"><X size={14} /></button>}
          </>
        ) : (
          <div className="absolute inset-y-0 right-1 flex items-center">
            {text && <button type="button" aria-label="Clear search" onClick={clear} className="p-1 opacity-60 hover:opacity-100"><X size={14} /></button>}
            <button type="submit" aria-label="Search" className="p-1 opacity-60 hover:opacity-100"><Search size={14} /></button>
          </div>
        )}
      </div>
      {!compact && hint && <span className="text-xs text-error" role="alert">{hint}</span>}
    </form>
  );
}
