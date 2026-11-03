from sqlalchemy import not_, or_

from app.db.models import KnowledgeClaim


def is_response_copy():
    """Match legacy claim rows that copied an answer already attached to its source claim."""
    return or_(
        KnowledgeClaim.flags.has_key("originalClaimId"),  # type: ignore[attr-defined]
        KnowledgeClaim.statement.ilike("Leaver response:%"),
    )


def reviewable_claim_filter():
    return not_(is_response_copy())
