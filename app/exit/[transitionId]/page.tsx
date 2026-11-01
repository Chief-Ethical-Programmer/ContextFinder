import Link from "next/link";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { ExitInterview } from "@/components/exit/exit-interview";
import { getEvidence, getExitQuestions, getTransition } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function ExitQuestionsPage({ params }: { params: Promise<{ transitionId: string }> }) {
  const { transitionId } = await params;
  const [transition, questions, evidence] = await Promise.all([getTransition(transitionId), getExitQuestions(transitionId), getEvidence(transitionId)]);
  if (!transition) return <div className="page-wrap placeholder-page"><div className="placeholder-card"><span className="placeholder-icon"><MessageSquareText size={22} /></span><h1>Transition not found</h1><p>This exit interview may have been removed or the address is incorrect.</p><Link className="back-link" href="/admin"><ArrowLeft size={14} />Back to workspace</Link></div></div>;
  return <ExitInterview transition={transition} initialQuestions={questions} evidence={evidence} />;
}
