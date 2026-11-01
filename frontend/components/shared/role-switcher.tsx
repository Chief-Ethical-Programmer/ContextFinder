"use client";

import { UserRound } from "lucide-react";
import { useEffect } from "react";
import { useRoleStore } from "@/lib/state/use-role-store";
import type { Role } from "@/lib/types";

const roleNames: Record<Role, string> = { admin: "Admin", reviewer: "Reviewer", departing: "Departing member", incoming: "New joinee" };

export function RoleSwitcher() {
  const role = useRoleStore((state) => state.role);
  const hydrateRole = useRoleStore((state) => state.hydrateRole);
  useEffect(() => { hydrateRole(); }, [hydrateRole]);
  return (
    <div className="role-switcher" aria-label="Signed-in role">
      <UserRound size={15} aria-hidden="true" />
      <span>{role ? roleNames[role] : "Sign in"}</span>
    </div>
  );
}
