"use client";

import { create } from "zustand";
import type { Role } from "@/lib/types";

interface RoleState {
  role: Role | null;
  setRole: (role: Role) => void;
  hydrateRole: () => void;
}

const ROLE_STORAGE_KEY = "contextfinder:session-role:v1";
const validRoles: Role[] = ["admin", "reviewer", "departing", "incoming"];

export const useRoleStore = create<RoleState>((set) => ({
  role: null,
  setRole: (role) => {
    set({ role });
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(ROLE_STORAGE_KEY, role); } catch { /* Keep the active session usable when storage is unavailable. */ }
    }
  },
  hydrateRole: () => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(ROLE_STORAGE_KEY);
      if (saved && validRoles.includes(saved as Role)) set({ role: saved as Role });
    } catch { /* Keep the default role when storage is unavailable. */ }
  },
}));
