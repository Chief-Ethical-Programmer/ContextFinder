import re

from app.llm.schemas import CandidateClaim, CandidateEvidence, ChunkInput, ClaimLite, RoleViewDraft


def _claim(chunk: ChunkInput, claim_type: str, statement: str, subject: str, status: str | None = None, excerpt: str | None = None, artifact: str | None = None, resolved: bool = True) -> CandidateClaim:
    return CandidateClaim(type=claim_type, statement=statement, subject_key=subject, status_value=status, evidence=[CandidateEvidence(source_record_id=chunk.source_record_id, excerpt=excerpt or chunk.text)], referenced_artifact={"name": artifact, "resolved": resolved} if artifact else None)


class FakeClient:
    async def extract_claims(self, chunk: ChunkInput) -> list[CandidateClaim]:
        text = chunk.text
        lowered = text.lower()
        claims: list[CandidateClaim] = []
        if "terraform migration is mostly done" in lowered:
            claims.append(_claim(chunk, "task", "Terraform migration is mostly done.", "terraform_migration", "mostly_done", "Terraform migration is mostly done"))
        if "3 of eleven" in lowered or "3 of 11" in lowered:
            claims.append(_claim(chunk, "task", "Three of eleven Terraform modules are merged.", "terraform_migration", "3/11_modules_merged", "Three of eleven modules are merged"))
        if "rollback procedure" in lowered:
            claims.append(_claim(chunk, "next_action", "The rollback procedure must be located or documented.", "rollback_procedure", artifact="rollback procedure", resolved=False))
        threshold = re.search(r"threshold from (\d+%) to (\d+%)", text, re.IGNORECASE)
        if threshold:
            claims.append(_claim(chunk, "decision", f"Kubernetes autoscaling threshold changed from {threshold.group(1)} to {threshold.group(2)}.", "k8s_autoscale_cpu_threshold", threshold.group(2), threshold.group(0)))
        if "prometheus" in lowered and "alert" in lowered:
            claims.append(_claim(chunk, "risk", "Prometheus reports recurring checkout latency alerts after deployments.", "checkout_latency_alerts", "recurring"))
        if "workaround" in lowered or "restart the worker" in lowered:
            claims.append(_claim(chunk, "next_action", "Restart the worker once as the documented checkout alert workaround.", "checkout_alert_workaround", "restart_worker_once"))
        if "jenkins" in lowered and "deployment" in lowered:
            claims.append(_claim(chunk, "task", "Deployments use the Jenkins pipeline.", "deployment_pipeline", "jenkins"))
        if "owns" in lowered or "owner" in lowered:
            claims.append(_claim(chunk, "owner", text.split(".")[0], "project_ownership"))
        if "depends" in lowered:
            claims.append(_claim(chunk, "dependency", text.split(".")[0], "project_dependency"))
        if "vendor renewal budget" in lowered:
            claims.append(_claim(chunk, "decision", "The vendor renewal budget is approved at the lead level.", "vendor_renewal", "approved"))
        return claims

    async def write_exit_question(self, claim: ClaimLite) -> str:
        return f"Can you clarify this claim: {claim.statement}"

    async def write_role_view(self, claims: list[ClaimLite], role: str) -> RoleViewDraft:
        return RoleViewDraft(summary=f"{role.replace('_', ' ').title()} handover with {len(claims)} approved claims.", plan_30_60_90={"30": [], "60": [], "90": []}, claim_ids=[claim.id for claim in claims])
