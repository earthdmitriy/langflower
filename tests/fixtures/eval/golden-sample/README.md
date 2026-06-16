# Golden sample eval pack

Documented fixture pack for eval / regression gate (epics 09 + 23).

## Layout

| File               | Role                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `pack.json`        | Suite id, threshold, default scorer, cases, `skillPath`                |
| `skills/triage.md` | Skill loaded via harness **`read`** (not panel `skillId`)              |
| `replay-pass.json` | Optional offline agent outputs that clear the threshold                |
| `replay-fail.json` | Optional offline outputs that **fail** the gate (score &lt; threshold) |

## Run

From the repo root (after `build-all`):

```bash
# Primary path — Fake skill-token agent under test (no --replay)
node packages/cli/bin/langflower.js eval tests/fixtures/eval/golden-sample \
  --project tests/fixtures/eval/golden-sample

# Optional offline / CI replay (exit 0)
node packages/cli/bin/langflower.js eval tests/fixtures/eval/golden-sample \
  --project tests/fixtures/eval/golden-sample \
  --replay tests/fixtures/eval/golden-sample/replay-pass.json

# Optional offline / CI replay — stop on regression (exit 1)
node packages/cli/bin/langflower.js eval tests/fixtures/eval/golden-sample \
  --project tests/fixtures/eval/golden-sample \
  --replay tests/fixtures/eval/golden-sample/replay-fail.json
```

CLI default without `--replay` is a **Fake** agent that follows
`answer exactly: \`TOKEN\`` rules in the pack skill. Threshold stays
fail-closed.

### Real LLM (not the default CLI path)

Compose a live provider as `EvalCaseRunner` and call
`runEvalSuite({ packDir, projectRoot, runCase })` from
`@langflower/eval/run-eval-suite`. Keep Fake / `--replay` for CI topology.
Real-provider Expects are the product Implementable bar — not proven by this
pack’s Fake happy path alone.

Programmatic API: `@langflower/eval/run-eval-suite`.
