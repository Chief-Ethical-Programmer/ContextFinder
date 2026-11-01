"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCircle2, CircleDashed, FileQuestion, MessageSquareText, Save, Send, ShieldCheck, SkipForward } from "lucide-react";
import { AccessBadge, TrustBadge } from "@/components/shared/badges";
import { saveExitAnswer, submitExitAnswers } from "@/lib/api/browser";
import type { ExitAnswerStatus, ExitQuestion, Evidence, Transition } from "@/lib/types";

export function ExitInterview({ transition, initialQuestions, evidence }: { transition: Transition; initialQuestions: ExitQuestion[]; evidence: Evidence[] }) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [busyId, setBusyId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submitted = questions.length > 0 && questions.every((question) => question.answerSubmitted);
  const answerCount = questions.filter((question) => question.answer?.trim() || question.answerStatus === "dont-know").length;
  const progress = useMemo(() => `${answerCount} of ${questions.length} questions have a response`, [answerCount, questions.length]);

  function updateLocal(questionId: string, update: Partial<ExitQuestion>) {
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, ...update } : question));
    setError(""); setMessage("");
  }

  async function saveQuestion(question: ExitQuestion, status: "draft" | "dont-know" | "skipped") {
    setBusyId(question.id); setError(""); setMessage("");
    const answer = status === "dont-know" ? "I don't know." : status === "skipped" ? "" : question.answer ?? "";
    try {
      const saved = await saveExitAnswer(transition.id, question.id, answer, status);
      setQuestions((current) => current.map((item) => item.id === saved.id ? saved : item));
      setMessage(status === "draft" ? "Draft saved in your own words." : status === "dont-know" ? "Saved as your response: I don’t know." : "Question marked to skip. You can still change it before submitting.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this response."); }
    finally { setBusyId(""); }
  }

  async function saveAllDrafts() {
    setSubmitting(true); setError(""); setMessage("");
    try {
      const changes = questions.filter((question) => !question.answerSubmitted);
      for (const question of changes) {
        const status = question.answerStatus === "dont-know" || question.answerStatus === "skipped" ? question.answerStatus : "draft";
        const saved = await saveExitAnswer(transition.id, question.id, question.answer ?? "", status);
        setQuestions((current) => current.map((item) => item.id === saved.id ? saved : item));
      }
      setMessage("Your draft answers have been saved. They are still labelled as your own words.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save drafts."); }
    finally { setSubmitting(false); }
  }

  async function submitAll() {
    setSubmitting(true); setError(""); setMessage("");
    try {
      await submitExitAnswers(transition.id, questions.map((question) => ({ questionId: question.id, answer: question.answer ?? "", status: (question.answerStatus === "dont-know" || question.answerStatus === "skipped" ? question.answerStatus : "submitted") as ExitAnswerStatus })));
      setQuestions((current) => current.map((question) => ({ ...question, answerStatus: question.answerStatus === "skipped" ? "skipped" : question.answerStatus === "dont-know" ? "dont-know" : question.answer?.trim() ? "submitted" : "skipped", answerSubmitted: true, answer: question.answerStatus === "dont-know" ? "I don't know." : question.answerStatus === "skipped" || !question.answer?.trim() ? "" : question.answer })));
      setMessage("Your answers were submitted as Stated by leaver. A reviewer will see them as your words, not documented fact.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit your answers."); }
    finally { setSubmitting(false); }
  }

  return <div className="page-wrap exit-page"><div className="breadcrumb"><Link href="/admin">Workspace</Link><span>/</span><span>{transition.projectCode}</span><span>/</span><span>Exit questions</span></div><Link href="/admin" className="back-link"><ArrowLeft size={14} />Back to workspace</Link>
    <section className="exit-hero"><div className="exit-hero-icon"><MessageSquareText size={20} /></div><div><div className="eyebrow"><span className="eyebrow-line" />YOUR EXPERIENCE MATTERS · {transition.projectCode}</div><h1>A few things only you can answer.</h1><p>We found gaps between project records. Your context can help the next person pick up safely.</p><div className="exit-person-line"><span className="person-avatar avatar-indigo">{transition.departing.initials}</span><span>Answering as <strong>{transition.departing.name}</strong></span><span className="exit-progress-chip">{progress}</span></div></div></section>
    <div className="leaver-label-note"><span className="leaver-label-mark"><ShieldCheck size={15} /></span><span><strong>Your answers stay in your own words.</strong> They’re labelled “Stated by leaver” and treated as unverified until a reviewer checks them. They will never appear as documented fact.</span></div>
    {error && <div className="exit-message exit-error" role="alert">{error}</div>}{message && <div className="exit-message exit-success" role="status"><CheckCircle2 size={15} />{message}</div>}
    {submitted ? <section className="exit-submitted-panel"><span className="submitted-check"><Check size={21} /></span><div><span className="eyebrow">SUBMITTED · {transition.departing.name}</span><h2>Thank you for carrying the context forward.</h2><p>Your responses are saved as “Stated by leaver.” A reviewer can compare them with the source records before the handover is published.</p><Link href={`/admin/transitions/${transition.id}/review`} className="text-link">Back to the review workspace</Link></div></section> : <form onSubmit={(event) => { event.preventDefault(); void submitAll(); }}>
      <div className="exit-question-list">{questions.map((question, index) => {
        const relatedEvidence = question.evidenceIds.map((id) => evidence.find((item) => item.id === id)).filter((item): item is Evidence => Boolean(item));
        return <article className="exit-question-card" key={question.id}><div className="exit-question-top"><span className="exit-question-number">{String(index + 1).padStart(2, "0")}</span><TrustBadge label={question.trust} /><AccessBadge level="Technical only" /><span className="exit-answer-status">{question.answerSubmitted ? "Submitted" : question.answerStatus === "draft" ? "Draft saved" : question.answerStatus === "skipped" ? "Skipped for now" : question.answerStatus === "dont-know" ? "I don’t know" : "Not answered"}</span></div><div className="exit-question-content"><div className="system-found"><div className="system-found-title"><FileQuestion size={13} />WHAT THE SYSTEM FOUND</div><p>{question.systemFound}</p><div className="exit-evidence-snippets">{relatedEvidence.map((item) => <div className="exit-evidence-snippet" key={item.id}><span>{item.source} · {item.author}</span><p>{item.excerpt}</p></div>)}{relatedEvidence.length === 0 && <div className="exit-evidence-snippet"><span>No evidence record</span><p>The system could not find a supporting source for this claim.</p></div>}</div></div><label className="exit-question-label" htmlFor={`answer-${question.id}`}>{question.prompt}</label><textarea id={`answer-${question.id}`} rows={4} value={question.answer ?? ""} disabled={question.answerSubmitted || busyId === question.id || submitting} placeholder="Add the context you remember. A short answer is fine." onChange={(event) => updateLocal(question.id, { answer: event.target.value, answerStatus: "draft" })} /><div className="exit-question-actions"><button type="button" className="exit-secondary-action" disabled={question.answerSubmitted || submitting || busyId === question.id} onClick={() => void saveQuestion(question, "draft")}><Save size={13} />Save draft</button><button type="button" className="exit-secondary-action" disabled={question.answerSubmitted || submitting || busyId === question.id} onClick={() => { updateLocal(question.id, { answer: "I don't know.", answerStatus: "dont-know" }); void saveQuestion({ ...question, answer: "I don't know." }, "dont-know"); }}><CircleDashed size={13} />I don’t know</button><button type="button" className="exit-secondary-action exit-skip-action" disabled={question.answerSubmitted || submitting || busyId === question.id} onClick={() => { updateLocal(question.id, { answer: "", answerStatus: "skipped" }); void saveQuestion({ ...question, answer: "" }, "skipped"); }}><SkipForward size={13} />Skip this question</button></div></div></article>;
      })}</div>
      <div className="exit-submit-bar"><div><span className="exit-submit-label">Your answers are saved privately for reviewer follow-up.</span><span className="exit-submit-progress">{progress}</span></div><div><button type="button" className="button button-secondary" disabled={submitting} onClick={() => void saveAllDrafts()}><Save size={14} />Save all drafts</button><button type="submit" className="button button-primary" disabled={submitting}>{submitting ? "Submitting…" : "Submit answers"}<Send size={14} /></button></div></div>
    </form>}
  </div>;
}
