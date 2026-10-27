// The Shop's category / color / sort controls. The desktop toolbar and the mobile Filter & Sort drawer both
// render THESE components with the same props, so there is only one set of filter logic and state.
// 1-2 options: the original buttons/swatches. 3+: a compact native <select> (good on phones).
const MAX_INLINE = 2;

const selectCls = (active, stacked) => `border bg-transparent px-2 ${stacked ? "w-full py-2.5 text-base" : "py-1"} ${active ? "border-black" : "border-base-300"}`;
const wrap = (stacked) => (stacked ? "space-y-3" : "flex flex-wrap items-center gap-3");
const btn = (on, stacked) => `${stacked ? "px-3 py-2" : "px-2 py-1"} ${on ? "border border-black" : "opacity-60"}`;

export function CategoryFilter({ cats, category, onPick, stacked = false }) {
  const list = cats.data || [];
  return (
    <div className={wrap(stacked)} role="group" aria-label="Filter by category">
      <span className="eyebrow block">Category</span>
      {list.length > MAX_INLINE ? (
        <select aria-label="Category" value={category || ""} onChange={(e) => onPick(e.target.value)} className={selectCls(!!category, stacked)}>
          <option value="">All Categories</option>
          {list.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => onPick("")} aria-pressed={!category} className={btn(!category, stacked)}>All</button>
          {list.map((c) => <button key={c.id} onClick={() => onPick(c.slug)} aria-pressed={category === c.slug} className={btn(category === c.slug, stacked)}>{c.name}</button>)}
        </div>
      )}
      {cats.error && <span role="alert" className="block text-xs text-error">Could not load categories.</span>}
    </div>
  );
}

// colors: [[name, hex], ...]
export function ColorFilter({ colors, color, onPick, stacked = false }) {
  const names = colors.map(([name]) => name);
  const options = color && !names.includes(color) ? [...names, color] : names; // never hide an applied color
  const selectedHex = colors.find(([name]) => name === color)?.[1];
  return (
    <div className={wrap(stacked)}>
      <span className="eyebrow block">Color</span>
      {colors.length > MAX_INLINE ? (
        <div className="flex items-center gap-3">
          {selectedHex && <span className="h-5 w-5 shrink-0 border border-black/30" style={{ background: selectedHex }} aria-hidden="true" />}
          <select aria-label="Color" value={color} onChange={(e) => onPick(e.target.value)} className={selectCls(!!color, stacked)}>
            <option value="">All Colors</option>
            {options.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => onPick("")} aria-pressed={!color} className={btn(!color, stacked)}>All</button>
          {colors.map(([name, hex]) => (
            <button key={name} onClick={() => onPick(name)} aria-pressed={color === name} aria-label={name} title={name}
              className={`h-5 w-5 border ${color === name ? "outline outline-2 outline-offset-2 outline-black" : "border-black/30"}`} style={{ background: hex }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SortFilter({ sort, onChange, stacked = false }) {
  return (
    <label className={stacked ? "block space-y-3" : "flex items-center gap-2"}>
      <span className="eyebrow block">Sort</span>
      <select value={sort} onChange={(e) => onChange(e.target.value)} className={selectCls(!!sort, stacked)}>
        <option value="">Featured</option><option value="newest">Newest</option>
        <option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option>
      </select>
    </label>
  );
}
