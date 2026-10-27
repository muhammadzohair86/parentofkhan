import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

// Searchable country picker (ARIA combobox). `value` is an ISO 3166 code, `countries` is [{ code, name }] from the API.
// Used by the checkout form and the admin shipping form.
export default function CountrySelect({ countries, value, onChange, label, hint, error, disabled = false, required = false, placeholder = "Search countries…" }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = countries.find((c) => c.code === value) || null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : countries;
  }, [countries, query]);

  const pick = (c) => { onChange(c.code); setOpen(false); setQuery(""); };
  // Keyboard moves keep the highlighted option in view (mouse hover deliberately does not scroll).
  const move = (i) => {
    const next = Math.max(0, Math.min(i, matches.length - 1));
    setActive(next);
    requestAnimationFrame(() => document.getElementById(`${uid}-opt-${matches[next]?.code}`)?.scrollIntoView({ block: "nearest" }));
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); move(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(active - 1); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (matches[active]) pick(matches[active]); } // never submits the surrounding form
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); setQuery(""); } // closes the list only, not a dialog around it
  };

  return (
    <div className="relative">
      <label htmlFor={`${uid}-input`} className="eyebrow mb-2 block">{label}</label>
      <div className="relative">
        <input
          id={`${uid}-input`} role="combobox" aria-expanded={open} aria-controls={`${uid}-list`} aria-autocomplete="list" aria-invalid={!!error}
          aria-activedescendant={open && matches[active] ? `${uid}-opt-${matches[active].code}` : undefined}
          autoComplete="off" className="field !pr-10" disabled={disabled} required={required} placeholder={placeholder}
          value={open ? query : selected?.name || ""}
          onFocus={() => { setOpen(true); setQuery(""); setActive(Math.max(0, countries.findIndex((c) => c.code === value))); }}
          onClick={() => { if (!open) { setQuery(""); setOpen(true); } }} // the input keeps focus after a pick, so a second click must reopen the list
          onBlur={() => { setOpen(false); setQuery(""); }}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
      </div>
      {open && (
        <ul id={`${uid}-list`} role="listbox" aria-label={label} className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain border border-base-300 bg-base-100 shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-sm opacity-60">No country matches “{query}”.</li>}
          {matches.map((c, i) => (
            <li key={c.code} id={`${uid}-opt-${c.code}`} role="option" aria-selected={c.code === value}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-base-200" : ""} ${c.code === value ? "font-medium" : ""}`}>
              {c.name}
            </li>
          ))}
        </ul>
      )}
      {hint && !error && <span className="mt-1 block text-xs opacity-60">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-error">{error}</span>}
    </div>
  );
}
