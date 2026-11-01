"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginAccount } from "@/lib/api/browser";
import { useRoleStore } from "@/lib/state/use-role-store";

type LoginRole = "admin" | "departing" | "incoming";

const demoEmails: Record<LoginRole, string> = {
  admin: "admin@cloudcart.demo",
  departing: "alex@cloudcart.demo",
  incoming: "ryan@cloudcart.demo",
};

export function LoginForm() {
  const router = useRouter();
  const setRole = useRoleStore((state) => state.setRole);
  const [role, setLoginRole] = useState<LoginRole>("admin");
  const [email, setEmail] = useState(demoEmails.admin);
  const [password, setPassword] = useState("contextfinder-demo");
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
      try { window.localStorage.setItem("contextfinder:access-token:v1", session.accessToken); } catch { /* Session remains usable for the current page. */ }
      setRole(role === "admin" ? "reviewer" : role);
      router.push(role === "admin" ? "/admin" : role === "departing" ? "/exit/cf-cloudcart-01" : "/onboarding/cf-cloudcart-01");
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
    <div className="login-role-select-wrap"><UserRound size={16} aria-hidden="true" /><select id="login-role" className="login-role-select" value={role} onChange={(event) => { const nextRole = event.target.value as LoginRole; setLoginRole(nextRole); setEmail(demoEmails[nextRole]); }}><option value="admin">Admin</option><option value="departing">Departing member</option><option value="incoming">New joinee</option></select><ChevronDown size={14} aria-hidden="true" /></div>
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
