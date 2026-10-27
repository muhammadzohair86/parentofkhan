import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync.js";
import { getSettings, getFeatures, getPaymentMethods, subscribeNewsletter } from "../services/catalog.js";
import { featureIcon } from "./featureIcons.js";
import { useMediaQuery, usePageVisible } from "../hooks/overlay.js";

const links = [
  ["Contact", "/contact"],
  ["Terms & Conditions", "/policies/terms"],
  ["Privacy Policy", "/policies/privacy"],
  ["Refund Policy", "/policies/refund"],
  ["Shipping Policy", "/policies/shipping"],
];

function Newsletter() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return; // ignore double submits while a request is in flight
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setMsg({ type: "error", text: "Please enter a valid email address." });
    setBusy(true); setMsg(null);
    try {
      const status = await subscribeNewsletter(value);
      if (status === "already_subscribed") setMsg({ type: "info", text: "You're already subscribed. Thank you!" });
      else { setMsg({ type: "success", text: "Thanks for subscribing!" }); setEmail(""); }
    } catch (err) {
      setMsg({ type: "error", text: err.status === 400 ? "Please enter a valid email address." : err.message || "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="nl-email" className="eyebrow mb-3 block">Newsletter</label>
      <div className="flex">
        <input id="nl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} autoComplete="email"
          className="field !border-neutral-content/40 text-neutral-content placeholder:text-neutral-content/40 focus:!border-neutral-content focus:!shadow-none" aria-describedby="nl-msg nl-consent" />
        <button disabled={busy} aria-busy={busy} className="border border-neutral-content px-5 text-xs uppercase tracking-widest hover:bg-neutral-content hover:text-neutral disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Sending…" : "Subscribe"}</button>
      </div>
      <p id="nl-msg" role="status" className={`mt-2 min-h-5 text-xs ${msg?.type === "error" ? "text-[#ff9b86]" : ""}`}>{msg?.text}</p>
      <p id="nl-consent" className="mt-1 text-xs opacity-60">By subscribing you agree to receive occasional emails from Parent Of Khan. See our <Link to="/policies/privacy" className="underline">Privacy Policy</Link>.</p>
    </form>
  );
}

function FeatureCard({ f, className = "" }) {
  const Icon = featureIcon(f.icon);
  return (
    <li className={`flex items-start gap-4 ${className}`}>
      <Icon size={24} strokeWidth={1.5} className="mt-1 shrink-0 opacity-80" aria-hidden="true" />
      <div>
        <h3 className="font-display text-2xl leading-tight">{f.title}</h3>
        {f.description && <p className="mt-1 text-sm opacity-70">{f.description}</p>}
      </div>
    </li>
  );
}

// Up to three short quality notes, managed in the database (defaults apply until an admin edits them).
// Desktop: three columns. Mobile: the cards scroll by themselves in a seamless loop (no swiping needed).
// Reduced motion: no animation, the cards are simply stacked.
function FeatureBoxes() {
  const { data } = useAsync(getFeatures, []);
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const visible = usePageVisible();
  if (!data?.length) return null; // loading, failed, or none enabled: the footer simply starts with its normal content
  const items = data.slice(0, 3); // the server enforces the same cap; this is only a safety net
  const card = "border border-neutral-content/20 p-4";

  return (
    <section aria-label="About our clothing" className="border-b border-neutral-content/20">
      {/* Desktop (unchanged): three columns */}
      <ul className="mx-auto hidden max-w-[1600px] auto-cols-fr grid-flow-col divide-x divide-neutral-content/20 px-5 md:grid lg:px-10">
        {items.map((f) => <FeatureCard key={f.id} f={f} className="py-7 md:px-8 md:first:pl-0 md:last:pr-0" />)}
      </ul>

      {/* Mobile */}
      <div className="md:hidden">
        {reduce ? (
          <ul className="space-y-3 px-5 py-6">{items.map((f) => <FeatureCard key={f.id} f={f} className={card} />)}</ul>
        ) : (
          // The track holds two identical groups and slides left by exactly one group's width, then repeats:
          // that is what makes the loop seamless. The second group is hidden from assistive technology.
          <div className="overflow-hidden py-6">
            <div className="pok-marquee flex w-max" style={{ animationDuration: `${items.length * 9}s`, animationPlayState: visible ? "running" : "paused" }}>
              <ul className="flex shrink-0 gap-3 pr-3">{items.map((f) => <FeatureCard key={f.id} f={f} className={`${card} w-[78vw] max-w-xs shrink-0`} />)}</ul>
              <ul className="flex shrink-0 gap-3 pr-3" aria-hidden="true">{items.map((f) => <FeatureCard key={`dup-${f.id}`} f={f} className={`${card} w-[78vw] max-w-xs shrink-0`} />)}</ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PaymentLogo({ method }) {
  const [failed, setFailed] = useState(false);
  return (
    <li className="flex h-8 items-center bg-base-100 px-2 text-neutral" title={method.name}>
      {method.logoUrl && !failed
        ? <img src={method.logoUrl} alt={method.altText} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-5 w-auto max-w-[72px] object-contain" />
        : <span className="text-[0.65rem] font-medium uppercase tracking-wider">{method.name}</span>}
    </li>
  );
}

function PaymentMethods() {
  const { data } = useAsync(getPaymentMethods, []);
  if (!data?.length) return null;
  return <ul aria-label="Accepted payment methods" className="flex flex-wrap items-center gap-2">{data.map((m) => <PaymentLogo key={m.id} method={m} />)}</ul>;
}

export default function Footer() {
  const { data: settings } = useAsync(getSettings, []);
  return (
    <footer className="mt-28 bg-neutral text-neutral-content">
      <FeatureBoxes />
      <div className="mx-auto grid max-w-[1600px] gap-12 px-5 py-16 lg:grid-cols-[1.4fr_1fr_1.2fr] lg:px-10">
        <div>
          <p className="font-display text-4xl">Parent Of <span className="italic">Khan</span></p>
          <p className="mt-5 max-w-md text-sm leading-relaxed opacity-80">
            {/* TODO(owner): confirm or rewrite this brand copy. */}
            Parent Of Khan makes printed apparel from the internet jokes we grew up inside. Small runs, heavyweight cotton, no fuss.
          </p>
          <p className="mt-3 max-w-md text-sm opacity-60">Meme-inspired clothing for people who inherited the humour.</p>
        </div>
        <nav aria-label="Footer">
          <p className="eyebrow mb-4">Info</p>
          <ul className="space-y-2 text-sm">
            {links.map(([t, to]) => <li key={to}><Link to={to} className="link-u">{t}</Link></li>)}
          </ul>
          {settings?.socials?.length > 0 && (
            <ul className="mt-6 flex gap-4 text-sm">
              {settings.socials.map((s) => <li key={s.url}><a href={s.url} rel="noopener noreferrer" target="_blank" className="link-u">{s.label}</a></li>)}
            </ul>
          )}
        </nav>
        <Newsletter />
      </div>
      <div className="border-t border-neutral-content/20">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs opacity-70 lg:px-10">
          <p>© {new Date().getFullYear()} Parent Of Khan. All rights reserved.</p>
          <PaymentMethods />
        </div>
      </div>
    </footer>
  );
}
