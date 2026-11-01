import { Suspense } from "react";
import { TransitionSetup } from "@/components/admin/transition-setup";

export default function NewTransitionPage() {
  return <Suspense fallback={<div className="page-wrap"><div className="loading-panel">Loading transition setup…</div></div>}><TransitionSetup /></Suspense>;
}
