import { create } from "zustand";

// Shared UI state: which drawer is open (null | "search" | "account" | "cart").
export const useUI = create((set) => ({
  drawer: null,
  openDrawer: (drawer) => set({ drawer }),
  closeDrawer: () => set({ drawer: null }),
}));
