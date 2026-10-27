import { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import ProductImage from "./ProductImage.jsx";
import ImageSwiper from "./ImageSwiper.jsx";
import OptimizedImage from "./OptimizedImage.jsx";
import QuickAddSheet from "./QuickAddSheet.jsx";
import { useCart } from "../store/useCart.js";
import { useUI } from "../store/useUI.js";
import { usePhone } from "../hooks/overlay.js";
import { money, variantAvailable, cardImages } from "../lib.js";

const MAX_SWATCHES = 5; // more colors than this collapse into "+N" (the product page lists them all)

// Back image fades in on hover (hover-capable devices only). Renders nothing if missing or broken,
// so products without a back image keep showing the front image with no broken-image icon.
function BackImage({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <OptimizedImage src={src} alt="" onError={() => setFailed(true)} aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100" />
  );
}

// Desktop quick add (unchanged behavior). Uses the card's selected color.
function QuickAdd({ product, vi, setVi, onDone }) {
  const add = useCart((s) => s.add);
  const openDrawer = useUI((s) => s.openDrawer);
  const available = product.variants.filter(variantAvailable);
  const v = available[vi];
  const choose = (size) => {
    if (add(product, v, size)) { onDone(); openDrawer("cart"); }
  };
  return (
    <div className="absolute inset-x-0 bottom-0 space-y-2 border-t border-base-300 bg-base-100/95 p-3" role="group" aria-label={`Quick add ${product.name}`}>
      {available.length > 1 && (
        <div className="flex gap-2">
          {available.map((x, i) => (
            <button key={x.color} aria-label={x.color} aria-pressed={i === vi} onClick={() => setVi(i)}
              className={`h-5 w-5 border ${i === vi ? "outline outline-2 outline-offset-2 outline-black" : "border-black/30"}`} style={{ background: x.hex }} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(v.sizes).map((size) => (
          <button key={size} onClick={() => choose(size)}
            className="min-w-9 border border-black/40 px-2 py-1 text-xs hover:bg-neutral hover:text-neutral-content">{size}</button>
        ))}
      </div>
    </div>
  );
}

// Color swatches under the name. One color: the original static swatch. Several: selectable buttons.
function Swatches({ variants, vi, setVi, slug }) {
  if (variants.length === 1) {
    const x = variants[0];
    return <ul className="mt-2 flex gap-1.5" aria-label="Available colors"><li title={x.color} className="h-3 w-3 border border-black/30" style={{ background: x.hex }}><span className="sr-only">{x.color}</span></li></ul>;
  }
  let shown = variants.map((x, i) => [x, i]).slice(0, MAX_SWATCHES);
  if (vi >= MAX_SWATCHES) shown = [...shown.slice(0, MAX_SWATCHES - 1), [variants[vi], vi]]; // the selected color is always visible
  const hidden = variants.length - shown.length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Choose a color">
      {shown.map(([x, i]) => (
        <button key={x.color} type="button" onClick={() => setVi(i)} aria-label={x.color} aria-pressed={i === vi} title={x.color}
          className={`relative h-4 w-4 border before:absolute before:-inset-2 before:content-[''] ${i === vi ? "border-black outline outline-2 outline-offset-2 outline-black" : "border-black/30"}`} style={{ background: x.hex }} />
      ))}
      {hidden > 0 && <Link to={`/product/${slug}`} className="text-xs opacity-60 hover:opacity-100" aria-label={`${hidden} more colors`}>+{hidden}</Link>}
    </div>
  );
}

export default function ProductCard({ product, eager = false, compact = false }) {
  const available = product.variants.filter(variantAvailable);
  const [vi, setVi] = useState(0);
  const [quick, setQuick] = useState(false);
  const [sheet, setSheet] = useState(false);
  const touch = usePhone(); // phone widths: swipe carousel + bottom sheet; wider: hover image swap + desktop quick add
  const narrow = touch;
  const index = Math.min(vi, available.length - 1);
  const v = available[index];
  const purchasable = available.length > 0;
  const images = cardImages(product, v, index); // the selected color's own images; never another color's
  const onSale = product.salePrice != null;
  const price = onSale ? (<><span className="mr-1 line-through opacity-50">{money(product.price)}</span><span className="text-accent">{money(product.salePrice)}</span></>) : money(product.price);

  // Compact (three-per-row, phones only): front image + name + price. No back image, carousel, hover swap,
  // swatches or quick add, so a tap anywhere on the card simply opens the product page.
  if (compact && narrow) {
    return (
      <article>
        <Link to={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true" className="block aspect-[4/5] overflow-hidden bg-base-200">
          <ProductImage src={images[0]} hex={v.hex} alt="" eager={eager} />
        </Link>
        <div className="mt-2">
          <h3 className="line-clamp-2 text-xs leading-snug"><Link to={`/product/${product.slug}`} className="link-u">{product.name}</Link></h3>
          <p className="mt-0.5 text-xs">{price}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="group" onMouseLeave={() => setQuick(false)}>
      <div className="relative aspect-[4/5] overflow-hidden bg-base-200">
        <Link to={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true" className="block h-full w-full">
          {touch ? (
            <ImageSwiper key={v.color} images={images} hex={v.hex} alt="" eager={eager} />
          ) : (
            <div className="relative h-full w-full transition-transform duration-500 group-hover:scale-[1.03]">
              <ProductImage src={images[0]} hex={v.hex} alt="" eager={eager} />
              <BackImage key={v.color} src={images[1]} />
            </div>
          )}
        </Link>
        {touch ? (
          purchasable && (
            <button type="button" onClick={() => setSheet(true)} aria-label={`Quick add ${product.name}`} aria-haspopup="dialog"
              className="absolute bottom-0 right-0 z-10 flex h-11 w-11 items-center justify-center text-neutral [filter:drop-shadow(0_0_2px_rgba(255,255,255,.95))_drop-shadow(0_0_1px_rgba(255,255,255,.9))]">
              <ShoppingBag size={20} />
            </button>
          )
        ) : (
          <>
            {purchasable && !quick && (
              <button onClick={() => setQuick(true)} aria-label={`Quick add ${product.name}`}
                className="eyebrow absolute inset-x-0 bottom-0 translate-y-full bg-neutral py-3 text-neutral-content transition-transform focus-visible:translate-y-0 group-hover:translate-y-0 max-lg:translate-y-0">
                Quick add
              </button>
            )}
            {quick && <QuickAdd product={product} vi={index} setVi={setVi} onDone={() => setQuick(false)} />}
          </>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate"><Link to={`/product/${product.slug}`} className="link-u">{product.name}</Link></h3>
          <Swatches variants={available} vi={index} setVi={setVi} slug={product.slug} />
        </div>
        <p className="shrink-0 text-sm">
          {onSale ? (<><span className="mr-2 line-through opacity-50">{money(product.price)}</span><span className="text-accent">{money(product.salePrice)}</span></>) : money(product.price)}
        </p>
      </div>
      {touch && purchasable && <QuickAddSheet product={product} open={sheet} onClose={() => setSheet(false)} vi={index} onColorChange={setVi} />}
    </article>
  );
}
