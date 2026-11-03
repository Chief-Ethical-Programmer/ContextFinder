"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginAccount } from "@/lib/api/browser";
import { useRoleStore } from "@/lib/state/use-role-store";

type LoginRole = "admin" | "reviewer" | "departing" | "incoming";

export function LoginForm() {
  const router = useRouter();
  const setRole = useRoleStore((state) => state.setRole);
  const [role, setLoginRole] = useState<LoginRole>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await loginAccount(email, password);
      if (session.user.role !== role) throw new Error(`This account is registered as ${session.user.role}. Select that role and try again.`);
      window.dispatchEvent(new Event("contextfinder:account-updated"));
      setRole(role);
      if (role === "reviewer") { router.push("/reviewer"); return; }
      if (role === "admin") { router.push("/admin"); return; }
      const dashboardResponse = await fetch("/api/backend/dashboard", { cache: "no-store" });
      const dashboard = await dashboardResponse.json();
      if (!dashboardResponse.ok) throw new Error(dashboard.detail ?? "Could not load your handovers.");
      const handovers = role === "departing" ? dashboard.departing : dashboard.onboarding;
      const first = Array.isArray(handovers) ? handovers[0] : undefined;
      if (!first?.id && role === "departing") { router.push("/project-request"); return; }
      if (!first?.id && role === "incoming") { router.push("/onboarding/pending"); return; }
      if (!first?.id) throw new Error("There is no handover assigned to this account yet.");
      router.push(role === "departing" ? (["awaiting_project_approval", "awaiting_reviewer_assignment"].includes(first.status) ? "/project-request" : first.status === "ingesting" || first.status === "sources_ready" ? `/departing/${first.id}/upload` : `/exit/${first.id}`) : `/onboarding/${first.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t sign in. Please try again.");
      setLoading(false);
    }
  }

  return <section className="login-panel" aria-labelledby="login-title">
    <div className="login-kicker"><ShieldCheck size={15} /> SECURE WORKSPACE</div>
    <h2 id="login-title">Welcome back</h2>
    <p className="login-intro">Sign in to continue a project handover.</p>
      <label className="login-role-label" htmlFor="login-role">Your role</label>
    <div className="login-role-select-wrap"><UserRound size={16} aria-hidden="true" /><select id="login-role" className="login-role-select" value={role} onChange={(event) => { setLoginRole(event.target.value as LoginRole); setEmail(""); setPassword(""); setShowPassword(false); setError(""); }}><option value="admin">Admin</option><option value="reviewer">Team lead reviewer</option><option value="departing">Departing member</option><option value="incoming">New joinee</option></select><ChevronDown size={14} aria-hidden="true" /></div>
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="login-email">Work email</label>
      <div className="login-input-wrap"><Mail size={16} aria-hidden="true" /><input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <label htmlFor="login-password">Password</label>
      <div className="login-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="login-submit" type="submit" disabled={loading}>{loading ? "Opening demo…" : "Continue to workspace"}<ArrowRight size={16} /></button>
    </form>
    <p className="auth-account-link">New to ContextFinder? <Link href="/signup">Create an account</Link></p>
    <div className="login-demo-note"><span className="status-dot" /> Sign in with your registered work email and password</div>
  </section>;
}
