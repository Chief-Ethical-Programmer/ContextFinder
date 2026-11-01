import Link from "next/link";
import { ArrowLeft, ClipboardList, Clock3, ShieldCheck } from "lucide-react";
import { getAuditEvents, getTransitions } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  try {
    const transitions = await getTransitions();
    const eventGroups = await Promise.all(transitions.map((transition) => getAuditEvents(transition.id)));
    const events = eventGroups.flat().sort((a, b) => b.id.localeCompare(a.id));

    return <div className="page-wrap audit-page">
      <div className="breadcrumb"><Link href="/admin">Workspace</Link><span>/</span><span>Audit log</span></div>
      <header className="audit-heading">
        <div className="audit-icon"><ClipboardList size={19} /></div>
        <div><span className="eyebrow">DEMO ACTIVITY RECORD</span><h1>Audit log</h1><p>State-changing actions recorded by the mock service layer.</p></div>
        <Link href="/admin" className="audit-back"><ArrowLeft size={14} />Workspace</Link>
      </header>
      <div className="audit-note"><ShieldCheck size={15} /><span>This demo log is stored in memory and resets when the development server restarts.</span></div>
      {events.length === 0 ? <div className="audit-empty" role="status"><ClipboardList size={20} /><strong>No activity recorded yet</strong><span>Actions such as reviewing, publishing and acknowledging a handover will appear here.</span></div> :
        <section className="audit-list" aria-label="Recorded activity">
          <div className="audit-list-heading"><strong>Recent activity</strong><span>{events.length} {events.length === 1 ? "event" : "events"}</span></div>
          <ol>{events.map((event) => <li key={event.id} className="audit-entry"><span className="audit-entry-icon"><Clock3 size={14} /></span><div className="audit-entry-main"><strong>{event.action}</strong><span>{event.actor} · {event.target}</span></div><time>{event.at}</time></li>)}</ol>
        </section>}
      <p className="audit-footnote">Audit entries are read-only in this view. This mock log is not a durable security record.</p>
    </div>;
  } catch {
    return <div className="page-wrap audit-page"><div className="breadcrumb"><Link href="/admin">Workspace</Link><span>/</span><span>Audit log</span></div><div className="audit-error" role="alert"><strong>Activity could not be loaded</strong><span>Return to the workspace and try again.</span><Link href="/admin">Back to workspace</Link></div></div>;
  }
}
