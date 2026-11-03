import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { ExitInterview } from "@/components/exit/exit-interview";
import { getExitEvidence, getExitQuestions, getTransition } from "@/lib/api/client";
import type { ExitQuestion, Evidence, Transition } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ExitQuestionsPage({ params }: { params: Promise<{ transitionId: string }> }) {
  const { transitionId } = await params;
  let transition: Transition | undefined;
  let questions: ExitQuestion[];
  let evidence: Evidence[];
  try {
    [transition, questions, evidence] = await Promise.all([getTransition(transitionId), getExitQuestions(transitionId), getExitEvidence(transitionId)]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("session") || message.includes("Insufficient role")) redirect("/login");
    throw error;
  }
  if (!transition) return <div className="page-wrap placeholder-page"><div className="placeholder-card"><span className="placeholder-icon"><MessageSquareText size={22} /></span><h1>Transition not found</h1><p>This exit interview may have been removed or the address is incorrect.</p><Link className="back-link" href="/admin"><ArrowLeft size={14} />Back to workspace</Link></div></div>;
  return <ExitInterview transition={transition} initialQuestions={questions} evidence={evidence} />;
}
