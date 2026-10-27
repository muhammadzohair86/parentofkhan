import { useEffect, useState } from "react";
import { useAsync } from "../hooks/useAsync.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { ImageField } from "./ImageField.jsx";
import { PageHeader, Loading, Notice, Field, Check, btnSm, dateTime } from "./ui.jsx";

const DEFAULT_DESKTOP = "/assets/hero/hero.jpg";
const DEFAULT_MOBILE = "/assets/hero/hero-mobile.jpg";

export default function SiteHero() {
  const user = useAdminAuth((s) => s.user);
  const editable = can(user, "site.edit");
  const { data, loading, error } = useAsync(() => A.get("/site/hero"), []);
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState(null); // last values stored on the server
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (data?.data) { const { desktopImage, mobileImage, alt, active, updatedAt } = data.data; const v = { desktopImage, mobileImage, alt, active }; setF(v); setSaved({ ...v, updatedAt }); } }, [data]);

  if (loading && !f) return <Loading />;
  if (error) return <Notice tone="error">Could not load the homepage settings. {error.message}</Notice>;
  if (!f) return null;

  const set = (k, v) => { setMsg(null); setF((s) => ({ ...s, [k]: v })); };
  const dirty = JSON.stringify(f) !== JSON.stringify({ desktopImage: saved.desktopImage, mobileImage: saved.mobileImage, alt: saved.alt, active: saved.active });
  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data: d } = await A.put("/site/hero", { desktopImage: f.desktopImage, mobileImage: f.mobileImage, alt: f.alt, active: f.active });
      setSaved({ desktopImage: d.desktopImage, mobileImage: d.mobileImage, alt: d.alt, active: d.active, updatedAt: d.updatedAt });
      setMsg({ tone: "success", text: "Saved. Visitors will see the new hero within about 30 seconds." });
    } catch (e) {
      setMsg({ tone: "error", text: e.details?.length ? e.details.map((x) => x.message).join(" ") : e.message });
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Homepage hero" subtitle="The large image at the top of the homepage.">
        <a href="/" target="_blank" rel="noreferrer" className={btnSm}>View homepage</a>
      </PageHeader>
      {!editable && <Notice tone="error" className="mb-4">You can view these settings but not change them.</Notice>}
      {msg && <Notice tone={msg.tone} className="mb-4">{msg.text}</Notice>}

      <fieldset disabled={!editable || busy} className="space-y-6">
        <section className="space-y-4 border border-base-300 p-5">
          <h2 className="font-display text-2xl">Images</h2>
          <p className="text-xs opacity-70">Leave an image empty to use the built-in default shown with a “Default” tag. Use a wide image for desktop and a tall one for phones; both are cropped to fill the screen.</p>
          <div className="flex flex-wrap items-start gap-8">
            <ImageField label="Desktop image" value={f.desktopImage} onChange={(v) => set("desktopImage", v)} aspect="aspect-[16/9]" width="w-80" fallbackSrc={DEFAULT_DESKTOP} hint="Shown on screens 768px and wider." />
            <ImageField label="Mobile image" value={f.mobileImage} onChange={(v) => set("mobileImage", v)} aspect="aspect-[3/5]" width="w-40" fallbackSrc={DEFAULT_MOBILE} hint="Shown on phones. If empty, phones use the default mobile image." />
          </div>
        </section>
        <section className="space-y-4 border border-base-300 p-5">
          <h2 className="font-display text-2xl">Accessibility</h2>
          <Field label="Image description (alt text)" hint={`Read aloud by screen readers. Empty = “${data.data.defaultAlt}”. ${f.alt.length}/200`}>
            <input className="field" value={f.alt} maxLength={200} onChange={(e) => set("alt", e.target.value)} />
          </Field>
          <Check label="Use these images on the homepage (untick to go back to the built-in images without deleting these)" checked={f.active} onChange={(v) => set("active", v)} />
        </section>
      </fieldset>

      {editable && (
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-base-300 bg-base-100 py-4">
          <button className="btn-khan" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</button>
          <button className={btnSm} onClick={() => setF((s) => ({ ...s, desktopImage: null, mobileImage: null }))} disabled={busy || (!f.desktopImage && !f.mobileImage)}>Use default images</button>
          <span className="text-xs opacity-60">{saved.updatedAt ? `Last saved ${dateTime(saved.updatedAt)}` : "Never saved: the built-in images are in use."}</span>
        </div>
      )}
    </>
  );
}
