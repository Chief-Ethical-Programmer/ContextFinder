import { AdminRoleGate } from "@/components/auth/admin-role-gate";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminRoleGate>{children}</AdminRoleGate>;
}
