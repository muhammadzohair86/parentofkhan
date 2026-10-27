// Single place that talks to the backend. Components never call fetch directly.
// In dev, requests go to /api and the Vite proxy forwards them to the Express server.
// For production, set VITE_API_URL to the deployed API base (e.g. https://api.parentsofkhan.com/api).
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

async function request(method, path, { params = {}, body, signal } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`;

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
    throw new ApiError("Could not reach the store server. Please try again shortly.", { code: "NETWORK_ERROR" });
  }

  let json = null;
  try { json = await res.json(); } catch { /* non-JSON (e.g. proxy error page) */ }

  if (!res.ok || !json?.success) {
    throw new ApiError(json?.error?.message || "The store server is unavailable right now.", {
      status: res.status, code: json?.error?.code, details: json?.error?.details,
    });
  }
  return json;
}

export const apiGet = (path, params, signal) => request("GET", path, { params, signal });
export const apiPost = (path, body, signal) => request("POST", path, { body: body ?? {}, signal });
export const apiPatch = (path, body) => request("PATCH", path, { body: body ?? {} });
export const apiDelete = (path, params) => request("DELETE", path, { params });
export const API_BASE = BASE;
export const apiPut = (path, body) => request("PUT", path, { body: body ?? {} });
