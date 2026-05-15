#!/usr/bin/env bash
# Bench entry-point. Runs the canonical worked example + the recurring-family
# scenario and emits a JSON report.

set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p bench/out

echo "== Worked example =========================================="
python -m bench.runner --input bench/samples/worked_example.jsonl --out bench/out/worked_example.json

echo
echo "== Recurring family (rename-robust recall test) ============"
python -m bench.runner --input bench/samples/recurring_family.jsonl --out bench/out/recurring_family.json

echo
echo "Reports written under bench/out/"
