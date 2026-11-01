import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getSupervisedProjects, getTransitions } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [projects, transitions] = await Promise.all([getSupervisedProjects(), getTransitions()]);
  return <AdminDashboard projects={projects} transitions={transitions} />;
}
