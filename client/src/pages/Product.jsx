import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProductImage from "../components/ProductImage.jsx";
import ProductGrid from "../components/ProductGrid.jsx";
import { useAsync, useTitle } from "../hooks/useAsync.js";
import { getProduct, getProducts } from "../services/catalog.js";
import { useCart } from "../store/useCart.js";
import { useUI } from "../store/useUI.js";
import { money, MAX_QTY } from "../lib.js";

export default function Product() {
  const { slug } = useParams();
  const { data: p, loading, error } = useAsync(() => getProduct(slug), [slug]);
  const related = useAsync(() => (p ? getProducts({ category: p.category?.slug }) : Promise.resolve([])), [p?.id]);
  const add = useCart((s) => s.add);
  const openDrawer = useUI((s) => s.openDrawer);
  const [vi, setVi] = useState(0);
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const [err, setErr] = useState("");
  useTitle(p?.name);
  useEffect(() => { setVi(0); setSize(""); setQty(1); setImg(0); setErr(""); }, [slug]);

  if (loading) return <div className="mx-auto max-w-[1600px] px-5 py-12 lg:px-10" aria-busy="true"><div className="aspect-[4/5] max-w-xl animate-pulse bg-base-200" /></div>;
  if (error) return <div role="alert" className="mx-auto max-w-3xl px-5 py-28 text-center"><h1 className="font-display text-5xl">Could not load this product</h1><p className="mt-3 opacity-70">Please refresh and try again.</p></div>;
  if (!p) return <div className="mx-auto max-w-3xl px-5 py-28 text-center"><h1 className="font-display text-5xl">Product not found</h1><Link to="/shop" className="link-u mt-6 inline-block">Back to shop</Link></div>;

  const v = p.variants[vi];
  const onSale = p.salePrice != null;
  const pickColor = (i) => { setVi(i); setImg(0); if (size && !(size in p.variants[i].sizes)) setSize(""); };
  const submit = () => {
    if (!size) return setErr("Please select a size.");
    if (add(p, v, size, qty)) { setErr(""); openDrawer("cart"); } else setErr("Could not add this item. Please try again.");
  };
  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm opacity-70">
        <Link to="/shop" className="link-u">Shop</Link>{p.category && " / "}{p.category && <Link to={`/shop/${p.category.slug}`} className="link-u">{p.category.name}</Link>}
      </nav>
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div className="grid gap-3 md:grid-cols-[80px_1fr]">
          <ul className="order-2 flex gap-3 md:order-1 md:flex-col" aria-label="Product images">
            {v.images.map((src, i) => (
              <li key={src}><button onClick={() => setImg(i)} aria-label={`Show image ${i + 1}`} aria-current={img === i}
                className={`block h-24 w-20 overflow-hidden bg-base-200 md:h-28 md:w-full ${img === i ? "outline outline-1 outline-black" : "opacity-70"}`}>
                <ProductImage src={src} hex={v.hex} alt="" label={i ? "Back" : "Front"} widths={[96, 192]} sizes="80px" /></button></li>
            ))}
          </ul>
          <div className="order-1 aspect-[4/5] overflow-hidden bg-base-200 md:order-2">
            <ProductImage src={v.images[img]} hex={v.hex} alt={`${p.name} in ${v.color}`} widths={[640, 960, 1280, 1600]} sizes="(max-width: 1023px) 100vw, 50vw" eager label={img ? "Back" : "Front"} />
          </div>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="font-display text-5xl leading-none md:text-6xl">{p.name}</h1>
          <p className="mt-4 text-xl">
            {onSale ? (<><span className="mr-3 line-through opacity-50">{money(p.price)}</span><span className="text-accent">{money(p.salePrice)}</span></>) : money(p.price)}
            <span className="ml-2 text-xs opacity-60">USD</span>
          </p>
          <p className="mt-6 leading-relaxed opacity-80">{p.description}</p>

          <fieldset className="mt-8">
            <legend className="eyebrow mb-3">Color — {v.color}</legend>
            <div className="flex gap-3">
              {p.variants.map((x, i) => (
                <button key={x.color} onClick={() => pickColor(i)} aria-label={x.color} aria-pressed={i === vi}
                  className={`relative h-9 w-9 border border-black/30 ${i === vi ? "outline outline-2 outline-offset-2 outline-black" : ""}`} style={{ background: x.hex }}>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="eyebrow mb-3">Size</legend>
            <div className="flex flex-wrap gap-2">
              {Object.keys(v.sizes).map((s) => (
                <button key={s} onClick={() => { setSize(s); setQty(1); setErr(""); }} aria-pressed={size === s}
                  className={`min-w-14 border px-4 py-3 text-sm ${size === s ? "border-black bg-neutral text-neutral-content" : "border-black/30 hover:border-black"}`}>{s}</button>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 flex items-center gap-4">
            <div className="inline-flex items-center border border-black/30" role="group" aria-label="Quantity">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="px-4 py-3">−</button>
              <span className="w-8 text-center" aria-live="polite">{qty}</span>
              <button onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} aria-label="Increase quantity" className="px-4 py-3">+</button>
            </div>
          </div>
          {err && <p role="alert" className="mt-3 text-sm text-error">{err}</p>}
          <button onClick={submit} className="btn-khan mt-6 w-full">Add to cart</button>

          <div className="mt-8 space-y-2 border-t border-base-300 pt-6 text-sm opacity-80">
            {/* TODO(owner): confirm shipping and returns wording before launch. */}
            <p>Shipping costs and delivery times are shown at checkout. See the <Link to="/policies/shipping" className="underline">Shipping Policy</Link>.</p>
            <p>Returns are covered in the <Link to="/policies/refund" className="underline">Refund Policy</Link>.</p>
          </div>
        </div>
      </div>
      {related.data?.filter((r) => r.id !== p.id).length > 0 && (
        <section className="mt-24" aria-labelledby="rel-h">
          <h2 id="rel-h" className="font-display mb-8 text-4xl">You may also like</h2>
          <ProductGrid products={related.data.filter((r) => r.id !== p.id).slice(0, 4)} />
        </section>
      )}
    </div>
  );
}
