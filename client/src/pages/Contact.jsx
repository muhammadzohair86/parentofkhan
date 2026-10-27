import { useState } from "react";
import { useTitle } from "../hooks/useAsync.js";

export default function Contact() {
  useTitle("Contact");
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const er = {};
    if (!d.name.trim()) er.name = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(d.email)) er.email = "Please enter a valid email.";
    if (!d.subject.trim()) er.subject = "Please add a subject.";
    if (d.message.trim().length < 10) er.message = "Message should be at least 10 characters.";
    setErrors(er);
    // Saving messages needs the Phase 2 backend; never claim it was sent.
    setNotice(Object.keys(er).length ? "" : "The contact form is not connected yet — your message was not sent.");
  };
  const F = ({ name, label, type = "text", area }) => (
    <div>
      <label htmlFor={name} className="eyebrow mb-2 block">{label}</label>
      {area ? <textarea id={name} name={name} rows={6} className="field" aria-invalid={!!errors[name]} aria-describedby={`${name}-e`} />
            : <input id={name} name={name} type={type} className="field" aria-invalid={!!errors[name]} aria-describedby={`${name}-e`} />}
      <p id={`${name}-e`} className="mt-1 min-h-4 text-xs text-error">{errors[name]}</p>
    </div>
  );
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-5xl md:text-6xl">Contact</h1>
      <form onSubmit={submit} noValidate className="mt-8 space-y-3">
        <F name="name" label="Name" /><F name="email" label="Email" type="email" /><F name="subject" label="Subject" /><F name="message" label="Message" area />
        <button className="btn-khan">Send message</button>
        <p role="status" className="min-h-5 text-sm text-error">{notice}</p>
      </form>
    </div>
  );
}
