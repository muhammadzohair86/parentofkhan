import { useEffect, useState } from "react";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, Field, Check, btnSm, dateTime } from "./ui.jsx";

const MAX = 120;
const HEX = /^#[0-9a-f]{6}$/i;
// Same WCAG contrast rule the server enforces (the server is the authority; this only warns early).
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

function ColorField({ label, value, onChange, error }) {
  return (
    <Field label={label} error={error}>
      <div className="flex items-center gap-3">
        <input type="color" aria-label={`${label} picker`} className="h-10 w-14 cursor-pointer border border-base-300 bg-transparent p-1" value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
        <input className="field !w-32 font-mono" aria-label={`${label} (hex)`} value={value} maxLength={7} spellCheck={false} onChange={(e) => onChange(e.target.value.trim())} />
      </div>
    </Field>
  );
}

export default function Announcement() {
  const user = useAdminAuth((s) => s.user);
  const editable = can(user, "site.edit");
  const { data, loading, error } = useAsync(() => A.get("/site/announcement"), []);
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [fieldErr, setFieldErr] = useState({});
  useEffect(() => {
    if (!data?.data) return;
    const { enabled, text, backgroundColor, textColor, updatedAt, saved: wasSaved, defaults } = data.data;
    setF({ enabled, text, backgroundColor, textColor }); setSaved({ enabled, text, backgroundColor, textColor, updatedAt, wasSaved, defaults });
  }, [data]);

  if (loading && !f) return <Loading />;
  if (error) return <Notice tone="error">Could not load the announcement settings. {error.message}</Notice>;
  if (!f) return null;

  const set = (k, v) => { setMsg(null); setFieldErr((e) => ({ ...e, [k]: undefined })); setF((s) => ({ ...s, [k]: v })); };
  const dirty = JSON.stringify(f) !== JSON.stringify({ enabled: saved.enabled, text: saved.text, backgroundColor: saved.backgroundColor, textColor: saved.textColor });
  const colorsOk = HEX.test(f.backgroundColor) && HEX.test(f.textColor);
  const contrast = colorsOk ? ratio(f.backgroundColor, f.textColor) : null;
  const lowContrast = contrast !== null && contrast < 4.5;
  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg(null); setFieldErr({});
    try {
      const { data: d } = await A.put("/site/announcement", f);
      const v = { enabled: d.enabled, text: d.text, backgroundColor: d.backgroundColor, textColor: d.textColor };
      setF(v); setSaved({ ...v, updatedAt: d.updatedAt, wasSaved: true, defaults: d.defaults });
      setMsg({ tone: "success", text: d.enabled ? "Saved. The bar will update for visitors within about a minute." : "Saved. The bar is now hidden on the storefront." });
    } catch (e) {
      setFieldErr(Object.fromEntries((e.details || []).filter((x) => x.path).map((x) => [x.path, x.message])));
      setMsg({ tone: "error", text: e.details?.length ? "Please check the highlighted fields." : e.message });
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Announcement bar" subtitle="The slim message above the storefront navbar.">
        <a href="/" target="_blank" rel="noreferrer" className={btnSm}>View store</a>
      </PageHeader>
      {!editable && <Notice tone="error" className="mb-4">You can view these settings but not change them.</Notice>}
      {msg && <Notice tone={msg.tone} className="mb-4">{msg.text}</Notice>}

      <fieldset disabled={!editable || busy} className="space-y-6">
        <section className="space-y-4 border border-base-300 p-5">
          <h2 className="font-display text-2xl">Message</h2>
          <Check label="Show the announcement bar on the storefront" checked={f.enabled} onChange={(v) => set("enabled", v)} />
          <Field label="Announcement text" error={fieldErr.text} hint={`Plain text. ${f.text.length}/${MAX}`}>
            <input className="field" value={f.text} maxLength={MAX} onChange={(e) => set("text", e.target.value)} placeholder="FREE DELIVERY ALL OVER PAKISTAN" />
          </Field>
        </section>
        <section className="space-y-4 border border-base-300 p-5">
          <h2 className="font-display text-2xl">Colors</h2>
          <div className="flex flex-wrap gap-8">
            <ColorField label="Background color" value={f.backgroundColor} onChange={(v) => set("backgroundColor", v)} error={fieldErr.backgroundColor} />
            <ColorField label="Text color" value={f.textColor} onChange={(v) => set("textColor", v)} error={fieldErr.textColor} />
          </div>
          {contrast !== null && <p className={`text-xs ${lowContrast ? "text-error" : "opacity-60"}`}>Contrast {contrast.toFixed(1)}:1 {lowContrast ? "— too low to read comfortably; at least 4.5:1 is needed to save." : "— readable."}</p>}
        </section>
        <section className="space-y-2 border border-base-300 p-5">
          <h2 className="eyebrow opacity-70">Preview</h2>
          {colorsOk ? (
            <div style={{ backgroundColor: f.backgroundColor, color: f.textColor }} className={`px-4 py-2 text-center text-[0.65rem] font-medium uppercase leading-snug tracking-[0.18em] sm:text-xs ${f.enabled ? "" : "opacity-40"}`}>{f.text || "Your announcement text"}</div>
          ) : <p className="text-xs opacity-60">Enter valid colors to see the preview.</p>}
          {!f.enabled && <p className="text-xs opacity-60">The bar is switched off, so visitors see nothing.</p>}
        </section>
      </fieldset>

      {editable && (
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-base-300 bg-base-100 py-4">
          <button className="btn-khan" onClick={save} disabled={busy || !dirty || lowContrast}>{busy ? "Saving…" : "Save changes"}</button>
          <button className={btnSm} onClick={() => setF({ ...saved.defaults })} disabled={busy}>Reset to default</button>
          <span className="text-xs opacity-60">{saved.updatedAt ? `Last saved ${dateTime(saved.updatedAt)}` : "Never saved: the default message is in use."}</span>
        </div>
      )}
    </>
  );
}
