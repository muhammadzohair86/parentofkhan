import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "../lib.js";

const base = "flex h-10 min-w-10 items-center justify-center border px-2 text-sm";

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-14 flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page"
        className={`${base} gap-1 border-black/30 disabled:cursor-not-allowed disabled:opacity-30`}>
        <ChevronLeft size={16} /><span className="hidden sm:inline">Previous</span>
      </button>
      {pageWindow(page, totalPages).map((n, i) =>
        n === "…" ? (
          <span key={`gap${i}`} aria-hidden="true" className="px-1 opacity-50">…</span>
        ) : (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined}
            className={`${base} ${n === page ? "border-black bg-neutral text-neutral-content" : "border-black/30 hover:border-black"}`}>{n}</button>
        )
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Next page"
        className={`${base} gap-1 border-black/30 disabled:cursor-not-allowed disabled:opacity-30`}>
        <span className="hidden sm:inline">Next</span><ChevronRight size={16} />
      </button>
    </nav>
  );
}
