import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { RoleSwitcher } from "@/components/shared/role-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import "./globals.css";
import "./phase2.css";
import "./phase3.css";
import "./phase4.css";
import "./phase5.css";
import "./phase6.css";
import "./phase7.css";

export const metadata: Metadata = {
  title: "ContextFinder · Keep the context",
  description: "A clear, evidence-linked handover for teams in transition.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers><div className="app-frame"><header className="topbar"><a className="brand" href="/" aria-label="ContextFinder home"><span className="brand-mark">c<span>·</span></span><span className="brand-name">context<span>finder</span></span></a><div className="topbar-right"><span className="environment-pill"><span className="status-dot" />Demo workspace</span><div className="topbar-divider" /><ThemeToggle /><RoleSwitcher /><button className="avatar-button" type="button" aria-label="Account menu">JR</button></div></header><main>{children}</main><footer className="app-footer"><span>ContextFinder</span><span><span className="footer-dot" /> Demo data is synthetic</span><span>Evidence first. People decide.</span></footer></div></Providers></body></html>;
}
