import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { OnboardingDashboard } from "@/components/onboarding/onboarding-dashboard";
import { getOnboardingView, getTransition } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ params }: { params: Promise<{ transitionId: string }> }) {
  const { transitionId } = await params;
  const transition = await getTransition(transitionId);
  if (!transition) return <div className="page-wrap placeholder-page"><div className="placeholder-card"><span className="placeholder-icon"><LockKeyhole size={22} /></span><h1>Handover not found</h1><p>We couldn’t find a handover for this address.</p><Link href="/login" className="text-link">Return to sign in</Link></div></div>;
  if (transition.status !== "Approved") return <div className="page-wrap onboarding-gate-page"><div className="breadcrumb"><span>Onboarding</span><span>/</span><span>{transition.project}</span></div><div className="onboarding-gate-card"><div className="gate-illustration"><span className="gate-ring gate-ring-outer" /><span className="gate-ring gate-ring-inner" /><span className="gate-lock"><LockKeyhole size={21} /></span></div><span className="eyebrow">HANDOVER IN PROGRESS</span><h1>Your handover is being prepared.</h1><p>The project team is reviewing the evidence. Nothing is visible here until a reviewer publishes the handover.</p><div className="gate-status"><span className="status-dot status-amber" /><span>Not published yet</span><span className="gate-status-divider" /><ShieldCheck size={14} /><span>Your view is access controlled</span></div><Link href="/admin" className="back-link"><ArrowLeft size={14} />Back to workspace</Link></div></div>;
  const initialView = await getOnboardingView(transitionId, "Technical successor");
  return <OnboardingDashboard initialView={initialView} />;
}
