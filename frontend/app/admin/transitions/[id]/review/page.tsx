import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default async function AdminReviewPage() {
  return <main className="page-wrap placeholder-page"><section className="placeholder-card"><div className="form-step-icon"><ShieldCheck size={18} /></div><h1>Claim review belongs to the assigned team lead</h1><p>As admin, you assign the reviewer and track progress here. The reviewer resolves conflicts, checks missing evidence, and publishes the approved handover from their Reviewer workspace.</p><Link className="back-link" href="/admin"><ArrowLeft size={14} />Back to admin dashboard</Link></section></main>;
}
