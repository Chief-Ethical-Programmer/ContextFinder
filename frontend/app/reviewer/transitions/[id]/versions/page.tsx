import Link from "next/link";
import { ArrowLeft, History, ShieldCheck } from "lucide-react";
import { getTransition, getVersions } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [transition, versions] = await Promise.all([getTransition(id), getVersions(id)]);
  if (!transition) return <div className="page-wrap placeholder-page"><div className="placeholder-card"><h1>Transition not found</h1><Link href="/admin" className="back-link"><ArrowLeft size={14} />Back to transitions</Link></div></div>;
  return <div className="page-wrap standalone-versions-page"><div className="breadcrumb"><Link href="/admin">Workspace</Link><span>/</span><span>{transition.project}</span><span>/</span><span>Versions</span></div><Link className="back-link" href={`/admin/transitions/${id}/review`}><ArrowLeft size={14} />Back to review</Link><div className="versions-page-heading"><span className="versions-page-icon"><History size={18} /></span><div><div className="eyebrow">AUDITABLE CHANGE RECORD · {transition.project}</div><h1>{transition.project} versions</h1><p>Every claim edit and reviewer decision is retained as a version.</p></div></div><div className="versions-page-list">{versions.map((version) => <article className="version-entry" key={version.version}><div className="version-entry-marker">{version.published ? <ShieldCheck size={14} /> : <History size={13} />}</div><div className="version-entry-content"><div className="version-entry-title"><strong>Version {version.version}</strong>{version.published && <span>Published</span>}</div><p>{version.summary}</p><small>{version.actor} · {version.createdAt}</small>{version.remark && <blockquote>“{version.remark}”</blockquote>}</div></article>)}</div></div>;
}

