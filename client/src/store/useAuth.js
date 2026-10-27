import { create } from "zustand";
import { apiGet, apiPost } from "../services/api.js";

// Auth state mirrors the server session; the browser only holds an HttpOnly cookie it cannot read.
// Nothing sensitive is kept in localStorage.
export const useAuth = create((set, get) => ({
  user: null,
  ready: false, // true once we have asked the server who we are
  async init() {
    if (get().ready) return;
    try {
      const { data } = await apiGet("/auth/me");
      set({ user: data, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
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
