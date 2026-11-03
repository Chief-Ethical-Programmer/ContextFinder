import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { OnboardingDashboard } from "@/components/onboarding/onboarding-dashboard";
import { getOnboardingView } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ params }: { params: Promise<{ transitionId: string }> }) {
  const { transitionId } = await params;
  try {
    const initialView = await getOnboardingView(transitionId);
    return <OnboardingDashboard initialView={initialView} />;
  } catch {
    return <div className="page-wrap onboarding-gate-page"><div className="breadcrumb"><span>Onboarding</span><span>/</span><span>Project handover</span></div><div className="onboarding-gate-card"><div className="gate-illustration"><span className="gate-ring gate-ring-outer" /><span className="gate-ring gate-ring-inner" /><span className="gate-lock"><LockKeyhole size={21} /></span></div><span className="eyebrow">HANDOVER IN PROGRESS</span><h1>Your handover is being prepared.</h1><p>The project team is reviewing the evidence. Nothing is visible here until a reviewer publishes the handover.</p><div className="gate-status"><span className="status-dot status-amber" /><span>Not published yet</span><span className="gate-status-divider" /><ShieldCheck size={14} /><span>Your view is access controlled</span></div><Link href="/login" className="back-link"><ArrowLeft size={14} />Return to sign in</Link></div></div>;
  }
}
