"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRoleStore } from "@/lib/state/use-role-store";

export function ReviewerRoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const role = useRoleStore((state) => state.role);
  const hydrateRole = useRoleStore((state) => state.hydrateRole);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { hydrateRole(); setHydrated(true); }, [hydrateRole]);
  useEffect(() => {
    if (!hydrated || role === "reviewer") return;
    router.replace(role === "admin" ? "/admin" : "/login");
  }, [hydrated, pathname, role, router]);
  if (!hydrated || role !== "reviewer") return <div className="page-wrap" aria-live="polite">Checking reviewer access…</div>;
  return children;
}
