# Project configuration

## Goal

Let a user bring their own LLM and embedding provider — local or cloud — and
control exactly which filesystem/shell/network actions agents are allowed to
take, all from one plain-text config file in their project.

**Settings UI target (Draft):** [settings-panel.md](settings-panel.md) +
[settings-panel use-case](../use-cases/settings-panel.md) — gear in the topbar,
project + global scopes in the right aside. When that use case is
**Implementable**, provider setup becomes a **dual path** (Settings **or**
hand-edit); today hand-edit is the only path and remains the escape hatch
(including permissions and secrets the UI will not show back).

## Core Principles

- **Bring your own provider** — Langflower does not lock a user into one LLM
  vendor; any OpenAI-compatible endpoint (local or cloud) can be configured.
- **Config lives with the project, in a format the user can hand-edit** — a
  single human-readable file, not a hidden database or account settings.
- **Secrets are referenced, not hardcoded** — API keys are pulled from
  environment variables via a placeholder syntax rather than being pasted
  into the config file in plaintext.
- **Deny by default for risky actions** — shell execution defaults to denied
  and must be explicitly allowed/asked per pattern; filesystem access is
  always confined to the project root.
- **Chat and embedding models are configured independently** — a user can
  use one provider for chat and a different one (or the same, with a
  different model) for knowledge-base embeddings.
- **UI settings are the product target; file edit stays valid** — when
  [settings-panel.md](settings-panel.md) lands, operators edit providers and
  models in the editor; project file on disk remains authoritative and
  hand-editable (including reading secrets the UI will not show back).

## Feature Details

Project configuration lives in one file the user can open and edit directly.
It covers:

- **Default model and providers** — which LLM backend agent/chat nodes call
  by default, and the full list of providers available to pick from per
  node (e.g. a local LM Studio server, or a cloud vendor like OpenAI). New
  projects are bootstrapped with a working local-provider default so a user
  can try the tool without any account or API key.
- **Embedding provider** — a separate model/provider pair used only by
  knowledge-base nodes (ingest/embed/search), since chat and embedding models
  are rarely the same model.
- **Permissions** — pattern-based rules for what shell commands are allowed,
  asked-about, or denied, and similarly for file edits; read access is
  allowed broadly by default. Agent presets (e.g. a coding agent) may request
  elevated permissions the user still ultimately controls via this file.
- **Remembered active workflow** — which workflow was last open, so
  reopening the project resumes where the user left off.
- **Mock provider for testing** — a scripted, no-network LLM stand-in so a
  user (or CI) can exercise an entire agent workflow deterministically
  without a real API key or live model.

A user changes provider, model, or permission rules by editing the file and
reloading; the editor reads the current config over the WebSocket connection
so provider/model choices are reflected in node parameter dropdowns
(inspector LLM fields included). When
[settings-panel.md](settings-panel.md) lands, Save MUST push the same update
via `langflower.config.snapshot` without a full reload — see use-case S2
inspector feedback gap.

## Implementation Details

- Full config file reference (schema, local/cloud examples, embedding setup,
  permission rule syntax, mock provider): [docs/CONFIG.md](../CONFIG.md).
- Config file location and format: `<project>/.langflower/langflower.jsonc`
  (subset of the OpenCode config format).
- Types: `packages/shared/src/types/langflower-config.ts`.
- Read/write service: `packages/server/src/services/langflower-config.service.ts`
  (referenced from [docs/NAVIGATION.md](../NAVIGATION.md)).
- Permission resolution (OpenCode-style allow/ask/deny rules) and path
  sandboxing: `packages/server/src/harness/permission.ts`,
  `packages/server/src/harness/path-sandbox.ts` — see
  [node-library.md §10](node-library.md#10-security--permissions).
- Mock LLM provider for chain testing: `packages/server/src/llm/mock-llm-provider.ts`,
  detailed in [docs/EXECUTION_ARCHITECTURE.md](../EXECUTION_ARCHITECTURE.md)
  § Mock LLM provider and [node-library.md §14](node-library.md#14-mock-llm-chain-testing).
