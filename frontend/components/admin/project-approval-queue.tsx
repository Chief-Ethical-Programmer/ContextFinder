"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, FolderPlus, X } from "lucide-react";

type RequestItem = { id: string; name: string; team: string; description: string; status: "pending" | "approved" | "rejected"; requestedBy: { name: string; email: string }; createdAt: string; reviewerNote?: string };

export function ProjectApprovalQueue() {
  const router = useRouter();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  useEffect(() => {
    fetch("/api/backend/admin/project-requests", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not load project requests.");
      setItems(body);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load project requests."));
  }, []);

  async function decide(item: RequestItem, decision: "approve" | "reject") {
    setBusyId(item.id); setError("");
    try {
      const response = await fetch(`/api/backend/admin/project-requests/${encodeURIComponent(item.id)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not review the project request.");
      setItems((current) => current.map((row) => row.id === item.id ? body : row));
      if (decision === "approve") router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review the project request."); }
    finally { setBusyId(""); }
  }

  if (!items.length && !error) return null;
  return <section className="project-approval-queue"><div className="project-approval-heading"><span className="project-approval-icon"><FolderPlus size={17} /></span><div><h2>Project requests</h2><p>Leaver-submitted projects need admin approval before they enter the workspace.</p></div><span className="project-approval-count">{items.filter((item) => item.status === "pending").length} pending</span></div>{error && <p className="setup-error" role="alert">{error}</p>}{items.map((item) => <article className="project-approval-item" key={item.id}><div className="project-approval-requester"><strong>{item.name}</strong><span>Requested by {item.requestedBy.name} · {item.requestedBy.email}</span><p>{item.description}</p>{item.reviewerNote && <small>Review note: {item.reviewerNote}</small>}</div>{item.status === "pending" ? <div className="project-approval-actions"><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item, "approve")}><Check size={14} />{busyId === item.id ? "Saving…" : "Approve"}</button><button type="button" className="project-reject-button" disabled={Boolean(busyId)} onClick={() => void decide(item, "reject")}><X size={14} />Reject</button></div> : <span className={`project-decision-status decision-${item.status}`}><Clock3 size={13} />{item.status === "approved" ? "Approved" : "Rejected"}</span>}</article>)}</section>;
}
