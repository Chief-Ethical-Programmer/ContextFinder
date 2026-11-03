import { DepartingSourceUpload } from "@/components/projects/departing-source-upload";

export default async function DepartingUploadPage({ params }: { params: Promise<{ transitionId: string }> }) {
  const { transitionId } = await params;
  return <main className="page-wrap setup-page"><div className="breadcrumb"><a href="/login">Workspace</a><span>/</span><span>Upload handover sources</span></div><DepartingSourceUpload transitionId={transitionId} analysisEnabled /></main>;
}
