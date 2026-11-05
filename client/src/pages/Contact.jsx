import { useRef, useState } from "react";
import { useTitle } from "../hooks/useAsync.js";
import { sendContactMessage } from "../services/contact.js";

const EMAIL = "parentofkhan.contact@gmail.com";
const EMPTY = { name: "", email: "", subject: "", message: "", website: "" };

function F({ name, label, type = "text", area, autoComplete, max, value, onChange, error }) {
  return (
    <div>
      <label htmlFor={name} className="eyebrow mb-2 block">{label}</label>
      {area
        ? <textarea id={name} name={name} rows={6} maxLength={max} value={value} onChange={onChange} className="field" aria-invalid={!!error} aria-describedby={`${name}-e`} />
        : <input id={name} name={name} type={type} maxLength={max} autoComplete={autoComplete} value={value} onChange={onChange} className="field" aria-invalid={!!error} aria-describedby={`${name}-e`} />}
      <p id={`${name}-e`} className="mt-1 min-h-4 text-xs text-error">{error}</p>
    </div>
  );
}

export default function Contact() {
  useTitle("Contact");
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState("");
  const inFlight = useRef(false);
  const set = (k) => (e) => { setV((s) => ({ ...s, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    const er = {};
    if (v.name.trim().length < 2) er.name = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) er.email = "Please enter a valid email.";
    if (!v.subject.trim()) er.subject = "Please add a subject.";
    if (v.message.trim().length < 10) er.message = "Message should be at least 10 characters.";
    setErrors(er); setProblem("");
    if (Object.keys(er).length) return;
    inFlight.current = true; setBusy(true);
    try {
      await sendContactMessage(v); // resolves only once the message is saved on the server
      setSent(true); setV(EMPTY);
    } catch (err) {
      if (err?.code === "VALIDATION_ERROR" && Array.isArray(err.details)) setErrors(Object.fromEntries(err.details.filter((d) => d.path).map((d) => [d.path, d.message])));
      setProblem(err?.code === "VALIDATION_ERROR" ? "Please check the highlighted fields." : `${err?.message || "Something went wrong."} Your message was not sent. You can try again, or email us at ${EMAIL}.`);
    } finally { inFlight.current = false; setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-5xl md:text-6xl">Contact</h1>
      <p className="mt-4 text-sm opacity-70">Questions about an order, sizing or anything else? Send us a message and we’ll reply by email. You can also write to <a href={`mailto:${EMAIL}`} className="link-u">{EMAIL}</a>.</p>
      {sent ? (
        <div role="status" className="mt-8 space-y-3 border border-base-300 p-6">
          <p className="font-display text-2xl">Message sent</p>
          <p className="text-sm opacity-70">Thank you. We’ve received your message and will reply to the email address you gave us.</p>
          <button type="button" className="link-u text-sm" onClick={() => setSent(false)}>Send another message</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-8 space-y-3" aria-busy={busy}>
          <F name="name" label="Name" autoComplete="name" max={100} value={v.name} onChange={set("name")} error={errors.name} />
          <F name="email" label="Email" type="email" autoComplete="email" max={254} value={v.email} onChange={set("email")} error={errors.email} />
          <F name="subject" label="Subject" max={150} value={v.subject} onChange={set("subject")} error={errors.subject} />
          <F name="message" label="Message" area max={5000} value={v.message} onChange={set("message")} error={errors.message} />
          {/* Hidden trap for bots: people never see or fill this in. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>Website <input name="website" tabIndex={-1} autoComplete="off" value={v.website} onChange={set("website")} /></label>
          </div>
          <button className="btn-khan" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
          {problem && <p role="alert" className="text-sm text-error">{problem}</p>}
        </form>
      )}
    </div>
  );
}
