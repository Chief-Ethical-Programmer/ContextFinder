import { ArrowUpRight, Clock3, FileQuestion, GitBranch, MessageSquareText } from "lucide-react";
import type { Claim, Evidence } from "@/lib/types";
import { AccessBadge, OriginBadge, TrustBadge, TypeBadge } from "@/components/shared/badges";

const sourceIcons = { GitHub: GitBranch, Slack: MessageSquareText, Drive: FileQuestion, "Meeting notes": Clock3 };

export function ClaimCard({ claim, evidenceItems }: { claim: Claim; evidenceItems: Evidence[] }) {
  const linkedEvidence = claim.evidenceIds.map((id) => evidenceItems.find((item) => item.id === id));
  return (
    <article className="claim-card">
      <div className="claim-card-top"><TrustBadge label={claim.trust} /><div className="claim-card-tags"><TypeBadge>{claim.type}</TypeBadge><AccessBadge level={claim.access} /></div></div>
      <div className="claim-statement">{claim.statement}<ArrowUpRight size={15} aria-hidden="true" /></div>
      <div className="claim-card-meta"><OriginBadge origin={claim.origin} />{claim.proposal && <span className="proposal-note"><span aria-hidden="true">✦</span> AI proposal · awaiting review</span>}</div>
      <div className="claim-evidence-list" aria-label="Evidence">
        {linkedEvidence.map((item, index) => {
          if (!item) return <div className="evidence-row evidence-missing" key={`missing-${claim.evidenceIds[index]}`}><FileQuestion size={14} aria-hidden="true" /><span>Evidence reference unavailable</span><span className="evidence-time">System flagged</span></div>;
          const Icon = sourceIcons[item.source];
          return <div className="evidence-row" key={item.id}><Icon size={14} aria-hidden="true" /><span className="evidence-source">{item.source}</span><span className="evidence-author">{item.author}</span><span className="evidence-time">{item.happenedAt}</span></div>;
        })}
        {linkedEvidence.length === 0 && <div className="evidence-row evidence-missing"><FileQuestion size={14} aria-hidden="true" /><span>No supporting evidence linked</span><span className="evidence-time">Needs review</span></div>}
      </div>
      <div className="claim-history"><span>Last activity</span><span>{claim.history.at(-1)?.actor ?? "No review yet"}</span><span>·</span><span>{claim.history.at(-1)?.at ?? "Awaiting review"}</span><span className="history-version">v{claim.history.at(-1)?.version ?? 1}</span></div>
    </article>
  );
}
