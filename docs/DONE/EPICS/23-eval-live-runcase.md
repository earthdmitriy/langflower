# Epic 23 — Eval live `runCase`

**Status:** landed  
**Depends on:** DONE/09 pack + `--replay`  
**Blocks:** [eval-regression-gate](../../use-cases/eval-regression-gate.md),
[skill-refining](../../use-cases/skill-refining.md) (Partial; real LLM open;
skill demo S3–S4 deferred)  
**Index:** [README.md](README.md)

## Goal

Pack primary path invokes agent under test via `runCase`; `--replay` optional.

## Acceptance criteria

1. Primary Fake skill-token `runCase` in CLI (outside `@langflower/eval`). ✅
2. Docs happy path without required `--replay`. ✅
3. skill-refining S1–S2 live/Fake path; S3–S4 demo deferred. ✅
4. Use-cases stay Partial (honest). ✅
5. `verify` green. ✅

## Landed

- `packages/cli/src/create-fake-skill-case-runner.ts`
- Integration primary path without `--replay`
- Pack README + UC honesty

## Links

- [eval-regression-gate](../../use-cases/eval-regression-gate.md)
- [skill-refining](../../use-cases/skill-refining.md)
- [DONE/09](09-eval-regression-gate.md)
