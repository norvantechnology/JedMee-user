"""Priority scoring for manager tasks and recommendations."""


def priority_score(severity: int, impact: int, effort: int) -> float:
    """severity × impact × (6 - effort), range 1–125."""
    severity = max(1, min(5, severity))
    impact = max(1, min(5, impact))
    effort = max(1, min(5, effort))
    return float(severity * impact * (6 - effort))
