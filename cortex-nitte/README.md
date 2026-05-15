# Cortex PCE — Persistent Context Engine

Operational memory engine for incident response. It ingests telemetry, normalizes
service identity across renames, reconstructs incident context, retrieves similar
historical incidents, and suggests remediations from past outcomes.

Built for Anvil-P&E hackathon (P02).

## What is implemented right now

Pipeline status against the intended flow:

| Stage | Status | Notes |
|---|---|---|
| Telemetry Events | ✅ | Handles deploy/log/metric/trace/topology/signal/remediation events |
| Ingestion Layer | ✅ | `Engine.ingest()` with append-only log and indexing |
| Identity Resolution | ✅ | Rename-chain aware canonical service mapping |
| Operational Memory Store | ✅ | Event log + incident/time/service indexes |
| Relationship + Signature Engine | ✅ | Role-token abstraction + MinHash + LSH + reranking |
| Incident Signal Trigger | ✅ | `incident_signal` anchors context reconstruction |
| Context Reconstruction | ✅ | Related events, similar incidents, causal chain, explain text |
| Incident Matching | ✅ | Top-K retrieval with token overlap rationale |
| Causal Chain Builder | ✅ | Heuristic cause→effect edge construction |
| LLM Reasoning Layer | ❌ | Not integrated as a live reasoning service |
| Remediation Planner | ⚠️ Partial | Suggests from history; no multi-step constraint-aware plan |
| Autonomous Executor | ❌ | No safe execution/rollback/approval workflow yet |
| Feedback Learning Loop | ✅ Partial | Match reinforcement from remediation outcomes |

## Key capabilities implemented

1. **Rename-robust matching**
   - Service names are canonicalized before tokenization.
   - Matching compares behavior (`self`/`peer` role tokens), not raw names.

2. **Behavioral incident memory**
   - Incident windows become token signatures.
   - Similar incidents are retrieved with LSH + exact Jaccard rerank.

3. **Context synthesis**
   - Returns a structured `Context` with:
     - similar past incidents
     - causal chain
     - related events
     - suggested remediations
     - explain narrative

4. **Online learning**
   - Feedback loop adjusts pairwise similarity weights after remediation signals.

5. **Explainability**
   - Match rationale includes overlapping behavioral signals and token-family metadata.

## What is still missing

1. **LLM orchestration layer**
   - Missing strict flow: compressed context → LLM reasoning → structured plan output.

2. **Production remediation planner**
   - No policy/risk-aware multi-step planner yet.

3. **Autonomous execution with guardrails**
   - No approval gates, rollback plan, blast-radius checks, execution audit.

4. **Memory lifecycle controls at scale**
   - Needs retention, summarization, forgetting, dedupe, and stale-pattern decay.

5. **High-volume stream controls**
   - Needs stronger backpressure/sampling/partition strategy for very large telemetry rates.

## Repository layout

```text
.
├── pce/                   # Core engine (stdlib-only)
│   ├── adapter.py         # Engine(Adapter) interface
│   ├── schema.py          # Event / IncidentSignal / Context types
│   ├── store/             # event log, identity, indices, templating
│   ├── signature/         # abstraction, MinHash, LSH matcher
│   ├── causal/            # context window + chain builder
│   ├── memory/            # remediation aggregation + reinforcement
│   └── reconstruct.py     # Context composer + explanation
├── bench/                 # Lightweight runner + samples
├── bench-p02-context/     # Official-style harness for evaluation
├── server/                # FastAPI wrapper for demo integration
├── frontend/              # UI/dashboard
├── ARCHITECTURE.md        # Detailed technical design
└── docker-compose.yml     # Local demo stack
```

## Quickstart (benchmark flow)

```bash
# 1) Quick validation
cd bench-p02-context
python self_check.py --adapter adapters.cortex:Engine --quick

# 2) Full run
python run.py --adapter adapters.cortex:Engine --mode fast \
  --seeds 9999 31415 27182 \
  --n-services 20 --days 14 --out report.json
```

## Practical architecture note

This project intentionally avoids pushing raw high-volume logs into an LLM.
Current design does deterministic compression + retrieval first, and is ready
to add an LLM only on compact, top-K reconstructed context.

## License

MIT
