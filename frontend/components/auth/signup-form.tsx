"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound, User } from "lucide-react";

type SignupRole = "departing" | "incoming" | "reviewer" | "admin";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SignupRole>("incoming");
  const [team, setTeam] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a complete work email, for example name@company.com.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, team: role === "reviewer" || role === "incoming" ? team : undefined, password, adminSignupCode: role === "admin" ? adminCode : undefined }),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = response.status >= 500
          ? "The API could not save this account. Restart the backend and check that PostgreSQL is ready, then try again."
          : result.error ?? "Account could not be created.";
        throw new Error(message);
      }
      setCreated(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account could not be created.");
    } finally {
      setLoading(false);
    }
  }

  if (created) return <section className="login-panel signup-panel" aria-live="polite">
    <div className="login-kicker"><ShieldCheck size={15} /> ACCOUNT CREATED</div>
    <h2 id="signup-title">You’re all set</h2>
    <p className="login-intro">Your account has been saved. Sign in with your new email and password.</p>
    <p className="signup-access-note">{role === "incoming" ? `Your team is recorded as ${team}. A workspace admin can match you to approved handovers for this team.` : "A workspace admin must assign your email to a project handover before its information becomes visible to you."}</p>
    <Link className="login-submit signup-link-button" href="/login">Continue to sign in <ArrowRight size={16} /></Link>
  </section>;

  return <section className="login-panel signup-panel" aria-labelledby="signup-title">
    <div className="login-kicker"><ShieldCheck size={15} /> SECURE WORKSPACE</div>
    <h2 id="signup-title">Create your account</h2>
    <p className="login-intro">Join a project workspace to take part in a handover.</p>
    <form className="login-form signup-form" onSubmit={submit}>
      <label htmlFor="signup-name">Full name</label>
      <div className="login-input-wrap"><User size={16} aria-hidden="true" /><input id="signup-name" name="name" autoComplete="name" required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></div>
      <label htmlFor="signup-role">Your role</label>
      <div className="login-role-select-wrap"><UserRound size={16} aria-hidden="true" /><select id="signup-role" className="login-role-select" value={role} onChange={(event) => setRole(event.target.value as SignupRole)}><option value="incoming">New joinee</option><option value="departing">Departing member</option><option value="reviewer">Team lead reviewer</option><option value="admin">Admin (invitation required)</option></select><ChevronDown size={14} aria-hidden="true" /></div>
      {(role === "reviewer" || role === "incoming") && <><label htmlFor="signup-team">{role === "incoming" ? "Team you are joining" : "Team"}</label><div className="login-input-wrap"><UserRound size={16} aria-hidden="true" /><input id="signup-team" name="team" required minLength={2} maxLength={120} value={team} onChange={(event) => setTeam(event.target.value)} placeholder="For example, Platform Infrastructure" /></div><small className="signup-team-hint">{role === "incoming" ? "The admin will use this team to match projects for your onboarding." : "Your workspace admin will assign you to handovers for this team."}</small></>}
      <label htmlFor="signup-email">Work email</label>
      <div className="login-input-wrap"><Mail size={16} aria-hidden="true" /><input id="signup-email" name="email" type="email" autoComplete="email" required maxLength={320} pattern="[^\s@]+@[^\s@]+\.[^\s@]+" title="Enter an email address with a domain, such as name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></div>
      {role === "admin" && <><label htmlFor="signup-admin-code">Admin invitation code</label><div className="login-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input id="signup-admin-code" autoComplete="off" required value={adminCode} onChange={(event) => setAdminCode(event.target.value)} placeholder="Invitation code" /></div></>}
      <label htmlFor="signup-password">Password</label>
      <div className="login-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input id="signup-password" name="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} maxLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 to 8 characters" /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      <label htmlFor="signup-confirm-password">Confirm password</label>
      <div className="login-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input id="signup-confirm-password" type="password" autoComplete="new-password" required minLength={6} maxLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></div>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="login-submit" type="submit" disabled={loading}>{loading ? "Creating account…" : "Create account"}<ArrowRight size={16} /></button>
    </form>
    <p className="auth-account-link">Already registered? <Link href="/login">Sign in</Link></p>
    <div className="login-demo-note"><span className="status-dot" /> Your password is encrypted before storage</div>
  </section>;
}
