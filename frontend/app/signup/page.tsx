import { SignupForm } from "@/components/auth/signup-form";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import "./signup.css";

export default function SignupPage() {
  return <div className="auth-page"><div className="auth-aside"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-aside-content"><div className="auth-wordmark"><span className="brand-mark">c<span>·</span></span><span>ContextFinder</span></div><div className="auth-message"><span className="eyebrow auth-eyebrow">THE CONTEXT STAYS WITH THE WORK</span><h1>Make every handover<br /><span>easier to continue.</span></h1><p>Join your team and keep decisions, ownership and hard-won know-how connected to their evidence.</p><div className="auth-proof"><span className="auth-proof-icon"><span className="status-dot" /></span><span><strong>Evidence linked by default</strong><small>Clear sources. Clear trust. Clear access.</small></span></div></div><div className="auth-aside-foot">A careful handover for teams in transition.</div></div></div><div className="auth-main"><ThemeToggle /><SignupForm /><div className="auth-main-foot"><span>ContextFinder</span><span>Access is assigned by your workspace admin</span></div></div></div>;
}
