import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function LoginPage() {
  return <div className="auth-page"><div className="auth-aside"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-aside-content"><div className="auth-wordmark"><span className="brand-mark">c<span>·</span></span><span>ContextFinder</span></div><div className="auth-message"><span className="eyebrow auth-eyebrow">THE CONTEXT STAYS WITH THE WORK</span><h1>When people move on,<br /><span>the work moves forward.</span></h1><p>Keep the decisions, ownership and hard-won know-how connected to the evidence behind them.</p><div className="auth-proof"><span className="auth-proof-icon"><span className="status-dot" /></span><span><strong>Evidence linked by default</strong><small>Clear sources. Clear trust. Clear access.</small></span></div></div><div className="auth-aside-foot">A careful handover for teams in transition.</div></div></div><div className="auth-main"><ThemeToggle /><LoginForm /><div className="auth-main-foot"><span>ContextFinder demo</span></div></div></div>;
}
