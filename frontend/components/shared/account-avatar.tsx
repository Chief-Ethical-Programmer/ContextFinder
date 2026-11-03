"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { useRoleStore } from "@/lib/state/use-role-store";

type Account = { name: string; email: string; role: string };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function AccountAvatar() {
  const pathname = usePathname();
  const router = useRouter();
  const setRole = useRoleStore((state) => state.setRole);
  const menuRef = useRef<HTMLDivElement>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const loadAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/backend/me", { cache: "no-store" });
      if (!response.ok) { setAccount(null); return; }
      const user = await response.json();
      setAccount({ name: String(user.name ?? ""), email: String(user.email ?? ""), role: String(user.role ?? "") });
    } catch { setAccount(null); }
  }, []);

  useEffect(() => {
    void loadAccount();
    window.addEventListener("contextfinder:account-updated", loadAccount);
    return () => window.removeEventListener("contextfinder:account-updated", loadAccount);
  }, [loadAccount, pathname]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out request failed.");
      setAccount(null);
      setRole(null);
      window.dispatchEvent(new Event("contextfinder:account-updated"));
      setOpen(false);
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const label = account?.name ? `${account.name} account` : "Account";
  return <div className="account-menu" ref={menuRef}>
    <button className="avatar-button account-menu-trigger" type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { setSignOutError(""); setOpen((value) => !value); }}>
      {account?.name ? initials(account.name) : <UserRound size={16} aria-hidden="true" />}
    </button>
    {open && <div className="account-menu-popover" role="menu">
      {account ? <>
        <div className="account-menu-identity"><strong>{account.name || "Your account"}</strong><span>{account.email}</span></div>
        <button type="button" className="account-menu-signout" role="menuitem" onClick={() => void signOut()} disabled={signingOut}><LogOut size={15} />{signingOut ? "Signing out…" : "Sign out"}</button>
        {signOutError && <p className="account-menu-error" role="alert">{signOutError}</p>}
      </> : <>
        <p className="account-menu-signed-out">You’re not signed in.</p>
        <a className="account-menu-login" href="/login" role="menuitem" onClick={() => setOpen(false)}>Go to welcome page</a>
      </>}
    </div>}
  </div>;
}
