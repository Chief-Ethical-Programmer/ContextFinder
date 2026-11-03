"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useRoleStore } from "@/lib/state/use-role-store";
import type { Role } from "@/lib/types";

const roleNames: Record<Role, string> = { admin: "Admin", reviewer: "Reviewer", departing: "Departing member", incoming: "New joinee" };

export function RoleSwitcher() {
  const pathname = usePathname();
  const role = useRoleStore((state) => state.role);
  const hydrateRole = useRoleStore((state) => state.hydrateRole);
  const [accountName, setAccountName] = useState("");
  const [accountRole, setAccountRole] = useState<Role | null>(null);
  const loadAccountName = useCallback(async () => {
    try {
      const response = await fetch("/api/backend/me", { cache: "no-store" });
      if (!response.ok) { setAccountName(""); setAccountRole(null); return; }
      const account = await response.json();
      setAccountName(String(account.name ?? "").trim());
      const userRole = String(account.role ?? "");
      setAccountRole(userRole === "admin" || userRole === "reviewer" || userRole === "departing" || userRole === "incoming" ? userRole : null);
    } catch { setAccountName(""); setAccountRole(null); }
  }, []);
  useEffect(() => {
    hydrateRole();
    void loadAccountName();
    window.addEventListener("contextfinder:account-updated", loadAccountName);
    return () => window.removeEventListener("contextfinder:account-updated", loadAccountName);
  }, [hydrateRole, loadAccountName, pathname]);
  const activeRole = accountRole ?? role;
  const firstName = accountName.split(/\s+/)[0];
  const roleLabel = activeRole === "admin" ? roleNames.admin : firstName || (activeRole ? roleNames[activeRole] : "Sign in");
  return (
    <div className="role-switcher" aria-label={activeRole ? `${firstName || roleNames[activeRole]} · ${roleNames[activeRole]}` : "Sign in"}>
      <span>{roleLabel}</span>
    </div>
  );
}
