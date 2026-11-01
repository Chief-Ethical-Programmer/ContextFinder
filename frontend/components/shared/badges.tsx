import { CircleDashed, CircleDot, CircleHelp, ShieldAlert, ShieldCheck, UserRound, Bot, PencilLine, LockKeyhole } from "lucide-react";
import type { AccessLevel, Origin, TrustLabel } from "@/lib/types";

const trustStyle: Record<TrustLabel, { className: string; Icon: typeof ShieldCheck }> = {
  Verified: { className: "trust-verified", Icon: ShieldCheck },
  "Partially supported": { className: "trust-partial", Icon: CircleDot },
  Conflicting: { className: "trust-conflict", Icon: ShieldAlert },
  Unverified: { className: "trust-unverified", Icon: CircleHelp },
  "Missing evidence": { className: "trust-missing", Icon: CircleDashed },
};

const originStyle: Record<Origin, { className: string; Icon: typeof Bot }> = {
  "System extracted": { className: "origin-system", Icon: Bot },
  "Stated by leaver": { className: "origin-leaver", Icon: UserRound },
  "Entered by reviewer": { className: "origin-reviewer", Icon: PencilLine },
};

export function TrustBadge({ label, small = false }: { label: TrustLabel; small?: boolean }) {
  const { className, Icon } = trustStyle[label];
  return <span className={`badge trust-badge ${className} ${small ? "badge-small" : ""}`}><Icon size={14} aria-hidden="true" /><span>{label}</span></span>;
}

export function OriginBadge({ origin }: { origin: Origin }) {
  const { className, Icon } = originStyle[origin];
  const label = origin === "System extracted" ? "System" : origin === "Stated by leaver" ? "Leaver" : "Reviewer";
  return <span className={`badge origin-badge ${className}`}><Icon size={13} aria-hidden="true" /><span>{label}</span></span>;
}

export function AccessBadge({ level }: { level: AccessLevel }) {
  return <span className={`badge access-badge ${level === "Leads only" ? "access-restricted" : ""}`}><LockKeyhole size={12} aria-hidden="true" /><span>{level}</span></span>;
}

export function TypeBadge({ children }: { children: React.ReactNode }) {
  return <span className="badge type-badge">{children}</span>;
}
