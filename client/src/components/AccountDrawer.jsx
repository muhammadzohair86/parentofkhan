import { useState } from "react";
import { Link } from "react-router-dom";
import Drawer from "./Drawer.jsx";
import { useAuth } from "../store/useAuth.js";
import { useUI } from "../store/useUI.js";

const EMAIL = /^\S+@\S+\.\S+$/;

function FieldError({ id, children }) {
  return <p id={id} className="mt-1 min-h-4 text-xs text-error">{children}</p>;
}

function SignedIn() {
  const user = useAuth((s) => s.user);
  const closeDrawer = useUI((s) => s.closeDrawer);
  const logout = useAuth((s) => s.logout);
  const [busy, setBusy] = useState(false);
  const out = async () => { setBusy(true); try { await logout(); } catch { /* local state is cleared either way */ } finally { setBusy(false); } };
  return (
    <div className="space-y-5 p-6">
      <div>
        <p className="eyebrow mb-2">Signed in as</p>
        <p className="font-display text-3xl">{user.name}</p>
        <p className="mt-1 text-sm opacity-70">{user.email}</p>
      </div>
      <Link to="/track-order" onClick={closeDrawer} className="btn-khan w-full">My orders</Link>
      <button className="btn-khan w-full" onClick={out} disabled={busy} data-autofocus>{busy ? "Signing out…" : "Sign out"}</button>
    </div>
  );
}

function AuthForm() {
  const login = useAuth((s) => s.login);
  const signup = useAuth((s) => s.signup);
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const isSignup = mode === "signup";

  const switchMode = () => { setMode(isSignup ? "login" : "signup"); setErrors({}); setFormError(""); };

  const submit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const name = (d.name || "").trim(), email = (d.email || "").trim(), password = d.password || "";
    const er = {};
    if (isSignup && !name) er.name = "Enter your name.";
    if (!EMAIL.test(email)) er.email = "Enter a valid email address.";
    if (!password) er.password = "Enter your password.";
    else if (isSignup && password.length < 8) er.password = "Password must be at least 8 characters.";
    setErrors(er); setFormError("");
    if (Object.keys(er).length) return;

    setLoading(true);
    try {
      if (isSignup) await signup({ name, email, password });
      else await login({ email, password });
      // The drawer swaps to the signed-in view because the auth store now has a user.
    } catch (err) {
      const fieldErrs = {};
      for (const x of err.details || []) if (x.path) fieldErrs[x.path] = x.message;
      if (Object.keys(fieldErrs).length) setErrors(fieldErrs);
      else setFormError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 p-6" noValidate key={mode}>
      {isSignup && (
        <div>
          <label htmlFor="acc-name" className="eyebrow mb-2 block">Name</label>
          <input id="acc-name" name="name" type="text" autoComplete="name" maxLength={80} className="field" aria-invalid={!!errors.name} aria-describedby="acc-name-e" />
          <FieldError id="acc-name-e">{errors.name}</FieldError>
        </div>
      )}
      <div>
        <label htmlFor="acc-email" className="eyebrow mb-2 block">Email</label>
        <input id="acc-email" name="email" data-autofocus type="email" required autoComplete="email" maxLength={254} className="field" aria-invalid={!!errors.email} aria-describedby="acc-email-e" />
        <FieldError id="acc-email-e">{errors.email}</FieldError>
      </div>
      <div>
        <label htmlFor="acc-pass" className="eyebrow mb-2 block">Password</label>
        <input id="acc-pass" name="password" type="password" required autoComplete={isSignup ? "new-password" : "current-password"} maxLength={128} className="field" aria-invalid={!!errors.password} aria-describedby="acc-pass-e" />
        <FieldError id="acc-pass-e">{errors.password || (isSignup ? "At least 8 characters." : "")}</FieldError>
      </div>
      {formError && <p role="alert" className="border border-error p-3 text-sm text-error">{formError}</p>}
      <button className="btn-khan w-full" disabled={loading}>
        {loading ? (isSignup ? "Creating account…" : "Signing in…") : isSignup ? "Create account" : "Sign in"}
      </button>
      <p className="pt-2 text-sm opacity-70">
        {isSignup ? "Already have an account? " : "New here? "}
        <button type="button" onClick={switchMode} className="link-u underline">{isSignup ? "Sign in" : "Create an account"}</button>
      </p>
    </form>
  );
}

function Body() {
  const user = useAuth((s) => s.user);
  return user ? <SignedIn /> : <AuthForm />;
}

export default function AccountDrawer() {
  return <Drawer id="account" title="Account"><Body /></Drawer>;
}
