import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { getClaims, getEvidence, getTransition, getVersions } from "@/lib/api/client";
import { ReviewerWorkspace } from "@/components/review/reviewer-workspace";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [transition, claims, evidence, versions] = await Promise.all([getTransition(id), getClaims(id), getEvidence(id), getVersions(id)]);
  if (!transition) return <div className="page-wrap placeholder-page"><div className="placeholder-card"><span className="placeholder-icon"><ClipboardList size={22} /></span><h1>Transition not found</h1><p>This handover may have been removed or the address is incorrect.</p><Link className="back-link" href="/admin"><ArrowLeft size={14} />Back to transitions</Link></div></div>;
  return <ReviewerWorkspace transition={transition} initialClaims={claims} evidence={evidence} initialVersions={versions} />;
}
