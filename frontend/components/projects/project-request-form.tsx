"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Send } from "lucide-react";
import { DepartingSourceUpload } from "@/components/projects/departing-source-upload";
import { ReviewQuestionInbox } from "@/components/projects/review-question-inbox";
type ProjectRequest = { id: string; name: string; team: string; description: string; status: "draft" | "pending" | "approved" | "rejected"; reviewerNote?: string; projectId?: string; transitionId?: string; sourcesSubmitted?: boolean };
export function ProjectRequestForm() {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [description, setDescription] = useState("");
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = requests.find((request) => request.status === "draft");
  async function refreshRequests() {
    const response = await fetch("/api/backend/project-requests/mine", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? "Your session expired or you are signed out. Sign in as the departing member to load project requests." : body.detail ?? body.error ?? "Could not load your requests.");
    setRequests(body);
  }
  useEffect(() => {
    void refreshRequests().catch((cause) => setError(cause instanceof Error ? cause.message : "Sign in as a departing member to request a project."));
    const timer = window.setInterval(() => { void refreshRequests().catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/backend/project-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, team, description }) });
      const body = await response.json();
      if (!response.ok) {
        const reason = body.detail ?? body.error ?? body.message;
        throw new Error(typeof reason === "string" ? reason : `Could not submit the project request (HTTP ${response.status}).`);
      }
      setName(""); setTeam(""); setDescription("");
      setMessage(body.status === "pending" ? "Analysis is already underway for this project." : "Project details saved. Add the sources below to continue to stage 2.");
      await refreshRequests();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit the project request."); }
    finally { setBusy(false); }
  }
  async function submitForAnalysis(request: ProjectRequest) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/backend/project-requests/${encodeURIComponent(request.id)}/submit`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? body.error ?? "Could not start project analysis.");
      setMessage("Sources submitted. Analysis and question generation have started.");
      await refreshRequests();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start project analysis."); }
    finally { setBusy(false); }
  }
  const label: Record<ProjectRequest["status"], string> = { draft: "Add project sources and submit to start analysis", pending: "Analysis, answers, and reviewer check in progress", approved: "Reviewer approved · admin can assign an incoming teammate", rejected: "Not approved" };
  return <>
    <section className="project-request-workflow" aria-label="Project handover steps"><article><span>1</span><div><strong>Enter project and team</strong></div></article><article><span>2</span><div><strong>Upload sources and analyze</strong></div></article><article><span>3</span><div><strong>Answer questions, reviewer approves, admin assigns an incoming teammate</strong></div></article></section>
    {!draft && <form className="project-request-form" onSubmit={(event) => void submit(event)}><label htmlFor="project-request-name">Project name</label><input id="project-request-name" required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Observability Platform" /><label htmlFor="project-request-team">Owning team</label><input id="project-request-team" required minLength={2} maxLength={120} value={team} onChange={(event) => setTeam(event.target.value)} placeholder="For example, DevOps" /><label htmlFor="project-request-description">What does this project do?</label><textarea id="project-request-description" required minLength={10} maxLength={4000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Briefly describe the project and why it needs a handover." /><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving project…" : "Save project details"}<Send size={14} /></button></form>}
    {requests.length > 0 && <section className="my-project-requests"><h2>Your project requests and source uploads</h2>{requests.filter((request) => request.status !== "rejected").map((request) => <article key={request.id}><span className="project-request-status-icon">{request.status === "pending" || request.status === "draft" ? <Clock3 size={14} /> : <CheckCircle2 size={14} />}</span><div><strong>{request.name} | {request.team}</strong><p className="project-request-description">{request.description}</p>{request.transitionId && <DepartingSourceUpload embedded transitionId={request.transitionId} analysisEnabled={request.status === "pending" || request.status === "approved"} submitAfterSave={request.status === "draft" ? () => submitForAnalysis(request) : undefined} onSourcesChanged={() => void refreshRequests()} />}{request.status === "pending" && request.transitionId && <ReviewQuestionInbox transitionId={request.transitionId} />}<small className="project-request-bottom-status">{label[request.status]}</small>{request.reviewerNote && <small>Reviewer note: {request.reviewerNote}</small>}</div></article>)}{requests.some((request) => request.status === "rejected") && <details className="previous-project-requests"><summary>Previous requests not approved ({requests.filter((request) => request.status === "rejected").length})</summary>{requests.filter((request) => request.status === "rejected").map((request) => <article key={request.id}><div><strong>{request.name} | {request.team}</strong><p className="project-request-description">{request.description}</p><small>Not approved{request.reviewerNote ? ` | ${request.reviewerNote}` : ""}</small></div></article>)}</details>}</section>}
    {error && <p className="setup-error" role="alert">{error}{/session|sign in/i.test(error) && <> <Link href="/login?next=%2Fproject-request">Sign in</Link></>}</p>}{message && <p className="project-request-success" role="status"><CheckCircle2 size={15} />{message}</p>}
  </>;
}
