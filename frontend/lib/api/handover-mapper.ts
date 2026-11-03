import type { AccessLevel, Claim, Evidence, OnboardingView, RecipientRole, SourceConnection, SourceKind, Transition, TrustLabel } from "@/lib/types";

const roles: Record<string, RecipientRole> = { project_lead: "Project lead", technical_successor: "Technical successor", new_volunteer: "New volunteer" };
const trust: Record<string, TrustLabel> = { verified: "Verified", partially_supported: "Partially supported", conflicting: "Conflicting", unverified: "Unverified", missing_evidence: "Missing evidence" };
const types: Record<string, Claim["type"]> = { decision: "Decision", owner: "Owner", task: "Task", dependency: "Dependency", risk: "Risk", open_question: "Open question", next_action: "Next action" };
const access: Record<string, AccessLevel> = { public_team: "Public to team", technical_only: "Technical only", leads_only: "Leads only" };

export function mapHandoverView(raw: Record<string, any>): OnboardingView {
  const transition = raw.transition as Transition;
  transition.acknowledgedAt = raw.acknowledgedAt ? new Date(raw.acknowledgedAt).toLocaleString() : undefined;
  transition.acknowledgedBy = raw.acknowledgedBy ?? undefined;
  transition.acknowledgedVersion = raw.acknowledgedVersion ?? undefined;
  transition.reviewerRemarks = raw.remarks ?? undefined;
  const claims: Claim[] = (raw.claims ?? []).map((claim: Record<string, any>) => ({
    id: String(claim.id), transitionId: String(raw.transitionId), statement: String(claim.statement ?? ""),
    type: types[String(claim.type ?? "open_question")] ?? "Open question",
    trust: trust[claim.trustLabel ?? claim.trust_label] ?? "Unverified", access: access[claim.accessLevel ?? claim.access_level] ?? "Technical only",
    origin: claim.origin === "leaver" ? "Stated by leaver" : claim.origin === "reviewer" ? "Entered by reviewer" : "System extracted",
    evidenceIds: (claim.evidenceIds ?? []).map(String), history: [], reviewerNote: claim.trustReason ?? undefined, proposal: false, status: "Approved",
  }));
  const evidence: Evidence[] = (raw.evidence ?? []).map((item: Record<string, any>) => ({ id: String(item.id), claimId: item.claimId ? String(item.claimId) : undefined, source: String(item.source) as SourceKind, author: String(item.author ?? ""), fileName: item.fileName ? String(item.fileName) : undefined, happenedAt: item.happenedAt ? new Date(item.happenedAt).toLocaleString() : "Date unavailable", excerpt: String(item.excerpt ?? ""), href: item.href ?? undefined }));
  const repositoryFromFileLink = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    try {
      const url = new URL(value);
      const blobIndex = url.pathname.indexOf("/blob/");
      if (url.hostname !== "github.com" || blobIndex < 0) return undefined;
      return `${url.origin}${url.pathname.slice(0, blobIndex)}`;
    } catch { return undefined; }
  };
  const sources: SourceConnection[] = (raw.sources ?? []).map((item: Record<string, any>) => {
    const name = String(item.name);
    const relatedEvidence = evidence.filter((record) => record.source === name);
    const fileMap = new Map<string, SourceConnection["files"][number]>();
    for (const record of relatedEvidence) {
      const filePath = record.fileName || record.author || record.href?.split("/").pop() || "Source record";
      const fileName = filePath.split("/").pop() || filePath;
      const key = record.href || fileName;
      const existing = fileMap.get(key);
      const claimId = record.claimId ?? claims.find((claim) => claim.evidenceIds.includes(record.id))?.id;
      if (existing) {
        if (claimId && !existing.claimIds.includes(claimId)) existing.claimIds.push(claimId);
      } else {
        fileMap.set(key, { recordId: record.id, name: fileName, href: record.href, claimIds: claimId ? [claimId] : [] });
      }
    }
    const savedFiles = Array.isArray(item.files) ? item.files.map((file: Record<string, any>) => ({ recordId: String(file.recordId), name: String(file.name), href: typeof file.href === "string" ? file.href : undefined, claimIds: Array.isArray(file.claimIds) ? file.claimIds.map(String) : [] })) : [];
    const files = savedFiles.length ? savedFiles : [...fileMap.values()];
    return {
      id: String(item.id), transitionId: String(raw.transitionId), kind: name as SourceKind, name,
      href: typeof item.href === "string" ? item.href : relatedEvidence.map((record) => repositoryFromFileLink(record.href)).find(Boolean),
      files, access: access[item.access] ?? "Technical only", linkedClaimCount: Number(item.linkedClaimCount ?? 0), connected: Boolean(item.connected),
    };
  });
  return { transition, role: roles[raw.role] ?? "Technical successor", claims, evidence, sources, hiddenItemCount: Number(raw.hiddenCount ?? 0), reviewerRemarks: raw.remarks ?? undefined, canPreviewRoles: Boolean(raw.canPreviewRoles) };
}
