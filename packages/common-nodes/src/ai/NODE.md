# Agent nodes

|              |                                                                                    |
| ------------ | ---------------------------------------------------------------------------------- |
| **Types**    | `common-agent`, `common-agent-plan`, `common-agent-coder`, `common-agent-explorer` |
| **Category** | AI                                                                                 |

## Summary

LLM agent nodes: принимают `userPrompt` (и опционально system/tools), вызывают server `executeAgent`, эмитят `response` и stream events. Специализации (plan/coder/explorer) — preset system prompts и tool sets.

## Inputs

`userPrompt`, optional context ports per variant.

## Outputs

`response` (string/stream), tool-call side channels.

---

_Implementation removed — agents live in `@langflower/node-sdk` (`define-agent-node`)._
