import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { useAsync } from "../hooks/useAsync.js";
import { A, getUploadConfig, formatMB } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { ImageField, GalleryField } from "./ImageField.jsx";
import { PageHeader, Loading, Notice, Field, Check, btnSm } from "./ui.jsx";

const blankVariant = () => ({ color: "", hex: "#151515", sku: "", available: true, sizes: ["S", "M", "L", "XL"].map((size) => ({ size, stock: "0" })), front: null, back: null, extras: [] });
const blank = () => ({ name: "", slug: "", description: "", price: "", salePrice: "", weightKg: "", category: "", front: null, back: null, gallery: [], variants: [blankVariant()], featured: false, active: true, sortOrder: "0", tags: "", seoTitle: "", seoDescription: "" });

// API product -> form state (variant.images = [front, back, ...extras])
const fromProduct = (p) => ({
  name: p.name, slug: p.slug, description: p.description, price: String(p.price), salePrice: p.salePrice == null ? "" : String(p.salePrice), weightKg: p.weightKg == null ? "" : String(p.weightKg), category: p.category,
  front: p.frontImage, back: p.backImage, gallery: p.galleryImages, featured: p.featured, active: p.active, sortOrder: String(p.sortOrder), tags: p.tags.join(", "), seoTitle: p.seoTitle, seoDescription: p.seoDescription,
  variants: p.variants.map((v) => ({ color: v.color, hex: v.hex, sku: v.sku, available: v.available, sizes: v.sizes.map((s) => ({ size: s.size, stock: String(s.stock) })), front: v.images[0] || null, back: v.images[1] || null, extras: v.images.slice(2) })),
});

// form state -> API payload. Variant images are stored as [front, back, ...extras]; extras only count once front and back exist.
const toPayload = (f) => ({
  name: f.name.trim(), slug: f.slug.trim(), description: f.description, price: f.price === "" ? undefined : Number(f.price), salePrice: f.salePrice === "" ? null : Number(f.salePrice), weightKg: f.weightKg === "" ? null : Number(f.weightKg), category: f.category,
  frontImage: f.front, backImage: f.back, galleryImages: f.gallery, featured: f.featured, active: f.active, sortOrder: parseInt(f.sortOrder || "0", 10) || 0,
  tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), seoTitle: f.seoTitle, seoDescription: f.seoDescription,
  variants: f.variants.map((v) => ({
    color: v.color.trim(), hex: v.hex, sku: v.sku, available: v.available,
    sizes: v.sizes.map((s) => ({ size: s.size.trim(), stock: parseInt(s.stock || "0", 10) || 0 })),
    images: v.front ? [v.front, ...(v.back ? [v.back, ...v.extras] : [])] : [],
  })),
});

const prettyPath = (path) => path.replace(/variants\.(\d+)/g, (_, i) => `Color ${Number(i) + 1}`).replace(/sizes\.(\d+)/g, (_, i) => `size ${Number(i) + 1}`).replace(/\./g, " › ");
const Section = ({ title, children }) => <section className="space-y-4 border border-base-300 p-5"><h2 className="font-display text-2xl">{title}</h2>{children}</section>;

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const user = useAdminAuth((s) => s.user);
  const [f, setF] = useState(blank);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null); // { message, details }
  const [saved, setSaved] = useState("");
  const top = useRef(null);
  const allowed = can(user, isNew ? "products.create" : "products.edit");

  const cats = useAsync(() => A.get("/categories/options"), []);
  const upl = useAsync(getUploadConfig, []);
  const limitText = upl.data ? `JPEG, PNG or WebP, up to ${formatMB(upl.data.maxBytes)} each.` : "JPEG, PNG or WebP.";
  const prod = useAsync(() => (isNew ? Promise.resolve(null) : A.get(`/products/${id}`)), [id]);
  useEffect(() => { if (prod.data?.data) { setF(fromProduct(prod.data.data)); setLoaded(true); } }, [prod.data]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setVariant = (i, patch) => setF((s) => ({ ...s, variants: s.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  const setSize = (i, j, patch) => setF((s) => ({ ...s, variants: s.variants.map((v, a) => (a === i ? { ...v, sizes: v.sizes.map((z, b) => (b === j ? { ...z, ...patch } : z)) } : v)) }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setErr(null); setSaved("");
    try {
      const { data } = isNew ? await A.post("/products", toPayload(f)) : await A.patch(`/products/${id}`, toPayload(f));
      if (isNew) return navigate("/admin/products", { replace: true });
      setF(fromProduct(data)); setSaved("Saved. The store now shows these changes.");
    } catch (e2) {
      setErr({ message: e2.message, details: e2.details });
    } finally {
      setSaving(false);
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!isNew && prod.error) return <Notice tone="error">{prod.error.status === 404 ? "This product no longer exists." : prod.error.message} <Link to="/admin/products" className="link-u">Back to products</Link></Notice>;
  if (!loaded || cats.loading) return <Loading />;
  if (cats.error) return <Notice tone="error">Could not load categories: {cats.error.message}</Notice>;
  const categories = cats.data.data;

  return (
    <form onSubmit={submit} noValidate>
      <div ref={top} />
      <PageHeader title={isNew ? "New product" : "Edit product"} subtitle={isNew ? undefined : `/${f.slug}`}>
        <Link to="/admin/products" className={btnSm}>Back</Link>
        {!isNew && f.slug && <a href={`/product/${f.slug}`} target="_blank" rel="noreferrer" className={`${btnSm} inline-flex items-center gap-1`}>View on store <ExternalLink size={12} /></a>}
      </PageHeader>
      {!allowed && <Notice tone="error" className="mb-4">You can view this product but not change it.</Notice>}
      {saved && <Notice tone="success" className="mb-4">{saved}</Notice>}
      {err && (
        <Notice tone="error" className="mb-4">
          <p className="font-medium">{err.message}</p>
          {err.details?.length > 0 && <ul className="mt-2 list-disc pl-5">{err.details.map((d, i) => <li key={i}>{d.path ? `${prettyPath(d.path)}: ` : ""}{d.message}</li>)}</ul>}
        </Notice>
      )}

      <fieldset disabled={!allowed || saving} className="space-y-6">
        <Section title="Basics">
          <Field label="Name"><input className="field" value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="URL name (slug)" hint="Leave empty to generate it from the name. Changing it changes the product's web address."><input className="field" value={f.slug} maxLength={140} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated" /></Field>
            <Field label="Category">
              <select className="field" value={f.category} onChange={(e) => set("category", e.target.value)} required>
                <option value="">Choose a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description"><textarea className="field min-h-28" value={f.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Tags" hint="Comma separated. Used by store search."><input className="field" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="meme, hoodie, black" /></Field>
        </Section>

        <Section title="Pricing">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (USD)"><input className="field" inputMode="decimal" type="number" min="0" step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} required /></Field>
            <Field label="Sale price (USD)" hint="Optional. Must be lower than the price."><input className="field" inputMode="decimal" type="number" min="0" step="0.01" value={f.salePrice} onChange={(e) => set("salePrice", e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Shipping weight">
          <Field label="Packed weight of one unit (kg)" hint="Weight of one packed item, e.g. 0.45. Used to work out the shipping charge (domestic and international are both weight-based). Leave empty if not known: shipping can't be quoted for this product until it's set, unless Free Shipping is on.">
            <input className="field !w-40" inputMode="decimal" type="number" min="0" step="0.001" value={f.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
          </Field>
        </Section>

        <Section title="Product images">
          <p className="text-xs opacity-70">Shown for the first color. Other colors use their own images below. {limitText}</p>
          <div className="flex flex-wrap gap-6">
            <ImageField label="Front image" value={f.front} onChange={(v) => set("front", v)} />
            <ImageField label="Back image" value={f.back} onChange={(v) => set("back", v)} />
          </div>
          <GalleryField label="Extra images" values={f.gallery} onChange={(v) => set("gallery", v)} max={8} />
        </Section>

        <Section title="Colors, sizes and images">
          <p className="text-xs opacity-70">Products are printed on demand: stock numbers are informational and never hide a product or block a sale. Mark a color unavailable to hide it from customers.</p>
          {f.variants.map((v, i) => (
            <div key={i} className="space-y-4 border border-base-300 bg-base-200/40 p-4">
              <div className="flex items-center justify-between"><h3 className="eyebrow">Color {i + 1}</h3>
                {f.variants.length > 1 && <button type="button" className="p-1 text-error" aria-label={`Remove color ${i + 1}`} onClick={() => set("variants", f.variants.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}</div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Color name"><input className="field" value={v.color} maxLength={40} onChange={(e) => setVariant(i, { color: e.target.value })} required /></Field>
                <Field label="Hex"><div className="flex gap-2"><input type="color" aria-label={`Color ${i + 1} picker`} value={/^#[0-9a-f]{6}$/i.test(v.hex) ? v.hex : "#151515"} onChange={(e) => setVariant(i, { hex: e.target.value })} className="h-[3.1rem] w-12 shrink-0 border border-base-300 bg-transparent p-1" />
                  <input className="field" value={v.hex} maxLength={7} onChange={(e) => setVariant(i, { hex: e.target.value })} /></div></Field>
                <Field label="SKU"><input className="field" value={v.sku} maxLength={60} onChange={(e) => setVariant(i, { sku: e.target.value })} /></Field>
                <div className="flex items-end pb-3"><Check label="Available" checked={v.available} onChange={(c) => setVariant(i, { available: c })} /></div>
              </div>
              <div>
                <p className="eyebrow mb-2">Sizes</p>
                <div className="space-y-2">
                  {v.sizes.map((s, j) => (
                    <div key={j} className="flex flex-wrap items-center gap-2">
                      <input aria-label={`Color ${i + 1} size ${j + 1} label`} className="field !w-24 !py-2" value={s.size} maxLength={10} onChange={(e) => setSize(i, j, { size: e.target.value })} placeholder="Size" />
                      <input aria-label={`Color ${i + 1} size ${j + 1} stock`} className="field !w-28 !py-2" type="number" min="0" step="1" value={s.stock} onChange={(e) => setSize(i, j, { stock: e.target.value })} placeholder="Stock" />
                      <span className="text-xs opacity-60">informational</span>
                      {v.sizes.length > 1 && <button type="button" className="p-1 text-error" aria-label={`Remove size ${j + 1} from color ${i + 1}`} onClick={() => setVariant(i, { sizes: v.sizes.filter((_, k) => k !== j) })}><Trash2 size={15} /></button>}
                    </div>
                  ))}
                </div>
                <button type="button" className={`${btnSm} mt-2`} onClick={() => setVariant(i, { sizes: [...v.sizes, { size: "", stock: "0" }] })}>Add size</button>
              </div>
              <div>
                <p className="eyebrow mb-2">Images for this color</p>
                <div className="flex flex-wrap gap-6">
                  <ImageField label="Front" value={v.front} onChange={(u) => setVariant(i, { front: u })} />
                  <ImageField label="Back" value={v.back} disabled={!v.front} onChange={(u) => setVariant(i, { back: u })} hint={!v.front ? "Add the front image first." : undefined} />
                </div>
                <div className="mt-4"><GalleryField label="Extra images" values={v.extras} disabled={!v.front || !v.back} onChange={(u) => setVariant(i, { extras: u })} max={8} hint={!v.front || !v.back ? "Add front and back first." : undefined} /></div>
              </div>
            </div>
          ))}
          <button type="button" className={`${btnSm} inline-flex items-center gap-1`} onClick={() => set("variants", [...f.variants, blankVariant()])}><Plus size={14} /> Add color</button>
        </Section>

        <Section title="Visibility">
          <div className="flex flex-wrap items-center gap-6">
            <Check label="Active (visible in the store)" checked={f.active} onChange={(v) => set("active", v)} />
            <Check label="Featured on the homepage" checked={f.featured} onChange={(v) => set("featured", v)} />
            <label className="flex items-center gap-2 text-sm">Store order <input type="number" step="1" className="field !w-24 !py-2" value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></label>
          </div>
          <p className="text-xs opacity-60">Lower store order numbers appear first.</p>
        </Section>

        <Section title="Search engines (optional)">
          <Field label="SEO title" hint={`${f.seoTitle.length}/70`}><input className="field" value={f.seoTitle} maxLength={70} onChange={(e) => set("seoTitle", e.target.value)} /></Field>
          <Field label="SEO description" hint={`${f.seoDescription.length}/160`}><textarea className="field" rows={2} value={f.seoDescription} maxLength={160} onChange={(e) => set("seoDescription", e.target.value)} /></Field>
        </Section>
      </fieldset>

      {allowed && (
        <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-base-300 bg-base-100 py-4">
          <button className="btn-khan" disabled={saving}>{saving ? "Saving…" : isNew ? "Create product" : "Save changes"}</button>
          <Link to="/admin/products" className="text-sm link-u">Cancel</Link>
        </div>
      )}
    </form>
  );
}
