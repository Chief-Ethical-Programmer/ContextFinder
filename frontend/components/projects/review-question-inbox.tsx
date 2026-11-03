"use client";

import { useEffect, useState } from "react";

type ReviewerQuestion = { claimId: string; statement: string; question: string };

export function ReviewQuestionInbox({ transitionId }: { transitionId: string }) {
  const [questions, setQuestions] = useState<ReviewerQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function refresh() {
    const response = await fetch(`/api/backend/transitions/${encodeURIComponent(transitionId)}/review-questions`, { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setQuestions(body);
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 7000);
    return () => window.clearInterval(timer);
  }, [transitionId]);

  async function submit(claimId: string) {
    const responseText = (responses[claimId] ?? "").trim();
    if (!responseText) { setError("Write a detailed response before submitting."); return; }
    setBusyId(claimId); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/backend/claims/${encodeURIComponent(claimId)}/departing-response`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: responseText }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not send your response.");
      setResponses((current) => ({ ...current, [claimId]: "" }));
      setMessage("Your detailed response was submitted to the reviewer.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send your response."); }
    finally { setBusyId(""); }
  }

  if (!questions.length && !message) return null;
  return <section className="review-question-inbox"><h3>Follow-up questions from your reviewer</h3>{message && <p role="status">{message}</p>}{questions.map((item) => <article key={item.claimId}><strong>{item.statement}</strong><p><strong>Reviewer question and remarks</strong><br />{item.question}</p><label htmlFor={`review-response-${item.claimId}`}>Add the details your team lead requested</label><textarea id={`review-response-${item.claimId}`} rows={4} value={responses[item.claimId] ?? ""} onChange={(event) => setResponses((current) => ({ ...current, [item.claimId]: event.target.value }))} placeholder="Explain the context, steps, decisions, or evidence in detail." /><button type="button" disabled={busyId === item.claimId} onClick={() => void submit(item.claimId)}>{busyId === item.claimId ? "Submitting…" : "Submit detailed response"}</button></article>)}{error && <small role="alert">{error}</small>}</section>;
}
