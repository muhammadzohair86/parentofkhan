import { create } from "zustand";
import { apiGet, apiPost } from "../services/api.js";

export const can = (user, perm) => !!user && user.permissions.includes(perm);

// Admin session state. The server is the authority: this only decides what to SHOW. Every request is re-checked server-side.
export const useAdminAuth = create((set, get) => ({
  user: null,
  ready: false,
  async init() {
    if (get().ready) return;
    try { const { data } = await apiGet("/admin/auth/me"); set({ user: data, ready: true }); }
    catch { set({ user: null, ready: true }); }
  },
  async login(email, password) {
    const { data } = await apiPost("/admin/auth/login", { email, password });
    set({ user: data, ready: true });
  },
  async logout() {
    try { await apiPost("/admin/auth/logout"); } finally { set({ user: null }); }
  },
  expire: () => set({ user: null }), // called when any admin request comes back 401 (expired/revoked session)
}));
