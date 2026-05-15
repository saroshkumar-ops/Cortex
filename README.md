# PCE — Persistent Context Engine

An operational memory substrate for autonomous SRE. Continuously ingests
telemetry, builds rename-robust behavioral signatures, and on incident time
reconstructs causal context, surfaces similar past incidents across topology
drift, and recommends historically-validated remediations.

Built for the Anvil-P&E hackathon (problem P02).

## Layout

```
.
├── pce/              # The engine. Pure-stdlib Python. This is the bench submission.
│   ├── adapter.py    # Engine(Adapter) — the binding interface
│   ├── schema.py     # TypedDicts (Event, IncidentSignal, Context, ...)
│   ├── store/        # event log, identity (rename graph), indices
│   ├── signature/    # role-token abstraction, MinHash, LSH matcher
│   ├── causal/       # event window + (cause -> effect) chain builder
│   ├── memory/       # remediation aggregation, online reinforcement loop
│   └── reconstruct.py # composes Context + explain narrative
├── bench/            # Bench harness (samples + runner + run.sh)
├── server/           # FastAPI HTTP wrapper around pce.Engine (demo only)
├── cortex-nitte/       # React dashboard (legacy frontend, rewired to PCE)
├── Dockerfile        # Bench-only image (judges)
└── docker-compose.yml # Full demo stack: backend (FastAPI) + frontend (nginx)
```

## Quickstart — Bench

```bash
# Bench harness, no deps
python -m bench.runner --input bench/samples/worked_example.jsonl
python -m bench.runner --input bench/samples/recurring_family.jsonl --out report.json
# Or:
bash bench/run.sh
```

Containerized:

```bash
docker build -t pce-bench .
docker run --rm pce-bench
```

## Quickstart — Demo (with dashboard)

```bash
docker compose up --build
# Backend (FastAPI):  http://localhost:8000  (autoloads recurring_family.jsonl)
# Frontend:           http://localhost:5173
```

Dev mode without Docker:

```bash
# Backend
pip install -r server/requirements.txt
PCE_AUTOLOAD=bench/samples/recurring_family.jsonl \
  uvicorn server.main:app --host 0.0.0.0 --port 8000

# Frontend
cd cortex-nitte/frontend
npm install
npm run dev
```

## How it works

1. **Ingest** — `Engine.ingest(events)` appends every event to a monotonic
   log. `topology` events update an identity resolver (rename graph); every
   service reference is filed under its canonical name.
2. **Register past incidents** — on each `remediation` event, the matcher
   builds a behavioral signature for the resolved incident: role-tokens
   (kind, role-relative-to-signal, time-bucket) → 128-permutation MinHash →
   LSH band index.
3. **Reconstruct on demand** — `Engine.reconstruct_context(signal, mode)`:
   - Pulls a 5-minute window of candidate events
   - Walks backwards from the signal to build a causal chain
   - Queries the LSH index for behaviorally similar past incidents
   - Aggregates remediations from matches into ranked suggestions
   - Returns a `Context` TypedDict + 3–5 sentence explain narrative
4. **Evolve** — every remediation event grades the matcher's prior
   suggestions and reinforces (or dampens) per-pair similarity weights.

## Why it's rename-robust

The matcher never compares service names. Role-tokens are
`(kind, role, time_bucket)` where `role = "self"` if the event's canonical
service equals the signal's canonical service, `"peer"` otherwise. Because
the identity resolver collapses every historical name to its canonical
form, a `payments-svc -> billing-svc` rename leaves tokens identical for
the same behavior.

## Architecture choices

- **No embeddings, no LLM.** Pure stdlib. blake2b under the hood for MinHash
  permutations.
- **Append-only event log + inverted indices.** O(window_seconds) lookups
  using 1-second time buckets. Comfortably under bench latency budgets.
- **Reinforcement happens in the matcher, not as a post-processing step.**
  Online weight updates are bounded to ±0.2 so they refine ranking without
  drowning out the underlying Jaccard signal.

## License

MIT.
