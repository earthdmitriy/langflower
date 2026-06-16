# @langflower/eval

Fixture pack format, scoring, and fail-closed regression gate for agent
quality suites (epic 09).

## Boundary

- **Owns:** pack JSON shape, scorers (`exact` / `includes`), suite aggregation,
  threshold gate, skill load via harness `read`.
- **Must not depend on:** server, UI, common-nodes, shared, LLM providers, or
  node catalogs. **No** agent / Fake / live `runCase` implementation here —
  callers inject `EvalCaseRunner`.
- **May depend on:** `@langflower/tools` (harness `read` for skill files).
- **Consumers:** CLI `langflower eval` (Fake skill-token runner or `--replay`);
  unit/integration tests; skill-refining fixture loops. Real LLM agents are
  composed outside this package via `runEvalSuite({ runCase })`.

## Public imports

```typescript
import { loadEvalPack } from '@langflower/eval/load-pack';
import { runEvalSuite } from '@langflower/eval/run-eval-suite';
```

No `index.ts` barrel.

## Pack layout

```
<pack-dir>/
  pack.json          # id, threshold, scorer, optional skillPath, cases[]
  skills/*.md        # optional; loaded with builtin read (not panel skillId)
  replay-pass.json   # optional caseId → output map for offline / CI runs
  replay-fail.json
```

CLI primary path (no `--replay`): Fake skill-token `runCase` composed in
`packages/cli`. Optional `--replay` keeps offline maps. Real provider =
injected `runCase`, not a default inside this package.

## Gate

Suite score = mean of per-case scores (0 or 1). Gate **passes** only when
`suiteScore >= threshold`. Below threshold → `passed: false` and CLI exit 1
(stop-on-regression).

Canvas equivalent: wire suite score + threshold into `common-compare` (`gte`)
→ `common-assert` (epic 06). Demo:
`demo-project/.langflower/workflows/eval-regression-gate.json`.
