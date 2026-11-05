import { create } from "zustand";
import { apiGet, apiPost } from "../services/api.js";

export const can = (user, perm) => !!user && user.permissions.includes(perm);

let inflight = null; // one session check at a time (React StrictMode / several callers)
// Admin session state. The server is the authority: this only decides what to SHOW. Every request is re-checked server-side.
export const useAdminAuth = create((set, get) => ({
  user: null,
  ready: false,
  initError: null, // set when the session check could not reach the server: the admin is NOT treated as signed out, an error screen offers a retry
  async init() {
    const s = get();
    if ((s.ready && !s.initError) || inflight) return inflight ?? undefined;
    if (s.initError) set({ ready: false, initError: null });
    inflight = (async () => {
      try { const { data } = await apiGet("/admin/auth/me"); set({ user: data, ready: true, initError: null }); } // anonymous = a normal 200 with data: null
      catch (e) { set({ user: null, ready: true, initError: e }); }
      finally { inflight = null; }
    })();
    return inflight;
  },
  async login(email, password) {
    const { data } = await apiPost("/admin/auth/login", { email, password });
    set({ user: data, ready: true, initError: null });
  },
  async logout() {
    try { await apiPost("/admin/auth/logout"); } finally { set({ user: null }); }
  },
  expire: () => set({ user: null }), // called when any admin request comes back 401 (expired/revoked session)
}));
