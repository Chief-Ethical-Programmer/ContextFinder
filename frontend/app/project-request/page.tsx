import Link from "next/link";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { ProjectRequestForm } from "@/components/projects/project-request-form";

export default function ProjectRequestPage() {
  return <main className="page-wrap project-request-page"><div className="breadcrumb"><Link href="/login">Sign in</Link><span>/</span><span>Project request</span></div><Link href="/login" className="back-link"><ArrowLeft size={14} />Back</Link><section className="project-request-card"><div className="form-step-icon"><FolderPlus size={19} /></div><span className="eyebrow">FOR DEPARTING MEMBERS</span><h1>Request a project</h1><p>Submit the project name, owning team, and brief. Add a public GitHub repository and project documents to start analysis and prepare your handover questions.</p><ProjectRequestForm /></section></main>;
}
