import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModal, useScrollLock } from "../hooks/overlay.js";

export const dateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm opacity-70">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export const Loading = ({ label = "Loading…" }) => <p className="py-10 text-center text-sm opacity-60" role="status">{label}</p>;

export function Notice({ tone = "info", children, className = "" }) {
  const cls = tone === "error" ? "border-error text-error" : tone === "success" ? "border-success text-success" : "border-base-300";
  return <div role={tone === "error" ? "alert" : "status"} className={`border p-3 text-sm ${cls} ${className}`}>{children}</div>;
}

const TONES = { green: "border-success text-success", red: "border-error text-error", amber: "border-warning text-warning", grey: "border-base-300 opacity-70" };
export const Badge = ({ tone = "grey", children }) => <span className={`inline-block border px-2 py-0.5 text-[0.65rem] uppercase tracking-wider ${TONES[tone]}`}>{children}</span>;

export const btnSm = "border border-black px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-neutral hover:text-neutral-content disabled:cursor-not-allowed disabled:opacity-40";

export function Check({ label, checked, onChange, disabled }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" className="checkbox checkbox-sm" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs opacity-60">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-error">{error}</span>}
    </label>
  );
}

// Dialog rendered in <body> (so it can sit above everything). Escape closes it; focus is trapped while it is open.
export function Modal({ open, title, onClose, children, wide = false }) {
  const panel = useRef(null);
  useScrollLock(open);
  useModal(open, panel, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-base-300 bg-base-100 shadow-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
          <h2 className="font-display text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 p-2" data-autofocus><X size={20} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// Confirmation for destructive actions. `children` can hold extra controls (e.g. a reassign dropdown).
export function Confirm({ open, title, message, confirmLabel = "Delete", busy = false, error, onConfirm, onCancel, children }) {
  return (
    <Modal open={open} title={title} onClose={busy ? () => {} : onCancel}>
      <div className="space-y-4">
        <p className="text-sm">{message}</p>
        {children}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-3 pt-2">
          <button className={btnSm} onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn-khan !border-error !bg-error !py-2 !text-xs hover:!text-error" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

// Tiny helper: const [tick, reload] = useReload(); add `tick` to a useAsync dependency list.
export function useReload() {
  const [tick, setTick] = useState(0);
  return [tick, () => setTick((t) => t + 1)];
}

export const money = (n) => `$${Number(n || 0).toFixed(2)}`;
