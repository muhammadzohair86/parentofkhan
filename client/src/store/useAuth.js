import { create } from "zustand";
import { apiGet, apiPost } from "../services/api.js";

// Auth state mirrors the server session; the browser only holds an HttpOnly cookie it cannot read.
// Nothing sensitive is kept in localStorage.
let inflight = null; // one session check at a time (React StrictMode / several callers)
export const useAuth = create((set, get) => ({
  user: null,
  ready: false, // true once we have asked the server who we are
  initFailed: false, // the last check could not reach the server (we do NOT know the visitor is signed out): init() may run again
  async init() {
    const s = get();
    if ((s.ready && !s.initFailed) || inflight) return inflight ?? undefined;
    inflight = (async () => {
      try {
        const { data } = await apiGet("/auth/me"); // anonymous visitors get a normal 200 with data: null
        set({ user: data, ready: true, initFailed: false });
      } catch {
        set({ user: null, ready: true, initFailed: true }); // a failed check is not "signed out"; it is retried on the next init()
      } finally { inflight = null; }
    })();
    return inflight;
  },
  async signup(fields) {
    const { data } = await apiPost("/auth/signup", fields);
    set({ user: data });
    return data;
  },
  async login(fields) {
    const { data } = await apiPost("/auth/login", fields);
    set({ user: data });
    return data;
  },
  async logout() {
    try { await apiPost("/auth/logout"); } finally { set({ user: null }); }
  },
  // Call when any authenticated request comes back 401 (expired or revoked session).
  sessionExpired: () => set({ user: null }),
}));
