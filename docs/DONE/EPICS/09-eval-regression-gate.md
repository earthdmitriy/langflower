# Epic 09 — Eval / regression gate

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md);
[06-hard-harness-logic.md](06-hard-harness-logic.md) (Assert / Compare for
canvas stop-on-regression)  
**Index:** [README.md](README.md)

## Goal

Run a golden / fixture suite against an agent graph, score results, and **stop
on regression** (threshold fail).

## Landed

1. **`@langflower/eval`** — pack format (`pack.json`), scorers (`exact` /
   `includes`), batch runner, fail-closed threshold gate, skill load via
   harness **`read`** (not panel `skillId`).
2. **CLI** — `langflower eval <pack-dir> --replay <map.json>` exits `1` when
   suite score &lt; threshold.
3. **Documented pack** — `tests/fixtures/eval/golden-sample/` (+ README).
4. **Canvas stop-on-regression** — Compare(`gte`) + Assert workflow
   (`demo-project/.langflower/workflows/eval-regression-gate.json`); WS test
   proves Assert errors when score &lt; threshold.
5. Use-case Status updated for
   [eval-regression-gate](../../use-cases/eval-regression-gate.md) and
   [skill-refining](../../use-cases/skill-refining.md).

## In scope

- Fixture runner + threshold stop
- Skill file loaded via `read` tool (not only panel `skillId`)
- Assert / Compare gate on the canvas (reuse epic 06)

## Out of scope

- Full CI product packaging for third parties
- Vision / multimodal evals

## Acceptance criteria

1. Documented pack runs and fails the workflow when score &lt; threshold. ✅
2. eval-regression-gate and skill-refining Status updated accordingly. ✅
