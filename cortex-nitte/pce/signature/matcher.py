"""Past-incident registry + LSH-banded matcher.

The matcher keeps a record of every incident the engine has ever ingested,
along with its token set and MinHash signature. At query time it returns
top-K behaviorally similar past incidents using LSH banding for candidate
generation and exact-Jaccard rerank for precision.

Online updates (the Memory Evolution axis): per-pair weight adjustments
applied at rerank time. When a remediation event arrives, Person C's layer
can call `reinforce(query_id, match_id, success=True)` to nudge that pair
closer in future queries. Stored as a sparse dict to keep cost bounded.
"""

from pce.signature import abstraction, shape


# LSH banding parameters: 128 perms split into 32 bands of 4 rows.
# Two signatures collide in a band when all 4 rows match — corresponds to
# a similarity threshold of (1/b)^(1/r) ≈ 0.42 for the candidate set.
NUM_BANDS = 32
ROWS_PER_BAND = 4
assert NUM_BANDS * ROWS_PER_BAND == shape.NUM_PERMUTATIONS


class IncidentRecord:
    __slots__ = ("incident_id", "tokens", "signature", "meta")

    def __init__(self, incident_id: str, tokens: set, signature: tuple, meta: dict):
        self.incident_id = incident_id
        self.tokens = tokens
        self.signature = signature
        self.meta = meta


class Matcher:
    """Registry of past incidents + LSH index."""

    def __init__(self) -> None:
        self._records: dict[str, IncidentRecord] = {}
        # band_idx -> band_key (tuple) -> set of incident_ids
        self._lsh: list[dict[tuple, set[str]]] = [
            {} for _ in range(NUM_BANDS)
        ]
        # Online evolution: (a, b) -> weight delta on similarity, where a < b lexically.
        self._pair_weights: dict[tuple[str, str], float] = {}

    # ---- ingest-side ----

    def register(self, engine, incident_id: str) -> None:
        """Compute and store a record for an incident. Idempotent."""
        if incident_id in self._records:
            return
        tokens, meta = abstraction.build_tokens(engine, incident_id)
        if not tokens:
            # Nothing to match on; record an empty placeholder so we don't
            # retry repeatedly during ingest.
            self._records[incident_id] = IncidentRecord(incident_id, set(), tuple(), meta)
            return
        sig = shape.minhash(tokens)
        rec = IncidentRecord(incident_id, tokens, sig, meta)
        self._records[incident_id] = rec
        self._add_to_lsh(rec)

    def has(self, incident_id: str) -> bool:
        return incident_id in self._records

    def all_incident_ids(self) -> list[str]:
        return list(self._records.keys())

    def get(self, incident_id: str) -> IncidentRecord | None:
        return self._records.get(incident_id)

    # ---- query-side ----

    def find_similar(
        self,
        engine,
        signal_incident_id: str,
        top_k: int = 5,
        min_similarity: float = 0.15,
    ) -> list[tuple[str, float, set[str]]]:
        """Return up to top_k (past_incident_id, similarity, overlapping_tokens).

        The query incident is registered first if not already present so the
        same code path serves train-time and query-time.
        """
        self.register(engine, signal_incident_id)
        query = self._records[signal_incident_id]
        if not query.tokens:
            return []

        # LSH candidate generation
        candidates: set[str] = set()
        for b in range(NUM_BANDS):
            key = query.signature[b * ROWS_PER_BAND:(b + 1) * ROWS_PER_BAND]
            bucket = self._lsh[b].get(key)
            if bucket:
                candidates.update(bucket)
        candidates.discard(signal_incident_id)

        # Fallback: if LSH found nothing (very dissimilar signatures), broaden
        # to all records. Bench scale (<100 incidents) keeps this cheap.
        if not candidates:
            candidates = set(self._records.keys())
            candidates.discard(signal_incident_id)

        scored: list[tuple[str, float, set[str]]] = []
        for cand_id in candidates:
            cand = self._records[cand_id]
            if not cand.tokens:
                continue
            sim = shape.exact_jaccard(query.tokens, cand.tokens)
            sim += self._pair_weight(signal_incident_id, cand_id)
            sim = max(0.0, min(1.0, sim))
            if sim < min_similarity:
                continue
            overlap = query.tokens & cand.tokens
            scored.append((cand_id, sim, overlap))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    # ---- evolution ----

    def reinforce(self, query_id: str, match_id: str, success: bool, magnitude: float = 0.05) -> None:
        """Nudge the similarity between two incidents up (success) or down (failure).

        Bounded to [-0.2, +0.2] so it can refine ordering without overwhelming
        the underlying Jaccard score.
        """
        key = (min(query_id, match_id), max(query_id, match_id))
        delta = magnitude if success else -magnitude
        new = self._pair_weights.get(key, 0.0) + delta
        new = max(-0.2, min(0.2, new))
        self._pair_weights[key] = new

    def _pair_weight(self, a: str, b: str) -> float:
        key = (a, b) if a < b else (b, a)
        return self._pair_weights.get(key, 0.0)

    # ---- internals ----

    def _add_to_lsh(self, rec: IncidentRecord) -> None:
        for b in range(NUM_BANDS):
            key = rec.signature[b * ROWS_PER_BAND:(b + 1) * ROWS_PER_BAND]
            self._lsh[b].setdefault(key, set()).add(rec.incident_id)


def render_rationale(overlap_tokens: set[str], limit: int = 5) -> str:
    """Human-readable rationale for an incident match, derived from overlapping tokens.

    Picks the highest-signal tokens (preferring deploys, cross-service errors,
    high-tier metrics) and stitches them into a short clause.
    """
    if not overlap_tokens:
        return "no overlapping behavioral tokens"

    priority = []
    for t in overlap_tokens:
        score = 0
        if t.startswith("deploy"):
            score = 4
        elif t.startswith("cross_service_error"):
            score = 4
        elif "high" in t:
            score = 3
        elif t.startswith("trace_touches_self"):
            score = 3
        elif t.startswith("metric"):
            score = 2
        else:
            score = 1
        priority.append((score, t))
    priority.sort(reverse=True)
    chosen = [t for _, t in priority[:limit]]
    return "shared behavior: " + ", ".join(chosen)
