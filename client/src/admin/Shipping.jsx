import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAsync } from "../hooks/useAsync.js";
import CountrySelect from "../components/CountrySelect.jsx";
import { getCountries } from "../services/shipping.js";
import { formatAmount, pkr } from "../lib.js";
import { A } from "./adminApi.js";
import { useAdminAuth, can } from "./useAdminAuth.js";
import { PageHeader, Loading, Notice, Badge, Modal, Confirm, Field, Check, btnSm, useReload } from "./ui.jsx";

// Field-specific messages from the API: { "domestic.name": "...", price: "..." }
const fieldErrors = (e) => Object.fromEntries((e?.details || []).filter((d) => d.path).map((d) => [d.path, d.message]));
const Section = ({ title, children }) => <section className="space-y-4 border border-base-300 p-5"><h2 className="font-display text-2xl">{title}</h2>{children}</section>;

const num = (v) => (v === "" ? null : Number(v));  // blank stays blank (null): the server decides whether that field may be empty

// ---------- Domestic (Pakistan) + currency conversion ----------
function DomesticSettings({ data, editable }) {
  const toForm = (d, rate) => ({
    enabled: d.enabled, freeShipping: d.freeShipping, name: d.name, deliveryEstimate: d.deliveryEstimate || "", packagingWeightKg: String(d.packagingWeightKg ?? 0),
    fixedCharge: String(d.fixedCharge), additionalPerKg: String(d.additionalPerKg), pkrPerUsd: rate == null ? "" : String(rate),
  });
  const [f, setF] = useState(() => toForm(data.domestic, data.pkrPerUsd));
  const [saved, setSaved] = useState(f);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errs, setErrs] = useState({});
  const [examples, setExamples] = useState({ tariff: data.tariff, rows: data.tariffExamples });
  const set = (k, v) => { setMsg(null); setErrs({}); setF((s) => ({ ...s, [k]: v })); };
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const t = examples.tariff;

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); setErrs({});
    try {
      const { data: d } = await A.put("/shipping/settings", {
        domestic: {
          enabled: f.enabled, freeShipping: f.freeShipping, name: f.name.trim(), deliveryEstimate: f.deliveryEstimate.trim(),
          packagingWeightKg: f.packagingWeightKg === "" ? 0 : Number(f.packagingWeightKg), fixedCharge: num(f.fixedCharge), additionalPerKg: num(f.additionalPerKg),
        },
        pkrPerUsd: num(f.pkrPerUsd),
      });
      const next = toForm(d.domestic, d.pkrPerUsd);
      setF(next); setSaved(next);
      // refresh the worked examples from the server so they reflect what was just saved
      A.get("/shipping").then((r) => setExamples({ tariff: r.data.tariff, rows: r.data.tariffExamples })).catch(() => {});
      setMsg({ tone: "success", text: "Saved. Checkout uses these settings straight away." });
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setMsg({ tone: "error", text: e2.details?.length ? "Please check the highlighted fields." : e2.message });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <fieldset disabled={!editable || busy} className="space-y-6">
        <Section title="Domestic shipping — Pakistan">
          <p className="text-xs opacity-70">These settings apply only to orders shipped within Pakistan. International shipping has its own settings further down.</p>
          <Check label="Domestic shipping enabled (untick to stop offering it at checkout)" checked={f.enabled} onChange={(v) => set("enabled", v)} />
          <div>
            <Check label="Enable Free Shipping for domestic orders" checked={f.freeShipping} onChange={(v) => set("freeShipping", v)} />
            {errs["domestic.freeShipping"] && <span className="mt-1 block text-xs text-error">{errs["domestic.freeShipping"]}</span>}
            {f.freeShipping && <Notice className="mt-2">Free Shipping is ON: every domestic order ships for PKR 0 and checkout shows “Free Shipping”. The charges below are saved but not used while it is on. It does not affect international orders.</Notice>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shipping name" error={errs["domestic.name"]}><input className="field" value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="NLS Xpress Domestic" /></Field>
            <Field label="Delivery estimate (optional)" error={errs["domestic.deliveryEstimate"]} hint="Saved with the shipping method exactly as you write it, e.g. “2-3 working days”.">
              <input className="field" value={f.deliveryEstimate} maxLength={80} onChange={(e) => set("deliveryEstimate", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Fixed charge for up to ${t.fixedUpToKg} KG (PKR)`} error={errs["domestic.fixedCharge"]} hint={`Charged for any parcel weighing up to and including ${t.fixedUpToKg} KG, including parcels under 1 KG.`}>
              <input className="field" type="number" inputMode="decimal" min="0" step="0.01" value={f.fixedCharge} onChange={(e) => set("fixedCharge", e.target.value)} />
            </Field>
            <Field label={`Charge per additional KG above ${t.fixedUpToKg} KG (PKR)`} error={errs["domestic.additionalPerKg"]} hint="Added for every extra whole kilogram. A fraction of a kilogram counts as a whole one.">
              <input className="field" type="number" inputMode="decimal" min="0" step="0.01" value={f.additionalPerKg} onChange={(e) => set("additionalPerKg", e.target.value)} />
            </Field>
          </div>
          <Field label="Packaging weight per parcel (kg)" error={errs["domestic.packagingWeightKg"]} hint="Added once to every domestic parcel when its billable weight is calculated. Enter 0 for none.">
            <input className="field !w-40" type="number" inputMode="decimal" min="0" step="0.001" value={f.packagingWeightKg} onChange={(e) => set("packagingWeightKg", e.target.value)} />
          </Field>
          <div className="space-y-3 border border-base-300 bg-base-200/40 p-4 text-sm">
            <p className="eyebrow">How the domestic charge is worked out</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Billable weight up to and including {t.fixedUpToKg} kg: the fixed charge.</li>
              <li>Above {t.fixedUpToKg} kg: the fixed charge + (billable weight − {t.fixedUpToKg}, rounded up to a whole kg) × the per-KG charge.</li>
              <li>Billable weight = each product’s packed weight × quantity, plus the packaging weight (once per parcel). Set product weights under Products.</li>
            </ul>
            {examples.rows.length > 0 && (
              <div className="overflow-x-auto"><table className="text-left text-xs"><thead><tr><th className="pr-6 pb-1">Billable weight</th>{examples.rows.map((x) => <th key={x.kg} className="pr-4 pb-1 font-normal">{x.kg} kg</th>)}</tr></thead>
                <tbody><tr><td className="pr-6 font-medium">Charge</td>{examples.rows.map((x) => <td key={x.kg} className="pr-4">{pkr(x.charge)}</td>)}</tr></tbody></table></div>
            )}
            <p className="text-xs opacity-60">Examples use the last SAVED charges and are produced by the same calculation checkout uses.</p>
          </div>
        </Section>

        <Section title="Combining USD prices with PKR shipping">
          <p className="text-xs opacity-70">Product prices are in {data.storeCurrency} and shipping is charged in PKR. To show customers ONE order total, enter how many PKR equal 1 {data.storeCurrency}; the shipping charge is converted (rounded up to the next cent) for the total only. Leave blank if you don’t want to set a rate: checkout then shows the subtotal and the PKR shipping charge separately, without a combined total. Free Shipping needs no rate.</p>
          <Field label={`PKR per 1 ${data.storeCurrency} (optional)`} error={errs.pkrPerUsd}>
            <input className="field !w-40" type="number" inputMode="decimal" min="0" step="0.0001" value={f.pkrPerUsd} onChange={(e) => set("pkrPerUsd", e.target.value)} placeholder="not set" />
          </Field>
        </Section>
      </fieldset>
      {editable && (
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-base-300 bg-base-100 py-4">
          <button className="btn-khan" disabled={busy || !dirty}>{busy ? "Saving…" : "Save domestic settings"}</button>
          {dirty && !busy && <span className="text-xs opacity-60">You have unsaved changes.</span>}
        </div>
      )}
    </form>
  );
}

// ---------- International settings (Free Shipping + packaging weight), independent of the domestic ones ----------
function InternationalSettings({ data, editable }) {
  const toForm = (i) => ({ freeShipping: i.freeShipping, packagingWeightKg: String(i.packagingWeightKg ?? 0) });
  const [f, setF] = useState(() => toForm(data.international));
  const [saved, setSaved] = useState(f);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errs, setErrs] = useState({});
  const set = (k, v) => { setMsg(null); setErrs({}); setF((s) => ({ ...s, [k]: v })); };
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); setErrs({});
    try {
      const { data: d } = await A.put("/shipping/international-settings", { freeShipping: f.freeShipping, packagingWeightKg: f.packagingWeightKg === "" ? 0 : Number(f.packagingWeightKg) });
      const next = toForm(d.international); setF(next); setSaved(next);
      setMsg({ tone: "success", text: "Saved." });
    } catch (e2) { setErrs(fieldErrors(e2)); setMsg({ tone: "error", text: e2.details?.length ? "Please check the highlighted fields." : e2.message }); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <fieldset disabled={!editable || busy} className="space-y-4">
        <div>
          <Check label="Enable Free Shipping for international orders" checked={f.freeShipping} onChange={(v) => set("freeShipping", v)} />
          {errs.freeShipping && <span className="mt-1 block text-xs text-error">{errs.freeShipping}</span>}
          <p className="mt-1 text-xs opacity-60">Applies only to the destinations below that are enabled and fully priced. It never opens a destination you haven’t configured, and it doesn’t affect domestic orders.</p>
          {f.freeShipping && <Notice className="mt-2">Free Shipping is ON for international orders: they ship for PKR 0 and checkout shows “Free Shipping”. The destination rates below are saved but not used while it is on.</Notice>}
        </div>
        <Field label="Packaging weight per parcel (kg)" error={errs.packagingWeightKg} hint="Added once to every international parcel before it is rounded up to whole kilograms. Enter 0 for none.">
          <input className="field !w-40" type="number" inputMode="decimal" min="0" step="0.001" value={f.packagingWeightKg} onChange={(e) => set("packagingWeightKg", e.target.value)} />
        </Field>
      </fieldset>
      {editable && <button className="btn-khan !py-2 !text-xs" disabled={busy || !dirty}>{busy ? "Saving…" : "Save international settings"}</button>}
    </form>
  );
}

// ---------- International destination form (add + edit) ----------
function DestinationForm({ initial, countries, data, onDone, onCancel }) {
  const money = (v) => (v == null ? "" : String(v));
  const [f, setF] = useState(() => ({
    countryCode: initial?.countryCode || "", city: initial?.city || "", displayName: initial?.displayName || "",
    courier: initial?.courier || "NLS Xpress International", pricingMethod: initial?.pricingMethod || data.pricingMethods[0].value,
    firstKgPrice: money(initial?.firstKgPrice), additionalKgPrice: money(initial?.additionalKgPrice), flatRateOver20Kg: money(initial?.flatRateOver20Kg),
    currency: initial?.currency || "PKR", deliveryEstimate: initial?.deliveryEstimate || "", enabled: initial ? initial.enabled : true,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const errs = fieldErrors(err);
  const set = (k, v) => { setErr(null); setF((s) => ({ ...s, [k]: v })); };
  const over = data.internationalRule.flatOverKg;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    const body = {
      countryCode: f.countryCode, city: f.city.trim(), displayName: f.displayName.trim(), courier: f.courier.trim(), pricingMethod: f.pricingMethod,
      firstKgPrice: num(f.firstKgPrice), additionalKgPrice: num(f.additionalKgPrice), flatRateOver20Kg: num(f.flatRateOver20Kg),
      currency: f.currency, deliveryEstimate: f.deliveryEstimate.trim(), enabled: f.enabled,
    };
    try { initial ? await A.patch(`/shipping/destinations/${initial.id}`, body) : await A.post("/shipping/destinations", body); onDone(); }
    catch (e2) { setErr(e2); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {err && <Notice tone="error">{err.code === "DESTINATION_EXISTS" ? err.message : err.details?.length ? "Please check the highlighted fields." : err.message}</Notice>}
      <CountrySelect label="Country" countries={countries} value={f.countryCode} onChange={(c) => set("countryCode", c)} error={errs.countryCode} required />
      <Field label="City / area (optional)" error={errs.city} hint="Leave blank to serve the whole country. Enter a city (e.g. Dubai) to serve only that city; other cities in the same country stay unavailable until you add them.">
        <input className="field" value={f.city} maxLength={80} onChange={(e) => set("city", e.target.value)} placeholder="Dubai" />
      </Field>
      <Field label="Destination display name (optional)" error={errs.displayName} hint="Shown to customers, e.g. “Dubai, UAE”. Blank = generated from the city and country.">
        <input className="field" value={f.displayName} maxLength={80} onChange={(e) => set("displayName", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Shipping method name" error={errs.courier}><input className="field" value={f.courier} maxLength={80} onChange={(e) => set("courier", e.target.value)} /></Field>
        <Field label="Pricing method" error={errs.pricingMethod}>
          <select className="field" value={f.pricingMethod} onChange={(e) => set("pricingMethod", e.target.value)}>{data.pricingMethods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        </Field>
      </div>
      <fieldset className="space-y-3 border border-base-300 p-4">
        <legend className="eyebrow px-1">Rates for this destination</legend>
        <p className="text-xs opacity-70">Enter the amounts yourself. A destination is only offered at checkout once all three are filled in.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`First KG price (${f.currency})`} error={errs.firstKgPrice}><input className="field" type="number" inputMode="decimal" min="0" step="0.01" value={f.firstKgPrice} onChange={(e) => set("firstKgPrice", e.target.value)} /></Field>
          <Field label={`Additional KG price (${f.currency})`} error={errs.additionalKgPrice}><input className="field" type="number" inputMode="decimal" min="0" step="0.01" value={f.additionalKgPrice} onChange={(e) => set("additionalKgPrice", e.target.value)} /></Field>
          <Field label={`Flat Rate for shipments over ${over} KG (${f.currency})`} error={errs.flatRateOver20Kg}><input className="field" type="number" inputMode="decimal" min="0" step="0.01" value={f.flatRateOver20Kg} onChange={(e) => set("flatRateOver20Kg", e.target.value)} /></Field>
        </div>
        <p className="text-xs opacity-60">Up to and including {over} KG: first KG price + additional KG price × each further kilogram (weight is rounded up to a whole kilogram, so 0.5 KG = 1 KG and 2.2 KG = 3 KG). Over {over} KG: the flat rate is the whole charge, with nothing added on top.</p>
      </fieldset>
      <Field label="Currency" error={errs.currency}>
        <select className="field !w-40" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      <Field label="Delivery estimate (optional)" error={errs.deliveryEstimate} hint="Saved with the shipping method exactly as written, e.g. “4-5 working days”.">
        <input className="field" value={f.deliveryEstimate} maxLength={80} onChange={(e) => set("deliveryEstimate", e.target.value)} />
      </Field>
      <Check label="Enabled (offered at checkout once all rates are filled in)" checked={f.enabled} onChange={(v) => set("enabled", v)} />
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className={btnSm} onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn-khan !py-2 !text-xs" disabled={busy}>{busy ? "Saving…" : initial ? "Save destination" : "Add destination"}</button>
      </div>
    </form>
  );
}

// ---------- Page ----------
export default function Shipping() {
  const user = useAdminAuth((s) => s.user);
  const editable = can(user, "shipping.edit");
  const [tick, reload] = useReload();
  const { data: res, loading, error } = useAsync(() => A.get("/shipping"), [tick]);
  const countries = useAsync(getCountries, []);
  const [editing, setEditing] = useState(null);   // null | "new" | destination
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  if (loading && !res) return <Loading />;
  if (error) return <Notice tone="error">Could not load shipping settings. {error.message}</Notice>;
  const data = res.data;
  const rows = data.destinations;

  const toggle = async (d) => {
    setErr(""); setNote("");
    try { await A.patch(`/shipping/destinations/${d.id}`, { enabled: !d.enabled }); setNote(`${d.displayName} ${d.enabled ? "disabled" : "enabled"}.`); reload(); }
    catch (e) { setErr(e.message); }
  };
  const remove = async () => {
    setBusy(true); setErr("");
    try { await A.del(`/shipping/destinations/${toDelete.id}`); setNote(`${toDelete.displayName} deleted.`); setToDelete(null); reload(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Shipping" subtitle="NLS Xpress rates and delivery estimates. Couriers are handled manually: nothing here books a parcel or tracks one." />
      {!editable && <Notice tone="error" className="mb-4">You can view these settings but not change them.</Notice>}

      <DomesticSettings data={data} editable={editable} />

      <section className="mt-8 space-y-5 border border-base-300 p-5">
        <div>
          <h2 className="font-display text-2xl">International shipping</h2>
          <p className="mt-1 text-xs opacity-70">These settings apply only to orders shipped outside Pakistan, and are independent of the domestic settings above.</p>
        </div>
        <InternationalSettings data={data} editable={editable} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-5">
          <div><h3 className="font-display text-xl">Destinations and rates</h3><p className="mt-1 text-xs opacity-70">Only destinations listed here, enabled and fully priced can be chosen at checkout. Anywhere else shows “international shipping is currently unavailable”.</p></div>
          {editable && <button className="btn-khan !py-2 !text-xs" onClick={() => { setErr(""); setNote(""); setEditing("new"); }}><Plus size={14} /> Add destination</button>}
        </div>
        {note && <Notice tone="success">{note}</Notice>}
        {err && !toDelete && !editing && <Notice tone="error">{err}</Notice>}
        {!rows.length ? <Notice>No international destinations are configured, so international shipping is unavailable.</Notice> : (
          <div className="overflow-x-auto border border-base-300">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-base-300 bg-base-200 text-xs uppercase tracking-wider"><tr><th className="p-3">Destination</th><th className="p-3">Method</th><th className="p-3">First KG</th><th className="p-3">Additional KG</th><th className="p-3">Over {data.internationalRule.flatOverKg} KG flat</th><th className="p-3">Delivery estimate</th><th className="p-3">Status</th>{editable && <th className="p-3 text-right">Actions</th>}</tr></thead>
              <tbody className="divide-y divide-base-300">
                {rows.map((d) => (
                  <tr key={d.id} className={d.enabled ? "" : "opacity-70"}>
                    <td className="p-3"><p className="font-medium">{d.displayName}</p><p className="text-xs opacity-60">{d.countryName}{d.city ? ` · ${d.city} only` : " · whole country"}</p></td>
                    <td className="p-3">{d.courier}</td>
                    {["firstKgPrice", "additionalKgPrice", "flatRateOver20Kg"].map((k) => (
                      <td key={k} className="p-3 whitespace-nowrap">{d.rateIssues.includes(k) ? <span className="text-error">Missing</span> : formatAmount(d[k], d.currency)}</td>
                    ))}
                    <td className="p-3">{d.deliveryEstimate || <span className="opacity-60">Not set</span>}</td>
                    <td className="p-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={d.enabled ? "green" : "grey"}>{d.enabled ? "Enabled" : "Disabled"}</Badge>
                        {!d.complete && <Badge tone="amber">Incomplete: not offered</Badge>}
                      </div>
                      {!d.complete && d.legacyFixedPrice != null && <p className="mt-1 text-xs opacity-60">Previous fixed price: {formatAmount(d.legacyFixedPrice, d.currency)} (no longer used)</p>}
                    </td>
                    {editable && <td className="p-3"><div className="flex justify-end gap-2">
                      <button className={btnSm} onClick={() => toggle(d)}>{d.enabled ? "Disable" : "Enable"}</button>
                      <button className={btnSm} onClick={() => { setErr(""); setNote(""); setEditing(d); }} aria-label={`Edit ${d.displayName}`}><Pencil size={14} /></button>
                      <button className={`${btnSm} !border-error !text-error`} onClick={() => { setErr(""); setNote(""); setToDelete(d); }} aria-label={`Delete ${d.displayName}`}><Trash2 size={14} /></button>
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={!!editing} title={editing === "new" ? "Add destination" : "Edit destination"} onClose={() => setEditing(null)}>
        {editing && (countries.error ? <Notice tone="error">Could not load the country list. {countries.error.message}</Notice> : countries.loading ? <Loading /> : (
          <DestinationForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} countries={countries.data} data={data}
            onCancel={() => setEditing(null)} onDone={() => { setNote(editing === "new" ? "Destination added." : "Destination saved."); setEditing(null); reload(); }} />
        ))}
      </Modal>
      <Confirm open={!!toDelete} title="Delete destination?" busy={busy} error={toDelete ? err : ""} confirmLabel="Delete destination"
        message={toDelete ? `${toDelete.displayName} will be permanently removed and customers will no longer be able to ship there. Existing orders keep the shipping details saved with them. To pause it instead, use Disable.` : ""}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
