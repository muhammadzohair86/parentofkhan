import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CartLines from "../components/CartLines.jsx";
import CountrySelect from "../components/CountrySelect.jsx";
import { useCart, cartSubtotal } from "../store/useCart.js";
import { useTitle } from "../hooks/useAsync.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { getShippingOptions, quoteCheckout } from "../services/shipping.js";
import { getPaymentConfig, startPayment, newCheckoutToken, isSafepayUrl } from "../services/payments.js";
import { rememberOrder } from "../lib/recentOrders.js";
import { money, formatAmount, pkr } from "../lib.js";

// Checkout, shipping part only. The customer reviews the cart, picks a destination and address, and sees the courier, the
// shipping charge and the totals. EVERY figure comes from POST /api/checkout/quote: the server prices the cart from the
// database and calculates shipping itself (including Free Shipping). There is no payment step and no order is created here.
//
// Destinations are not hardcoded: the country list is built from GET /api/shipping/options, i.e. the domestic service (if enabled)
// plus the international destinations an admin has enabled and priced. A quote is only requested once the destination is complete
// (a country that exists in that list and, where the service area is city-specific, a configured city), so incomplete states never
// reach the server.

const blank = { line1: "", line2: "", city: "", region: "", postalCode: "" };
const sameCity = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function TextField({ label, hint, error, ...props }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      <input className="field" aria-invalid={!!error} {...props} />
      {error ? <span role="alert" className="mt-1 block text-xs text-error">{error}</span> : hint && <span className="mt-1 block text-xs opacity-60">{hint}</span>}
    </label>
  );
}

function ShippingBlock({ q, idle, onRetry }) {
  if (q.status === "idle") return <p role="status" className="text-sm opacity-60">{idle}</p>;
  if (q.status === "loading" && !q.data) return <p role="status" className="text-sm opacity-70">Calculating shipping…</p>;
  if (q.status === "error") {
    const soft = q.error?.code === "SHIPPING_UNAVAILABLE"; // an unserviceable destination is information, not a malfunction
    const retryable = !q.error?.status || q.error.status >= 500;
    return (
      <div role={soft ? "status" : "alert"} className={`border p-3 text-sm ${soft ? "border-base-300" : "border-error text-error"}`}>
        <p>{q.error?.message || "Shipping could not be calculated right now."}</p>
        {q.error?.details?.length > 0 && q.error.code === "CART_INVALID" && <ul className="mt-2 list-disc pl-5">{q.error.details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}
        {retryable && <button type="button" className="link-u mt-2" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  const s = q.data.shipping;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{s.courier} — {s.freeShipping ? "Free Shipping" : formatAmount(s.amount, s.currency)}</p>
      <p className="opacity-70">To {s.destinationName}</p>
    </div>
  );
}

function Totals({ q, fallbackSubtotal }) {
  const d = q.data;
  const subtotal = d ? d.subtotal : fallbackSubtotal;
  return (
    <div className="space-y-3 border-t border-base-300 pt-4">
      <div className="flex items-baseline justify-between"><span className="eyebrow">Subtotal (USD)</span><span>{money(subtotal)}</span></div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Shipping</span>
        <span>{d ? (d.shipping.freeShipping ? "Free Shipping" : formatAmount(d.shipping.amount, d.shipping.currency)) : "—"}</span>
      </div>
      <div className="flex items-baseline justify-between border-t border-base-300 pt-3">
        <span className="eyebrow">Total</span>
        {d && d.total != null ? <span className="font-display text-3xl">{money(d.total)}</span>
          : d ? <span className="text-right text-sm">{money(d.subtotal)} + {pkr(d.shipping.amount)}</span>
          : <span className="text-sm opacity-60">Once shipping is calculated</span>}
      </div>
    </div>
  );
}

export default function Checkout() {
  useTitle("Checkout");
  const items = useCart((s) => s.items);
  const cartTotal = useCart(cartSubtotal);
  const live = useMemo(() => items.filter((i) => !i.unavailable), [items]); // lines flagged "no longer available" are never priced

  // ---- destinations: straight from the admin configuration ----
  const [opts, setOpts] = useState({ status: "loading", data: null, error: null });
  const loadOptions = useCallback(() => getShippingOptions().then(
    (data) => setOpts({ status: "ready", data, error: null }),
    (error) => setOpts((s) => (s.data ? s : { status: "error", data: null, error })), // keep what we already have if a refresh fails
  ), []);
  useEffect(() => {
    loadOptions();
    window.addEventListener("focus", loadOptions); // pick up admin changes (a destination added/disabled/removed) when the customer returns to the tab
    return () => window.removeEventListener("focus", loadOptions);
  }, [loadOptions]);

  const countryOptions = useMemo(() => {
    if (!opts.data) return [];
    const byCode = new Map();
    const dom = opts.data.domestic;
    if (dom.enabled) byCode.set(dom.countryCode, { code: dom.countryCode, name: dom.countryName });
    for (const d of opts.data.international) if (!byCode.has(d.countryCode)) byCode.set(d.countryCode, { code: d.countryCode, name: d.countryName });
    return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [opts.data]);
  const names = useRef(new Map()); // remembers country names so we can say which one disappeared
  countryOptions.forEach((c) => names.current.set(c.code, c.name));

  const [country, setCountry] = useState("");
  const [a, setA] = useState(blank);
  const [notice, setNotice] = useState("");

  // ---- online payment (Safepay) ----
  const navigate = useNavigate();
  // Availability, from the server: { status: "loading" } | { status: "ready", enabled, testMode, reason, diagnostics? } | { status: "error" }.
  // A FAILED check is "unknown", never "unavailable": it must not keep the button off. It is re-checked on demand and whenever the tab regains focus,
  // so fixing the server (e.g. restarting the API after editing .env) needs no page reload. The server has the final say when Pay is pressed.
  const [payCfg, setPayCfg] = useState({ status: "loading" });
  const loadPayCfg = useCallback(() => getPaymentConfig().then(
    (c) => setPayCfg({ status: "ready", ...c }),
    () => setPayCfg((s) => (s.status === "ready" ? s : { status: "error" })), // keep a known answer if a refresh fails
  ), []);
  useEffect(() => {
    loadPayCfg();
    window.addEventListener("focus", loadPayCfg);
    return () => window.removeEventListener("focus", loadPayCfg);
  }, [loadPayCfg]);
  const payOff = payCfg.status === "ready" && !payCfg.enabled;       // the ONLY availability state that disables Pay: the server said so
  const inFlight = useRef(false);                                    // a ref (not state) so two rapid clicks can't both slip through before a re-render
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const setC = (k, v) => setCustomer((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [fieldErrs, setFieldErrs] = useState({});
  const sent = useRef({ fp: "", token: "" });                       // same details => same token => the server returns the same order (no duplicates)
  const set = (k, v) => setA((s) => ({ ...s, [k]: v }));
  const pickCountry = (code) => { setNotice(""); setCountry(code); set("city", ""); };

  useEffect(() => {
    if (!opts.data) return;
    if (country && !countryOptions.some((c) => c.code === country)) { // the admin disabled/removed it while the customer was on this page
      setNotice(`${names.current.get(country) || "That country"} is no longer available for shipping. Please choose another country.`);
      setCountry(""); set("city", "");
    } else if (!country && !notice && countryOptions.length) setCountry(countryOptions[0].code);
  }, [opts.data, countryOptions, country, notice]);

  const dom = opts.data?.domestic;
  const isDomestic = !!dom && country === dom.countryCode;
  const areas = useMemo(() => (!country || isDomestic ? [] : (opts.data?.international || []).filter((d) => d.countryCode === country)), [opts.data, country, isDomestic]);
  const cityScoped = areas.length > 0 && areas.every((d) => d.city);           // only specific cities are served: the customer must pick one
  const cities = areas.filter((d) => d.city).map((d) => d.city);
  useEffect(() => { if (cityScoped && a.city && !cities.some((c) => c === a.city)) set("city", ""); }, [cityScoped, cities.join("|")]); // a configured city that vanished

  // Is there enough to ask the server for a price? Never before this: that is what used to produce the repeated 422s.
  const ready = !!opts.data && !!country && live.length > 0 && (isDomestic || (areas.length > 0 && (!cityScoped || cities.some((c) => sameCity(c, a.city)))));
  const idle = !opts.data ? "Loading shipping options…"
    : !countryOptions.length ? "Shipping isn’t available right now."
    : !country ? "Choose a country to see shipping."
    : cityScoped && !a.city ? "Select your city to see shipping."
    : live.length === 0 ? "Add an available item to see shipping." : "Choose where to ship and shipping will be calculated here.";

  // What is sent for pricing: only WHAT is bought and WHERE it goes. Debounced so quick changes collapse into one request.
  const rawKey = ready ? JSON.stringify({ l: live.map((i) => [i.productId, i.color, i.size, i.qty]), c: country, t: isDomestic ? "" : a.city.trim() }) : null;
  const debounced = useDebounce(rawKey, 350);
  const key = rawKey && debounced === rawKey ? rawKey : null; // null while the form is incomplete or still settling
  const [retry, setRetry] = useState(0);
  const [q, setQ] = useState({ status: "idle", data: null, error: null });
  useEffect(() => { if (!ready) setQ({ status: "idle", data: null, error: null }); }, [ready]);
  useEffect(() => {
    if (!key) return undefined;
    const { l, c, t } = JSON.parse(key);
    const ctl = new AbortController(); // a newer selection cancels this request, so a late reply can never overwrite a newer one
    setQ((s) => ({ ...s, status: "loading", error: null })); // keep the previous figures on screen (dimmed) while refreshing
    quoteCheckout(l.map(([productId, color, size, qty]) => ({ productId, color, size, qty })), { country: c, city: t }, ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setQ({ status: "ok", data, error: null }); },
      (error) => {
        if (ctl.signal.aborted || error?.name === "AbortError") return;
        setQ({ status: "error", data: null, error });
        if (error?.code === "SHIPPING_UNAVAILABLE") loadOptions(); // the configuration changed under us: refresh the destination list
      },
    );
    return () => ctl.abort();
  }, [key, retry, loadOptions]);

  const quotePending = ready && (key === null || q.status === "loading");   // a shipping quote for the current selection is still on its way
  const canPay = !payOff && q.status === "ok" && q.data?.total != null && live.length > 0 && !(ready && key === null);
  // Why Pay is off, in words (shown under the button). null when it is on or while a payment is being started.
  const whyOff = canPay || busy ? null
    : payOff ? "off"
    : live.length === 0 ? "Add an available item to your cart to pay."
    : !ready ? (idle || "Choose where to ship so we can calculate shipping.")
    : quotePending ? "Calculating shipping…"
    : q.status === "error" ? "Shipping couldn’t be calculated for this destination. See the shipping method above."
    : q.data?.total == null ? "We can’t take payment for this order yet. Please contact us."
    : "Complete the details above to continue.";
  const pay = async () => {
    if (inFlight.current || busy || !canPay) return;
    const errs = {};
    if (customer.name.trim().length < 2) errs["customer.name"] = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email.trim())) errs["customer.email"] = "Enter a valid email address.";
    if (a.line1.trim().length < 3) errs["address.line1"] = "Enter your address.";
    if (a.city.trim().length < 2) errs["address.city"] = "Enter your city.";
    setFieldErrs(errs);
    if (Object.keys(errs).length) { setPayError("Please complete the highlighted fields."); return; }
    inFlight.current = true; setBusy(true); setPayError("");
    const body = {
      items: live.map((i) => ({ productId: i.productId, color: i.color, size: i.size, quantity: i.qty })), country,
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      address: { line1: a.line1, line2: a.line2, city: a.city, region: a.region, postalCode: a.postalCode },
    };
    const fp = JSON.stringify(body);
    if (sent.current.fp !== fp) sent.current = { fp, token: newCheckoutToken() }; // changed details = a new checkout; unchanged = the SAME one (idempotent)
    try {
      const r = await startPayment({ ...body, clientRequestId: sent.current.token,
        submitted: { shippingAmount: q.data.shipping.amount, subtotal: q.data.subtotal, total: q.data.total } }); // the amounts shown here: the server refuses them if they differ from its own
      rememberOrder(r.orderNumber, sent.current.token); // so "Track Order" can reopen it later, on this device
      if (r.status === "paid") { navigate(`/order/${r.orderNumber}/${sent.current.token}`); return; }
      if (!isSafepayUrl(r.redirectUrl)) throw new Error("Unexpected payment response");
      window.location.assign(r.redirectUrl); // stay "busy" while the browser leaves for Safepay
    } catch (e) {
      inFlight.current = false; setBusy(false);
      if (e?.code === "VALIDATION_ERROR" && Array.isArray(e.details)) {
        setFieldErrs(Object.fromEntries(e.details.filter((d) => d.path).map((d) => [d.path, d.message])));
        setPayError("Please check the highlighted fields.");
      } else if (e?.code === "TOTALS_MISMATCH") { setPayError("The shipping charge or total changed. We've refreshed your order: please check the new total and press Pay again."); setRetry((n) => n + 1); }
      else if (e?.code === "PAYMENT_IN_PROGRESS") setPayError("Your payment is already being set up. Please wait a moment, then press Pay again.");
      else if (e?.code === "PAYMENTS_UNAVAILABLE") { setPayError(e.message); loadPayCfg(); } // the server says payments are off: refresh what we show
      else if (["PAYMENT_PROVIDER_ERROR", "PAYMENT_SETUP_ERROR"].includes(e?.code)) setPayError([e.message, e.details?.[0]?.message].filter(Boolean).join(" ")); // details only exist in development
      else if (e?.status && e.status < 500 && e.message) setPayError(e.message);
      else setPayError("We couldn't start the payment. Nothing was charged. Please try again in a moment.");
    }
  };

  if (!items.length) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-12 lg:px-10">
        <h1 className="font-display text-5xl md:text-6xl">Checkout</h1>
        <div className="py-16 text-center"><p className="font-display text-3xl">Your cart is empty.</p><Link to="/shop" className="btn-khan mt-6">Browse the shop</Link></div>
      </div>
    );
  }

  const settling = ready && (key === null || q.status === "loading") && !!q.data;
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:px-10">
      <h1 className="font-display text-5xl md:text-6xl">Checkout</h1>
      <div className="mt-8 grid gap-12 md:grid-cols-[1.6fr_1fr]">
        <div className="space-y-12">
          <section aria-labelledby="co-items">
            <h2 id="co-items" className="eyebrow mb-2">Your items</h2>
            <CartLines />
            {live.length === 0 && <p role="alert" className="mt-3 text-sm text-error">None of the items in your cart are available any more. Remove them to continue.</p>}
            <Link to="/cart" className="link-u mt-3 inline-block text-sm">Back to cart</Link>
          </section>

          <section aria-labelledby="co-contact">
            <h2 id="co-contact" className="eyebrow mb-4">Contact</h2>
            <div className="space-y-4">
              <TextField label="Full name" autoComplete="name" value={customer.name} maxLength={80} error={fieldErrs["customer.name"]} onChange={(e) => setC("name", e.target.value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Email" type="email" autoComplete="email" value={customer.email} maxLength={120} error={fieldErrs["customer.email"]} onChange={(e) => setC("email", e.target.value)} />
                <TextField label="Phone (optional)" type="tel" autoComplete="tel" value={customer.phone} maxLength={20} error={fieldErrs["customer.phone"]} onChange={(e) => setC("phone", e.target.value)} />
              </div>
            </div>
          </section>

          <section aria-labelledby="co-address">
            <h2 id="co-address" className="eyebrow mb-4">Shipping address</h2>
            <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
              {notice && <p role="alert" className="border border-error p-3 text-sm text-error">{notice}</p>}
              {opts.status === "error" ? (
                <p role="alert" className="text-sm text-error">Could not load shipping destinations. {opts.error.message} <button type="button" className="link-u" onClick={loadOptions}>Try again</button></p>
              ) : !opts.data ? (
                <p role="status" className="text-sm opacity-60">Loading shipping destinations…</p>
              ) : !countryOptions.length ? (
                <p role="status" className="text-sm">Shipping isn’t available right now. Please check back soon.</p>
              ) : (
                <CountrySelect label="Country" countries={countryOptions} value={country} onChange={pickCountry} required />
              )}
              <TextField label="Address" autoComplete="address-line1" value={a.line1} maxLength={120} error={fieldErrs["address.line1"]} onChange={(e) => set("line1", e.target.value)} />
              <TextField label="Apartment, suite, etc. (optional)" autoComplete="address-line2" value={a.line2} maxLength={120} onChange={(e) => set("line2", e.target.value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                {cityScoped ? (
                  <label className="block">
                    <span className="eyebrow mb-2 block">City</span>
                    <select className="field" autoComplete="address-level2" value={a.city} onChange={(e) => set("city", e.target.value)}>
                      <option value="">Select a city</option>
                      {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="mt-1 block text-xs opacity-60">We currently deliver to the cities listed here.</span>
                  </label>
                ) : (
                  <label className="block">
                    <span className="eyebrow mb-2 block">City</span>
                    <input className="field" autoComplete="address-level2" list={cities.length ? "co-cities" : undefined} value={a.city} maxLength={80} onChange={(e) => set("city", e.target.value)} />
                    {fieldErrs["address.city"] && <span role="alert" className="mt-1 block text-xs text-error">{fieldErrs["address.city"]}</span>}
                    {cities.length > 0 && <datalist id="co-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>}
                  </label>
                )}
                <TextField label="State / region (optional)" autoComplete="address-level1" value={a.region} maxLength={80} onChange={(e) => set("region", e.target.value)} />
              </div>
              <div className="sm:w-1/2 sm:pr-2"><TextField label="Postal code (optional)" autoComplete="postal-code" value={a.postalCode} maxLength={20} onChange={(e) => set("postalCode", e.target.value)} /></div>
            </form>
          </section>
        </div>

        <aside className="self-start space-y-6 border border-base-300 p-6" aria-label="Order summary">
          <div>
            <h2 className="eyebrow mb-3">Shipping method</h2>
            <div className={settling ? "opacity-50" : ""} aria-busy={settling}><ShippingBlock q={q} idle={idle} onRetry={() => setRetry((n) => n + 1)} /></div>
          </div>
          <div className={settling ? "opacity-50" : ""}><Totals q={q} fallbackSubtotal={cartTotal} /></div>
          <div className="space-y-3">
            <h2 className="eyebrow">Payment</h2>
            <div className="border border-base-300 p-3 text-sm">
              <p className="font-medium">Safepay: pay online by card</p>
              {payCfg?.testMode && <p className="mt-1 text-xs opacity-70">Test mode: payments use Safepay's sandbox. No real money is charged.</p>}
            </div>
            {payError && <p role="alert" className="border border-error p-3 text-sm text-error">{payError}</p>}
            {payOff && (
              <div role="status" className="space-y-2 border border-base-300 p-3 text-xs">
                <p>Online payment isn’t available right now. Please try again later.</p>
                {payCfg.diagnostics?.length > 0 && ( // only sent by a development server: names the exact setting to fix
                  <div className="opacity-80"><p className="font-medium">Developer note (development mode only):</p><ul className="list-disc pl-5">{payCfg.diagnostics.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
                )}
                <button type="button" className="link-u" onClick={loadPayCfg}>Check again</button>
              </div>
            )}
            {payCfg.status === "error" && <p role="status" className="text-xs opacity-70">We couldn’t check whether online payment is available. You can still try to pay. <button type="button" className="link-u" onClick={loadPayCfg}>Check again</button></p>}
            <button className="btn-khan w-full" disabled={!canPay || busy} onClick={pay} aria-busy={busy}>
              {busy ? "Opening Safepay…" : q.data?.total != null ? `Pay ${money(q.data.total)} with Safepay` : "Pay with Safepay"}
            </button>
            {whyOff && whyOff !== "off" && <p role="status" className="text-xs opacity-70">{whyOff}</p>}
            <p className="text-xs opacity-60">You’ll be taken to Safepay’s secure page to pay{q.data?.total != null ? ` ${money(q.data.total)} (USD)` : ""}. We never see your card details.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
