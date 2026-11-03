import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Clock3, LockKeyhole, UsersRound } from "lucide-react";
import { backendGet } from "@/lib/api/server-backend";

type CurrentUser = { name: string; role: string; team?: string };

export default async function PendingOnboardingPage() {
  const user = await backendGet("/me") as CurrentUser;
  if (user.role !== "incoming") redirect("/login");

  const team = user.team?.trim();
  return <div className="page-wrap onboarding-gate-page">
    <div className="breadcrumb"><span>Onboarding</span><span>/</span><span>Assignment</span></div>
    <section className="onboarding-gate-card onboarding-pending-card">
      <div className="gate-illustration"><span className="gate-ring gate-ring-outer" /><span className="gate-ring gate-ring-inner" /><span className="gate-lock"><Clock3 size={21} /></span></div>
      <span className="eyebrow">ONBOARDING QUEUE</span>
      <h1>Welcome, {user.name.split(" ")[0]}.</h1>
      <p>{team ? <>You’re registered for the <strong>{team}</strong> team.</> : "Your account is registered."} There isn’t a handover assigned to you yet. The admin assigns approved projects to a new joinee from the matching team.</p>
      <div className="gate-status"><span className="status-dot status-amber" /><span>Waiting for project assignment</span><span className="gate-status-divider" /><UsersRound size={14} /><span>{team || "Team not set"}</span></div>
      <div className="onboarding-pending-note"><LockKeyhole size={15} /><span>Project details stay private until the admin assigns a handover to your account.</span></div>
      <div className="onboarding-pending-actions"><a className="button button-primary" href="/onboarding/pending">Check assignment status <ArrowRight size={14} /></a><Link className="back-link" href="/login">Return to sign in</Link></div>
    </section>
  </div>;
}
