import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadImage, getUploadConfig, IMAGE_TYPES, formatMB } from "./adminApi.js";
import OptimizedImage from "../components/OptimizedImage.jsx";

// Shared upload state: progress, validation errors, and the call itself.
function useUploader() {
  const [st, setSt] = useState({ busy: false, pct: 0, error: "" });
  const upload = async (file) => {
    if (!file) return null;
    if (!IMAGE_TYPES.includes(file.type)) { setSt({ busy: false, pct: 0, error: "Use a JPEG, PNG or WebP image." }); return null; }
    const { maxBytes } = await getUploadConfig();
    if (file.size > maxBytes) { setSt({ busy: false, pct: 0, error: `That image is larger than ${formatMB(maxBytes)}.` }); return null; }
    setSt({ busy: true, pct: 0, error: "" });
    try {
      const url = await uploadImage(file, (pct) => setSt((s) => ({ ...s, pct })));
      setSt({ busy: false, pct: 0, error: "" });
      return url;
    } catch (e) {
      setSt({ busy: false, pct: 0, error: e.message || "Upload failed." });
      return null;
    }
  };
  return [st, upload];
}

// Previews use the same optimized delivery as the storefront (small widths only).
function Preview({ src, alt, fallbackSrc }) {
  const [bad, setBad] = useState(null);
  const shown = src || fallbackSrc;
  if (!shown) return <div className="flex h-full w-full items-center justify-center bg-base-200 text-base-content/40"><ImagePlus size={22} aria-hidden="true" /></div>;
  if (bad === shown) return <div className="flex h-full w-full items-center justify-center bg-base-200 p-2 text-center text-[0.65rem] text-error">Image not found</div>;
  return (
    <div className="relative h-full w-full">
      <OptimizedImage src={shown} alt={alt} widths={[200, 400]} sizes="200px" onError={() => setBad(shown)} className="h-full w-full object-cover" />
      {!src && <span className="eyebrow absolute bottom-1 left-1 bg-base-100/90 px-1 text-[0.6rem]">Default</span>}
    </div>
  );
}

const Progress = ({ st }) => st.busy ? (
  <div className="mt-2" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
    <div className="h-1 bg-base-300"><div className="h-1 bg-neutral transition-[width]" style={{ width: `${st.pct}%` }} /></div>
    <p className="mt-1 text-xs opacity-60">{st.pct >= 100 ? "Processing…" : `Uploading… ${st.pct}%`}</p>
  </div>
) : st.error ? <p role="alert" className="mt-1 text-xs text-error">{st.error}</p> : null;

// One image slot (front, back, category image...). Shows a preview, upload/replace and remove controls.
export function ImageField({ label, value, onChange, disabled = false, hint, aspect = "aspect-[4/5]", width = "w-36", fallbackSrc }) {
  const input = useRef(null);
  const [st, upload] = useUploader();
  const pick = async (e) => { const url = await upload(e.target.files?.[0]); e.target.value = ""; if (url) onChange(url); };
  return (
    <div className={width}>
      <p className="eyebrow mb-2">{label}</p>
      <div className={`${aspect} overflow-hidden border border-base-300`}><Preview src={value} alt={label} fallbackSrc={fallbackSrc} /></div>
      <input ref={input} type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={pick} disabled={disabled || st.busy} aria-label={`Upload ${label}`} />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={disabled || st.busy} className="border border-black px-2 py-1 text-[0.65rem] uppercase tracking-wider hover:bg-neutral hover:text-neutral-content disabled:opacity-40">{value ? "Replace" : "Upload"}</button>
        {value && <button type="button" onClick={() => onChange(null)} disabled={disabled || st.busy} aria-label={`Remove ${label}`} className="p-1 text-error disabled:opacity-40"><Trash2 size={16} /></button>}
      </div>
      <Progress st={st} />
      {hint && !st.error && !st.busy && <p className="mt-1 text-xs opacity-60">{hint}</p>}
    </div>
  );
}

// A list of extra images with add / remove.
export function GalleryField({ label, values, onChange, max = 8, disabled = false, hint }) {
  const input = useRef(null);
  const [st, upload] = useUploader();
  const add = async (e) => {
    const files = [...(e.target.files || [])].slice(0, max - values.length);
    e.target.value = "";
    let next = values;
    for (const f of files) { const url = await upload(f); if (url) { next = [...next, url]; onChange(next); } }
  };
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <div className="flex flex-wrap gap-3">
        {values.map((src, i) => (
          <div key={`${src}-${i}`} className="w-20">
            <div className="aspect-[4/5] overflow-hidden border border-base-300"><Preview src={src} alt={`${label} ${i + 1}`} /></div>
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} disabled={disabled} aria-label={`Remove ${label} ${i + 1}`} className="mt-1 p-1 text-error disabled:opacity-40"><Trash2 size={15} /></button>
          </div>
        ))}
        {values.length < max && (
          <div className="w-20">
            <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(",")} className="hidden" onChange={add} disabled={disabled || st.busy} aria-label={`Add ${label}`} />
            <button type="button" onClick={() => input.current?.click()} disabled={disabled || st.busy} className="flex aspect-[4/5] w-full items-center justify-center border border-dashed border-black/40 hover:bg-base-200 disabled:opacity-40" aria-label={`Add ${label}`}><ImagePlus size={20} /></button>
          </div>
        )}
      </div>
      <Progress st={st} />
      {hint && !st.error && !st.busy && <p className="mt-1 text-xs opacity-60">{hint}</p>}
    </div>
  );
}
