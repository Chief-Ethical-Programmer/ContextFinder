import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getIncomingCandidates, getTransitions } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [transitions, incomingCandidates] = await Promise.all([getTransitions(), getIncomingCandidates()]);
  return <AdminDashboard transitions={transitions} incomingCandidates={incomingCandidates} />;
}
