import Link from "next/link";
import { ArrowRight, ClipboardCheck, ShieldCheck } from "lucide-react";
import { backendGet } from "@/lib/api/server-backend";

export const dynamic = "force-dynamic";

type ReviewItem = {
  id: string; project: string; status: string;
  departing: { name: string }; incoming: { name: string };
  claimCount: number; reviewedCount: number; blockingCount: number;
};

export default async function ReviewerPage() {
  let items: ReviewItem[] = [];
  let error = "";
  try { items = await backendGet("/reviewer/transitions") as ReviewItem[]; }
  catch (cause) {
    if (cause instanceof Error && "digest" in cause && String(cause.digest).startsWith("NEXT_REDIRECT")) throw cause;
    error = cause instanceof Error ? cause.message : "Could not load assigned reviews.";
  }
  return <main className="page-wrap reviewer-queue-page">
    <div className="breadcrumb"><span>Workspace</span><span>/</span><span>My reviews</span></div>
    <header className="reviewer-queue-heading"><span className="reviewer-queue-icon"><ClipboardCheck size={20} /></span><div><span className="eyebrow">REVIEWER WORKSPACE</span><h1>Assigned handovers</h1><p>Review claims, return questions for more detail, and give final approval for each handover.</p></div></header>
    {error && <div className="review-feedback feedback-error" role="alert">{error}</div>}
    {!error && items.length === 0 && <section className="reviewer-queue-empty"><ShieldCheck size={22} /><strong>No handovers assigned yet</strong><span>Your workspace admin will assign a project handover to you.</span></section>}
    <section className="reviewer-queue-list" aria-label="Assigned handovers">{items.map((item) => <article className="reviewer-queue-card" key={item.id}><div className="reviewer-queue-card-top"><span className="review-status review-status-pending"><span className="status-dot" />{item.status}</span></div><h2>{item.project}</h2><p className="reviewer-queue-people"><span>{item.departing?.name ?? "Departing member"}</span>{item.incoming?.name && item.incoming.name !== "Not assigned" ? <><span className="reviewer-queue-arrow">→</span><span>{item.incoming.name}</span></> : <small className="incoming-assignment-note">Incoming teammate assigned by admin after reviewer approval</small>}</p><div className="reviewer-queue-stats"><span><strong>{item.reviewedCount}/{item.claimCount}</strong> reviewed</span><span><strong>{item.blockingCount}</strong> conflicts or gaps</span></div><Link className="button button-primary" href={`/reviewer/transitions/${item.id}/review`}>Open review <ArrowRight size={15} /></Link></article>)}</section>
  </main>;
}
