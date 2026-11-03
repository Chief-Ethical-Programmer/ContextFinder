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

  const allowed = role === "admin";
  useEffect(() => {
    if (!hydrated || allowed) return;
    if (role === "reviewer") router.replace("/reviewer");
    else if (role === "incoming" || role === "departing") {
      let active = true;
      fetch("/api/backend/dashboard", { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error("Could not load assigned handovers");
          return body as { departing?: Array<{ id: string }>; onboarding?: Array<{ id: string }> };
        })
        .then((dashboard) => {
          if (!active) return;
          const handover = role === "departing" ? dashboard.departing?.[0] : dashboard.onboarding?.[0];
          router.replace(handover?.id ? role === "departing" ? `/exit/${handover.id}` : `/onboarding/${handover.id}` : "/login");
        })
        .catch(() => { if (active) router.replace("/login"); });
      return () => { active = false; };
    } else router.replace("/login");
  }, [allowed, hydrated, pathname, role, router]);

  if (!hydrated || !allowed) return <div className="page-wrap" aria-live="polite">Checking your workspace access…</div>;
  return children;
}
