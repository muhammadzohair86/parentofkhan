import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "./useAdminAuth.js";
import { Notice } from "./ui.jsx";

export default function Login() {
  const user = useAdminAuth((s) => s.user);
  const login = useAdminAuth((s) => s.login);
  const { state } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user) return <Navigate to={state?.from && state.from.startsWith("/admin") ? state.from : "/admin"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const d = Object.fromEntries(new FormData(e.target));
    setBusy(true); setError("");
    try { await login(String(d.email).trim(), String(d.password)); }
    catch (err) { setError(err.status === 429 ? err.message : err.status === 401 ? "Incorrect email or password." : err.message || "Could not sign in."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 border border-base-300 bg-base-100 p-6" noValidate>
        <div>
          <p className="font-display text-4xl">Parent Of <span className="italic">Khan</span></p>
          <p className="eyebrow mt-1 opacity-60">Admin sign in</p>
        </div>
        <label className="block"><span className="eyebrow mb-2 block">Email</span><input name="email" type="email" autoComplete="username" required className="field" data-autofocus /></label>
        <label className="block"><span className="eyebrow mb-2 block">Password</span><input name="password" type="password" autoComplete="current-password" required className="field" /></label>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn-khan w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="text-xs opacity-60">Staff accounts only. Customers sign in on the store.</p>
      </form>
    </div>
  );
}
