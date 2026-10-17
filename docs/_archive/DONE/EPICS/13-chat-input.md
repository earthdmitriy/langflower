# Epic 13 — Chat Input + multi-turn product UX

**Status:** landed  
**Depends on:** HITL feed exists; epic 01 for agent turns  
**Index:** [README.md](README.md)

## Goal

Ship `common-chat-input` (or equivalent) so conversational entry into agent
graphs feels like a product chat, not only String → LLM wires.

## Landed

1. **`common-chat-input`** — reactive AI node; hidden HITL `message` input →
   `message` output; `chatEntry: true` so plain Run skips its cluster.
2. **Runtime** — `RuntimeRunner.start` wires only non-chat-entry clusters;
   chat clusters cold-start via `pushIntoInput`.
3. **Server** — idle `runner.hitl.event` seeds execution context, `startNode`s
   the cluster, emits `runner.started`, then delivers the message.
4. **UI** — idle composer tabs for chat-entry nodes; Run disabled when the
   graph is composer-only; Run-from-node blocked for chat-entry clusters.
5. **basic-coder** (smoke) — demo + CI scenario entry is Chat Input (composer start).
6. **Multi-turn** — `chat-input-multi-turn` scenario: Chat Input → Fake LLM →
   Ask User `feedback` (ADR-016).

## In scope

- Chat Input node + basic multi-turn UX

## Out of scope

- Full Slack/Teams connectors
- Multi-user rooms / SSO (out of scope)

## Acceptance criteria

1. User can start/continue an agent run from chat-style input in the UI. ✅
2. basic-coder / coding-agent Missing parts for entry UX cleared or narrowed. ✅
