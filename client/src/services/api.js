// Single place that talks to the backend. Components never call fetch directly.
// In dev, requests go to /api and the Vite proxy forwards them to the Express server.
// For production, set VITE_API_URL (at BUILD time, in Netlify's environment) to the deployed API base, e.g. https://api.parentsofkhan.com/api.
// If it is unset the browser calls /api on the SITE's own origin, which only works when Netlify proxies /api/* to the backend (see client/public/_redirects).
const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---- bounded retries -------------------------------------------------------------------------------------------------------------------
// Only for requests that are SAFE to repeat: every GET, plus POSTs the caller explicitly marks `retry: true` (read-only calls such as the shipping
// quote). Order creation, payments, logins and every other write are NEVER retried here. Only transient failures are retried: a network error,
// 502/503/504 (host waking up, database briefly unavailable) and 429 with a short Retry-After. At most 2 retries, short back-off, then the real
// error is shown as before: nothing is hidden and no success is faked.
const RETRY_STATUSES = new Set([502, 503, 504, 429]);
const MAX_RETRIES = 2;
const BACKOFF_MS = [500, 1500];
const MAX_WAIT_MS = 3000;
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});
const retryAfterMs = (res) => {
  const v = Number(res.headers.get("Retry-After"));
  return Number.isFinite(v) && v > 0 ? Math.min(v * 1000, MAX_WAIT_MS) : null;
};

async function attempt(method, url, { body, signal }) {
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      credentials: "include", // sends the HttpOnly session cookie (same-origin in dev via the Vite proxy)
      headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e; // callers that abort handle this themselves
    return { networkError: true };
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON (e.g. a proxy error page, or the SPA's index.html when /api isn't routed to the backend) */ }
  return { res, json };
}

async function request(method, path, { params = {}, body, signal, retry = method === "GET" } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`;

  let out;
  for (let n = 0; ; n++) {
    out = await attempt(method, url, { body, signal });
    const transient = out.networkError || RETRY_STATUSES.has(out.res.status);
    if (!retry || !transient || n >= MAX_RETRIES) break;
    await sleep((out.res && retryAfterMs(out.res)) ?? BACKOFF_MS[n], signal);
  }

  if (out.networkError) throw new ApiError("Could not reach the store server. Please check your connection and try again.", { code: "NETWORK_ERROR" });
  const { res, json } = out;
  if (res.status === 204) return { success: true, data: null };
  if (!res.ok || !json?.success) {
    if (!json && res.ok) {
      // A 200 that is not our JSON means /api isn't reaching the backend (wrong VITE_API_URL or a missing /api proxy on the host).
      console.error(`[api] ${method} ${url} returned a non-JSON response. Check VITE_API_URL / the /api proxy rule.`);
      throw new ApiError("The store server returned an unexpected response. Please try again shortly.", { status: res.status, code: "BAD_RESPONSE" });
    }
    const message = json?.error?.message
      || (res.status === 429 ? "Too many requests. Please wait a moment and try again."
        : res.status === 502 || res.status === 503 || res.status === 504 ? "The store server is starting up or temporarily unavailable. Please try again in a moment."
        : "The store server is unavailable right now.");
    throw new ApiError(message, { status: res.status, code: json?.error?.code, details: json?.error?.details });
  }
  return json;
}

export const apiGet = (path, params, signal) => request("GET", path, { params, signal });
// `opts.retry: true` only for POSTs that are read-only / idempotent (e.g. the shipping quote). Writes are never retried automatically.
export const apiPost = (path, body, signal, opts = {}) => request("POST", path, { body: body ?? {}, signal, retry: opts.retry === true });
export const apiPatch = (path, body) => request("PATCH", path, { body: body ?? {}, retry: false });
export const apiDelete = (path, params) => request("DELETE", path, { params, retry: false });
export const API_BASE = BASE;
export const apiPut = (path, body) => request("PUT", path, { body: body ?? {}, retry: false });
