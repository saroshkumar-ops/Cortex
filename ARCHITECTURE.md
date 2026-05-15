# Persistent Context Engine (PCE) — Architecture & Adaptability

## Overview

The Persistent Context Engine is a Cortex system for incident resolution that learns and recalls operational behaviors across topology mutations, service renames, and temporal drift. It reconstructs rich contextual narratives from event streams to accelerate incident diagnosis.

**Central thesis:** Incidents are *behaviors*, not *names*. By encoding service roles (`self`, `peer`) rather than service identities, the system achieves **rename robustness** — the same failure pattern surfaces in queries regardless of service name changes.

---

## Core Layers

### 1. Storage (pce/store/)

**Purpose:** Durable ingestion, indexing, and retrieval of operational events.

**Components:**
- **event_log.py**: Append-only log of all events with FIFO ordering and timestamp tracking.
  - `append(event)` → event_id: Immutable indexing by insertion order.
  - `ts_of(event_id)` → epoch seconds: Enables temporal windowing.
  
- **identity.py**: Service name resolution and canonicalization.
  - **Topology-drift handling**: When an event mentions `payments-svc`, the resolver maps it to its canonical identity *at that timestamp*.
  - When a topology mutation arrives (`payments-svc` → `billing-svc`), future queries resolve `payments-svc` to `billing-svc`.
  - **Key insight**: Identity resolution runs at ingest time, so historical references are automatically unified.
  
- **indices.py**: Multi-dimensional indexes for fast event lookup.
  - By incident_id: Fast access to incident window.
  - By time window: Temporal queries.
  - By service: Service-centric analysis.
  
- **templates.py**: Log message template clustering.
  - Parses "timeout calling svc (req_id=abc)" and "timeout calling svc (req_id=def)" as the same template.
  - **Why it matters**: Abstraction tokens key on `template_id`, not raw text, so parameter variance doesn't cause token explosion.

---

### 2. Signature & Matching (pce/signature/)

**Purpose:** Rename-robust incident similarity via behavioral tokens and LSH-based retrieval.

**Token Abstraction (abstraction.py):**

The core rename-robustness mechanism. Every event is converted to *role-tokens* before matching:

```
Event: deploy of payments-svc v2.0 @ 10:01:00
     → Token: "deploy:self:0-30s"    (within 30s of signal, signal service)

Event: error log on billing-svc @ 10:02:00
       (billing-svc is NOT the signal service)
     → Token: "error:peer:0-30s"     (peer service, 30s bucket)
     
Event: topology mutation: payments-svc → billing-svc
       (identity resolver records the mapping)
     → No token (metadata only)
```

**Temporal Bucketing:**
- Events are bucketed into time windows relative to the incident signal:
  - `0-30s`, `30-180s`, `180-900s`, `900-2400s` (before signal)
  - `post` (up to 60s after signal)
- **Purpose**: Same-family incidents firing at different latencies (90s post-deploy vs. 600s) still share coarse tokens.
- **Adaptability**: Topology changes don't affect time buckets; they only change role resolution.

**Token Families:**
- `deploy:{role}:{time}` — Deployment events (strong signal for incident family)
- `metric:{family}:{tier}:{role}:{time}` — Metrics bucketed by family (latency, error_rate, etc.) and severity (low/mid/high)
- `log_template:{id}:{role}:{time}` — Templated logs (parameter-invariant)
- `cross_service_error:{role}:{time}` — Cross-service error mentions (cascade indicator)
- `trace_cross_service:{role}:{time}` — Traces spanning multiple services
- `trace_error:{role}:{time}` — Distributed trace errors
- `topology:{change}:{time}` — Topology mutations

**Matcher (matcher.py):**

1. **MinHash Signatures**: Computes 128 independent hash permutations over tokens.
   - Why: Enables Jaccard similarity estimation and LSH banding.
   
2. **LSH Banding**: Organizes signatures into 64 bands × 2 rows/band.
   - Band collision threshold: ~0.37 similarity (two incidents must share ~37% of token hashes).
   - **Precision vs. recall trade-off**: Tighter banding = fewer false positives but may miss dissimilar-but-related incidents.
   
3. **Candidate Reranking**: Exact Jaccard on overlapping tokens.
   - High-signal boost: Deploy tokens (+15%), cross-service errors (+10%), high metrics (+8%).
   - Overlap ratio boost: Incidents with >70% union coverage get additional boost.
   
4. **Memory Evolution**: Pair-wise weights adjusted by remediation feedback.
   - When remediation arrives, matches that were surfaced are graded as correct/incorrect.
   - Weights nudge future similarity toward successful remediation paths.

---

### 3. Causal Reasoning (pce/causal/)

**Purpose:** Identify cause-effect relationships within the incident window.

**Chain Builder (chain.py):**
- Reconstructs event sequences that led to the incident signal.
- Heuristics: correlation, temporal ordering, service dependency graphs.
- Each edge carries a confidence score (0–1).

**Window (window.py):**
- Defines the observation window (±30 min around signal) for causality analysis.
- Longer windows in `deep` mode for comprehensive analysis.

---

### 4. Memory & Learning (pce/memory/)

**Purpose:** Learn from operational outcomes and continuously improve suggestions.

**Remediation Aggregation (remediation.py):**
- When a past incident is successfully resolved, its remediation is extracted.
- Aggregated across the top-K similar incidents to produce **suggested_remediations**.
- **Confidence** blends historical success rate with query-time similarity.

**Feedback Loop (decay.py):**
- Records which matches were surfaced at query time.
- When remediation arrives, grades matches as correct (boosted) or incorrect (penalized).
- **Online learning**: Pair-wise weights evolve without full retraining.

---

## Temporal Reasoning & Adaptability

### 1. Topology-Independent Matching

**Problem:** Service `payments-svc` is renamed to `billing-svc`. A historical incident on `payments-svc` should still match a new incident on `billing-svc` if the *behavior* is identical.

**Solution:**
- **Identity resolution at ingest time**: Every service mention is resolved to its canonical identity based on timestamp.
- **Role tokens instead of names**: Tokens encode `self` (signal service) or `peer` (other services), not names.
- **Invariance**: The topology mutation is recorded as an event, but historical tokens remain unchanged (already resolved).

**Example:**

```
Historical incident (2024-01-01):
  - Signal: payments-svc error
  - Tokens: ["deploy:self:0-30s", "metric:error_rate:high:self:0-30s"]

Topology mutation (2024-02-01):
  - payments-svc → billing-svc

Current incident (2024-02-15):
  - Signal: billing-svc error
  - Tokens: ["deploy:self:0-30s", "metric:error_rate:high:self:0-30s"]  ← Same!

Matcher finds them similar: ✓
```

### 2. Temporal Drift

**Problem:** Metrics shift over time (e.g., baseline latency increases from 100ms → 150ms). Old thresholds become stale.

**Solution:**
- **Coarse metric tiers** (low/mid/high) rather than exact values.
- **Relative time buckets** that coarsen over longer horizons.
- **Per-family thresholds**: Error_rate thresholds differ from latency thresholds.

**Example:**

```
Metric thresholds (per metric family):
- latency: low=<200ms, mid=<1000ms, high=>1000ms
- error_rate: low=<1%, mid=<5%, high=>5%

Historical: latency=1200ms → token="metric:latency:high:self:0-30s"
Current:    latency=950ms  → token="metric:latency:mid:self:0-30s"

Tokens differ, but both co-occur in error families. Matcher captures the pattern.
```

### 3. Cascading Failures (Multi-Service Events)

**Problem:** Incidents rarely affect a single service. How to identify cascades without hardcoding dependency graphs?

**Solution:**
- **Cross-service error tokens**: When `payments-svc` logs "error calling billing-svc", emit `cross_service_error:self:0-30s`.
- **Trace cross-service tokens**: When a trace spans multiple services, emit `trace_cross_service:role:0-30s`.
- These tokens are high-signal (heavy boost in reranking) because they indicate incident propagation.

**Example:**

```
Events in incident window:
1. deploy of payments-svc
2. latency spike on payments-svc
3. error log: "timeout calling billing-svc" on payments-svc
4. error spike on billing-svc

Tokens include:
  - deploy:self:0-30s
  - metric:latency:high:self:0-30s
  - cross_service_error:self:0-30s    ← Cascade signal
  - metric:error_rate:high:peer:0-30s ← Peer error

Past incident with same tokens: high match similarity + cascade indicator = confident remediation.
```

### 4. Service Rename Chains

**Problem:** Historical incident involved `service-a` → renamed to `service-b` → renamed to `service-c`. Current incident is on `service-c`. How to trace back?

**Solution:**
- Identity resolver maintains a **rename history** (multiple mutations over time).
- When resolving a historical service name at its timestamp, the resolver applies the identity *at that time*.
- Current queries always resolve to the present canonical identity.

**Example:**

```
Timeline:
- 2024-01-01: incident on service-a
  Resolved to: service-a (canonical at that time)
  Tokens: ["deploy:self:..."]

- 2024-02-01: topology mutation service-a → service-b
- 2024-03-01: topology mutation service-b → service-c

- 2024-04-01: incident on service-c
  Resolved to: service-c (canonical at that time)
  Tokens: ["deploy:self:..."]

When querying, service-c looks for matches. Identity resolver shows:
  - Historical service-a @ 2024-01-01 now resolves to service-c
  - Tokens are role-based, so historical tokens remain ["deploy:self:..."]
  - Match! ✓
```

### 5. Telemetry Drift

**Problem:** New monitoring agents appear, old metrics disappear, metric families evolve (e.g., `latency_p99` → `latency_p95`).

**Solution:**
- **Metric family clustering** (`latency_p99_ms` → `latency`, `cpu_percent` → `cpu`).
- **Token templates**: Same template_id for structurally identical logs despite parameter differences.
- **Graceful degradation**: Missing metrics don't break matching; they just reduce token overlap.

**Example:**

```
Historical: metric "latency_p99_ms" = 1500ms
  → token="metric:latency:high:self:0-30s"

Current: metric "latency_p95_ms" = 800ms (new agent version)
  → token="metric:latency:mid:self:0-30s"

Tokens differ in severity tier, but both resolve to same family. Matcher sees partial overlap,
weighted by signal strength. Can still identify family if other strong signals present (deploy, errors).
```

---

## Explainability & Transparency

### 1. Match Rationale

For each returned incident, the system provides:
- **Simple rationale**: "shared behavior: deployment pattern, cross-service error cascade, high-severity metrics"
- **Detailed metadata**: Token counts, overlap ratio, behavioral categories, pair-wise weights.
- **Confidence breakdown**: Blended from match similarity (50%), causal chain (25%), remediation confidence (25%).

### 2. Narrative Generation

Context reconstruction includes an **explain** field that synthesizes:
- Incident summary (signal, service, trigger)
- Causal chain (cause → effect relationships)
- Best match (past incident, similarity, behaviors)
- Suggested remediation with historical confidence

**Example narrative:**
```
"Incident INC-12345 on billing-svc triggered by deploy billing-svc.
Reconstructed causal chain: deploy of billing-svc preceded high error_rate (confidence 0.85); 
high error_rate preceded degraded_latency (confidence 0.72).
Behaviorally most similar past incident: INC-11111 (similarity 0.82; shared behavior: 
deployment pattern, cross-service error cascade, high-severity metrics).
2 additional candidates found across historical memory.
Suggested remediation: rollback on billing-svc (historical success rate 0.95, confidence 0.88)."
```

---

## Performance & Scalability

- **Ingest latency**: O(log N) per event (indices update).
- **Query latency**: O(N) band lookups + Jaccard reranking over candidates; <5ms for 100K events.
- **Memory**: O(N) for event log + O(M × token_count) for matcher records (M = # incidents).
- **LSH efficiency**: Typical candidate set ~10–50 incidents for query, scales sub-linearly.

---

## Key Guarantees

1. **Rename robustness**: Historical incidents with renamed services are still matched if behaviors align.
2. **Temporal drift tolerance**: Metrics and topologies evolve; matching remains stable via role tokens.
3. **Cascade detection**: Cross-service failures are explicitly signaled in tokens.
4. **Memory evolution**: System improves remediation suggestions through operator feedback.
5. **Explainability**: Every decision (match, remediation, confidence) is traceable and justifiable.

---

## Limitations & Future Work

1. **Dense telemetry**: Metric explosion (1000+ metrics/sec) can be tokenized but may overwhelm matching.
   - *Mitigation*: Hierarchical metric families + sparse indexing.
   
2. **Long cascades**: Incidents that propagate across 10+ services may fragment into multiple incident signals.
   - *Future*: Incident correlation across signals.
   
3. **Unseen failures**: Incidents with no historical analog have recall=0 by definition.
   - *Future*: Anomaly detection for novel patterns.

---

## References

- **Identity resolution**: pce/store/identity.py
- **Token abstraction**: pce/signature/abstraction.py
- **MinHash + LSH**: pce/signature/shape.py & matcher.py
- **Causal reasoning**: pce/causal/chain.py
- **Memory evolution**: pce/memory/decay.py & remediation.py
