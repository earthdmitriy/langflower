# Epic 05 — First Partial use-case pilots

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md);
preferably [02](02-runtime-permissions.md), [03](03-review-node.md),
[04](04-role-tool-profiles.md) for coding-agent / article-writing  
**Index:** [README.md](README.md)

## Goal

Ship the thinnest **end-user Partial** scenarios with real LLM + registered
tools, demo workflows, and Status flips in use-case docs.

## Pilot order

1. **prompt-refining** — LLM + file tools + HITL QA → write prompt `.md`/`.txt`
2. **article-writing** — outline/draft + Review Gate / Review node; MCP later
3. **coding-agent** (Partial) — Plan/Coder presets + harness tools + permission
   asks (full accept/retry UX may lag)

## Landed

1. Demo workflows under `demo-project/.langflower/workflows/`:
   `prompt-refining.json`, `article-writing.json`, `basic-coder.json`
   (formerly `coding-agent.json` smoke pilot).
2. Scenario registry + CI fake paths (scripted Fake LLM + auto-Allow
   `permission.ask`):
    - `tests/integration/ws/execute-prompt-refining.ws.test.ts`
    - `tests/integration/ws/execute-article-writing.ws.test.ts`
    - `tests/integration/ws/execute-basic-coder.ws.test.ts`
3. Use-case Status → **Partial** for the three pilots; Missing lists narrowed.
4. [use-cases/README.md](../../use-cases/README.md) summary table updated.
5. Run paths documented in `demo-project/README.md` and each use-case doc.

## In scope

- Three pilots above + docs Status
- Minimal UX polish so a user can run without reading ADR

## Out of scope

- Implementable bar for all 15
- Eval suite / KB / Obsidian / checkpoints

## Acceptance criteria

1. At least **prompt-refining** is Partial with a documented run path. ✅
2. article-writing and coding-agent Partial or explicitly still Blocked with
   narrowed Missing list. ✅ (both Partial)
3. `verify` green; no marketing “coding agent ready” without tools. ✅
