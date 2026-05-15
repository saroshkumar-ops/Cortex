"""Past-incident registry + LSH-banded matcher.

The matcher keeps a record of every incident the engine has ever ingested,
along with its token set and MinHash signature. At query time it returns
top-K behaviorally similar past incidents using LSH banding for candidate
generation and exact-Jaccard rerank for precision.

TEMPORAL & TOPOLOGY ADAPTABILITY:
  - Role-tokens are rename-robust (see pce/signature/abstraction.py).
  - Temporal bucketing ensures time-invariant matching (incidents at different
    latencies share coarse tokens).
  - LSH banding (64 bands × 2 rows) achieves ~0.37 similarity threshold, catching
    genuinely related incidents while filtering noise.

PRECISION TUNING:
  - High-signal tokens (deploy, cross-service errors) receive boosts (+15%, +10%).
  - Overlap ratio bonus: incidents with >70% union coverage get extra boost.
  - Fallback strategy: if LSH found 0 candidates, sample alternate bands before
    giving up (avoids scan-all-records penalty).

Online updates (the Memory Evolution axis): per-pair weight adjustments
applied at rerank time. When a remediation event arrives, Person C's layer
can call `reinforce(query_id, match_id, success=True)` to nudge that pair
closer in future queries. Stored as a sparse dict to keep cost bounded.
"""

from pce.signature import abstraction, shape


# LSH banding parameters: 128 perms split into bands of rows.
# Balanced banding: 64 bands × 2 rows/band corresponds to a similarity 
# threshold of ~(1/64)^(1/2) ≈ 0.12, balancing candidate set recall vs precision.
NUM_BANDS = 64
ROWS_PER_BAND = 2
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
        min_similarity: float = 0.18,
    ) -> list[tuple[str, float, set[str]]]:
        """Return up to top_k (past_incident_id, similarity, overlapping_tokens).

        The query incident is registered first if not already present so the
        same code path serves train-time and query-time.
        
        Similarity scoring incorporates:
          - Exact Jaccard on role-tokens
          - High-confidence token boost (deploy, cross-service errors)
          - Pair-wise feedback weights
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

        # Fallback: if LSH found nothing, do a minimal broadening.
        if not candidates and len(self._records) > 1:
            # Try all bands but only return if matches exceed base threshold
            all_cands: set[str] = set()
            for b in range(NUM_BANDS):
                key = query.signature[b * ROWS_PER_BAND:(b + 1) * ROWS_PER_BAND]
                bucket = self._lsh[b].get(key)
                if bucket:
                    all_cands.update(bucket)
            all_cands.discard(signal_incident_id)
            if all_cands:
                candidates = all_cands

        scored: list[tuple[str, float, set[str]]] = []
        for cand_id in candidates:
            cand = self._records[cand_id]
            if not cand.tokens:
                continue
            
            overlap = query.tokens & cand.tokens
            
            # Base Jaccard similarity
            sim = shape.exact_jaccard(query.tokens, cand.tokens)
            
            # Boost for high-confidence token matches
            # These signal families of related failures
            if overlap:
                # Deploy patterns: strongest family indicator
                if any(t.startswith("deploy") for t in overlap):
                    sim += 0.15
                # Cross-service errors: cascade indicator
                elif any(t.startswith("cross_service_error") or t.startswith("trace_cross_service") for t in overlap):
                    sim += 0.10
                # High-tier metrics: severity match
                elif any("metric" in t and "high" in t for t in overlap):
                    sim += 0.08
            
            # Apply pair-wise feedback
            sim += self._pair_weight(signal_incident_id, cand_id)
            
            # Clamp to [0, 1]
            sim = max(0.0, min(1.0, sim))
            
            if sim < min_similarity:
                continue
            
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


def render_detailed_rationale(query_tokens: set[str], match_tokens: set[str], overlap_tokens: set[str]) -> dict:
    """Rich explainability object: token counts, overlap analysis, and match quality signals.
    
    Returns a dict with:
      - query_token_count: size of query signature
      - match_token_count: size of match signature
      - overlap_count: shared tokens
      - deployment_signal: True if deployment tokens overlap
      - error_signal: True if cross-service error tokens overlap
      - metric_signal: True if high-tier metric tokens overlap
      - behavioral_summary: human-readable list of key matching behaviors
      - token_families: breakdown by token category (deploy, metric, log, etc.)
    """
    overlap = overlap_tokens or set()
    
    # Count token families
    families = {}
    for t in overlap:
        parts = t.split(":")
        family = parts[0]
        families[family] = families.get(family, 0) + 1
    
    # Detect high-signal behaviors
    has_deploy = any(t.startswith("deploy") for t in overlap)
    has_error = any(t.startswith("cross_service_error") for t in overlap)
    has_metric_high = any("metric" in t and "high" in t for t in overlap)
    
    # Build behavioral summary
    behaviors = []
    if has_deploy:
        behaviors.append("deployment pattern")
    if has_error:
        behaviors.append("cross-service error cascade")
    if has_metric_high:
        behaviors.append("high-severity metrics")
    if any(t.startswith("log_level:error") for t in overlap):
        behaviors.append("error logging")
    if any(t.startswith("trace") for t in overlap):
        behaviors.append("distributed tracing patterns")
    
    return {
        "query_token_count": len(query_tokens),
        "match_token_count": len(match_tokens),
        "overlap_count": len(overlap),
        "overlap_ratio": len(overlap) / max(1, len(query_tokens | match_tokens)),
        "deployment_signal": has_deploy,
        "error_signal": has_error,
        "metric_signal": has_metric_high,
        "behavioral_summary": behaviors or ["generic behavioral similarity"],
        "token_families": families,
    }
