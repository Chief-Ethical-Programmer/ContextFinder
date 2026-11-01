"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRoleStore } from "@/lib/state/use-role-store";

export function AdminRoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const role = useRoleStore((state) => state.role);
  const hydrateRole = useRoleStore((state) => state.hydrateRole);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hydrateRole();
    setHydrated(true);
  }, [hydrateRole]);

  const allowed = role === "admin" || role === "reviewer";
  useEffect(() => {
    if (!hydrated || allowed) return;
    if (role === "incoming") router.replace("/onboarding/cf-cloudcart-01");
    else if (role === "departing") router.replace("/exit/cf-cloudcart-01");
    else router.replace("/login");
  }, [allowed, hydrated, pathname, role, router]);

  if (!hydrated || !allowed) return <div className="page-wrap" aria-live="polite">Checking your workspace access…</div>;
  return children;
}
