import { ArrowRight, Database, ShieldCheck, Sparkles } from "lucide-react";
import { getClaims, getEvidence, getTransition } from "@/lib/api/client";
import { ClaimCard } from "@/components/shared/claim-card";
import { AccessBadge, OriginBadge, TrustBadge } from "@/components/shared/badges";

export default async function FoundationPage() {
  const transitionId = "cf-cloudcart-01";
  const [transition, claims, evidence] = await Promise.all([getTransition(transitionId), getClaims(transitionId), getEvidence(transitionId)]);
  if (!transition) return null;
  const showcase = claims.slice(0, 3);

  return <div className="page-wrap foundation-page">
    <div className="breadcrumb"><span>ContextFinder</span><span>/</span><span>Foundation preview</span></div>
    <div className="foundation-hero"><div className="eyebrow"><span className="eyebrow-line" />TEAM KNOWLEDGE, READY TO CONTINUE</div><h1>Keep the context.<br /><span>Move the work forward.</span></h1><p>Project history becomes a clear, evidence-linked handover people can trust.</p><div className="foundation-hero-meta"><span><span className="status-dot" /> Foundation is ready</span><span>CloudCart demo data</span></div></div>
    <div className="foundation-grid">
      <section className="foundation-primary"><div className="foundation-panel-heading"><div><span className="eyebrow">SHARED COMPONENTS</span><h2>Claim card preview</h2><p>A claim stays a proposal until a person checks it.</p></div><span className="component-count"><Database size={13} />{claims.length} sample claims</span></div><div className="featured-claims">{showcase.map((claim) => <ClaimCard key={claim.id} claim={claim} evidenceItems={evidence} />)}</div></section>
      <aside className="foundation-side"><section className="rail-card"><div className="rail-title">Trust labels</div><div className="foundation-badge-list">{["Verified", "Partially supported", "Conflicting", "Unverified", "Missing evidence"].map((label) => <TrustBadge key={label} label={label as typeof claims[number]["trust"]} />)}</div></section><section className="rail-card"><div className="rail-title">Claim metadata</div><div className="metadata-row"><span>Origin</span><OriginBadge origin="System extracted" /></div><div className="metadata-row"><span>Origin</span><OriginBadge origin="Stated by leaver" /></div><div className="metadata-row"><span>Origin</span><OriginBadge origin="Entered by reviewer" /></div><div className="metadata-row"><span>Access</span><AccessBadge level="Technical only" /></div><div className="metadata-row"><span>Restricted</span><AccessBadge level="Leads only" /></div></section><section className="foundation-principle"><div className="principle-icon"><Sparkles size={16} /></div><strong>AI proposes. People approve.</strong><p>Claims stay clearly labelled until reviewed. Missing evidence and disagreement are shown openly.</p><div className="principle-foot"><ShieldCheck size={14} /> Sources are never assumed to grant access</div></section></aside>
    </div>
    <div className="foundation-next"><div><span className="eyebrow">READY FOR PHASE 2</span><strong>Admin side and transition setup</strong><span>Dashboard, role-aware login, and the source selection stepper.</span></div><span className="foundation-next-link">Next in the build plan <ArrowRight size={15} /></span></div>
  </div>;
}
