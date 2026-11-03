import { ReviewerRoleGate } from "@/components/review/reviewer-role-gate";

export default function ReviewerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ReviewerRoleGate>{children}</ReviewerRoleGate>;
}
