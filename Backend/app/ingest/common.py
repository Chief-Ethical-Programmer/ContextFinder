from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class IngestedRecord:
    external_id: str
    kind: str
    text: str
    author: str = ""
    occurred_at: datetime | None = None
    url: str | None = None
    metadata: dict = field(default_factory=dict)
