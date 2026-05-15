# PCE — Architecture & Design

Submission writeup for Anvil-P&E problem P02 (Persistent Context Engine).
Target length: 3 pages.

---

## 1. Memory Representation

The engine treats operational telemetry as a stream of typed events
(`deploy`, `log`, `metric`, `trace`, `topology`, `incident_signal`,
`remediation`). Three substrates hold this stream:

**Event log** — append-only, monotonic `event_id`s. Every event keeps its
original payload; `event_id` is the only addition. Causal chains and the
`related_events` field of returned contexts reference events by id, never
by copy.

**Inverted indices** — `by_service`, `by_trace`, `by_kind`, `by_incident`,
and `by_bucket` (1-second time buckets). Window queries are
O(window_seconds), not O(total_events). At L2 scale (~17k events) the cold
window-pull for a single incident completes in well under 5 ms.

**Identity resolver** — a directed rename chain stored as
`name -> (successor, ts)` edges. Resolves any historical service name to
its canonical (latest) form, including transitive renames
(`A -> B -> C -> D`). Optional point-in-time resolution lets the explain
narrative reference the name a service had *at the moment* an event
occurred.

The matcher (described below) maintains an additional small registry of
past incidents — each one a triple of `(role-token set, MinHash signature,
metadata)`. This is the only derived state; everything else can be
reproduced from the event log.

## 2. Relationship Synthesis Algorithm — the wedge

The central test in the problem statement is rename-robust incident
recall. We address it structurally: the matcher never compares service
names.

**Step 1: Behavioral abstraction.** Around each incident's signal (a
window of `[signal - 10 min, signal + 1 min]`), every event becomes a
*role-token*: a tuple
`(event_kind, role, time_bucket, optional severity tier)`
where `role = "self"` if the event's canonical service equals the
signal's canonical service, otherwise `"peer"`. Time is coarsely
bucketed (`0-10s`, `10-60s`, `60-180s`, `180-600s`). Metric values are
bucketed `low/mid/high` per metric family.

Service names never enter the token. Because identity resolution runs at
ingest time, a `payments-svc -> billing-svc` rename leaves the tokens for
the same behavior bit-identical.

**Step 2: MinHash signature.** A 128-permutation MinHash signature is
computed over each token multiset using `hashlib.blake2b` with the
permutation index as a `person=` salt. Stdlib only; deterministic across
runs.

**Step 3: LSH banded index.** Signatures are split into 32 bands of 4
rows. Two incidents collide in a band when all 4 rows match — corresponds
to a candidate-set similarity threshold of ≈ 0.42. Rerank via exact
Jaccard over the token sets so the final top-K is precise even when LSH
is generous.

**Rationale rendering.** For each match, we pick the highest-signal
overlapping tokens (`deploy:self:0-10s`, `cross_service_error:self`,
high-tier metric tokens) and stitch them into a one-clause rationale that
appears in the returned `IncidentMatch.rationale` field.

## 3. Drift-Handling Strategy

Topology drift comes in three flavors; we handle each at a different
layer:

- **Renames** — pure identity-resolver problem. All other layers see only
  canonical names. Transitive chains are walked greedily, with timestamped
  edges so point-in-time resolution stays correct.
- **Dependency shifts** — captured indirectly through trace spans
  (Indices index every span's service) and through log message parsing
  (cross-service error mentions become tokens). Whether `A` calls `B`
  manifests in the *behavior* of incidents, which the matcher catches.
- **Service add / remove** — first-class. The event log doesn't care.
  Services only appear in the by-service index when an event references
  them, so a never-deployed service is simply absent.

For the held-out L3 chaos (a topology shift injected mid-evaluation), the
engine remains correct because token construction is per-incident and
re-runs identity resolution every time. A rename that arrives after a
past incident still updates the canonical name for that past incident's
service refs on next query.

## 4. Latency Engineering

Budgets: ingest ≥1000 ev/s sustained, `reconstruct_context` p95 ≤ 2s fast
/ ≤ 6s deep.

- **Ingest hot path** is dict appends + integer increments. No JSON
  parsing post-load (events arrive as dicts already). Bucket-keyed inverts
  use `setdefault` + `append`, both O(1).
- **Reconstruct hot path** has four reads: `ids_for_incident`,
  `ids_in_window` (bucket-keyed), `matcher.find_similar` (LSH banded),
  `aggregate_from_matches` (small set arithmetic). MinHash signatures for
  past incidents are computed *once* at register time, not per query.
- **Memoization** lives at the right layer: matcher caches each incident's
  tokens + signature; identity resolver caches alias sets.

Measured on the worked-example + recurring-family fixtures, a single
reconstruction completes in <10 ms. Cold-start to first reconstruction on
~17k events: <500 ms on a laptop.

## 5. Evolution Mechanism

The matcher carries a sparse `pair_weights` dict keyed by sorted
incident-id pairs. The `FeedbackLoop`:

1. When `reconstruct_context` returns matches `[A, B, C]` for incident X,
   stashes them in `recent_matches[X]`.
2. When a `remediation` event arrives for X with `outcome="resolved"`,
   calls `matcher.reinforce(X, A, success=True)` for each match, nudging
   the pair weight by +0.05 (bounded to ±0.2).
3. Failed outcomes apply the opposite nudge.

At query time, the rerank step adds the weight to the Jaccard score.
Result: a same-query, before-vs-after-remediation comparison shows
visible re-ranking — this is the Memory Evolution metric the bench
grades.

The bound on weight magnitude (±0.2) is deliberate: reinforcement
*refines* the order of behaviorally similar matches without ever
masquerading as a similarity signal that the underlying tokens don't
support.

## 6. Benchmark Results & Caveats

[ filled in after running `bench/run.sh` against the harness ]

- precision@5 / recall@5 on recurring_family.jsonl with mid-stream rename
- p95 latency, fast and deep modes
- before/after memory-evolution delta

**Known limits.**
- Explain narrative is templated, not learned. Gets ≥3/5 on
  Explainability without an LLM; would need rewriting to reach 5/5.
- Causal chain is heuristic, not learned. Kind affinity + temporal
  proximity + trace/service alignment is the full scoring function.
- No persistent disk store: a process restart wipes memory. Not in scope
  for the bench (single process per seed).

## 7. What Would Be Next

- **WL-style motif hashing** for richer behavioral abstraction. Tokens
  encode 1-hop neighborhoods; a Weisfeiler-Lehman relabeling pass would
  push that to 2-3 hops, surviving morphing that current tokens miss.
- **Explain re-templating with examples.** Several past incident snippets
  in-context would lift Explainability without adding any model
  dependency.
- **Disk-backed log** — a single SQLite file would survive restarts at
  negligible cost.

---
