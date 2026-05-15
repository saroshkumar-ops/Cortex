"""Operational feedback loop — turn ingested remediations into matcher updates.

When a `remediation` event arrives for an incident X that the matcher had
returned matches for at some prior query, we have a graded signal:
  - outcome = resolved  -> the matched past incident(s) were the right family;
                            tighten similarity for that pair so future queries
                            rank them higher.
  - outcome = failed    -> wrong family; loosen.

We don't persist past queries' match lists indefinitely — that would blow
up memory. Instead, when an incident is *registered* (signal seen), we also
recompute its matches against past resolved incidents and stash a short
"recent matches" list. The next remediation event for that incident
consults that list.

This is the visible "Memory Evolution" demo: same query, ingested with vs.
without train remediations, produces different rankings.
"""

_RESOLVED_OUTCOMES = {"resolved", "success", "fixed", "ok"}


class FeedbackLoop:
    """Bridges remediation events to matcher.reinforce() calls."""

    __slots__ = ("_recent_matches",)

    def __init__(self) -> None:
        # incident_id -> list[(past_incident_id, similarity)]
        self._recent_matches: dict[str, list[tuple[str, float]]] = {}

    def record_query_matches(
        self,
        incident_id: str,
        matches: list[tuple[str, float, set[str]]],
        keep_top: int = 3,
    ) -> None:
        """Stash a query's top matches so a later remediation can grade them."""
        self._recent_matches[incident_id] = [(m[0], m[1]) for m in matches[:keep_top]]

    def on_remediation(self, engine, remediation_event: dict) -> int:
        """Process a remediation event; return how many pairs were reinforced.

        Idempotent per remediation event id — but cheap enough that we don't
        currently dedupe.
        """
        inc_id = remediation_event.get("incident_id")
        if not inc_id:
            return 0
        matches = self._recent_matches.get(inc_id)
        if not matches:
            return 0
        outcome = (remediation_event.get("outcome") or "").lower()
        success = outcome in _RESOLVED_OUTCOMES

        for past_id, _sim in matches:
            engine.matcher.reinforce(inc_id, past_id, success=success, magnitude=0.05)
        return len(matches)
