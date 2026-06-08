from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

from tools.scoring import priority_score


@dataclass
class Task:
    type: str
    subtype: str
    assign_to: str
    page: str | None = None
    severity: int = 3
    impact: int = 3
    effort: int = 3
    priority_score: float = 0.0
    status: str = "READY"
    evidence: str = ""
    data: dict[str, Any] = field(default_factory=dict)
    blocks: list[str] = field(default_factory=list)
    task_id: str = field(default_factory=lambda: f"T{uuid.uuid4().hex[:6].upper()}")

    def compute_score(self) -> float:
        self.priority_score = priority_score(self.severity, self.impact, self.effort)
        return self.priority_score

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


def tasks_to_graph(tasks: list[Task]) -> dict[str, Any]:
    scored = sorted(tasks, key=lambda t: t.priority_score, reverse=True)
    return {
        "tasks": [t.to_dict() for t in scored[:15]],
        "blocker_count": sum(1 for t in tasks if t.severity >= 5),
        "total_tasks": len(tasks),
    }
