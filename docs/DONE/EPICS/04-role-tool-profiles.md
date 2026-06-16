# Epic 04 — Role presets as tool + permission profiles

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md);
[02-runtime-permissions.md](02-runtime-permissions.md) for full profiles  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — presets configure the **internal** loop only

## Goal

Plan / Coder / Explorer remain **instance config** on one LLM type, but presets
also set default **tool allowlists** and **permission posture** (not only
systemPrompt / skill). Coding-agent graphs mean something at runtime.

Presets do **not** choose internal vs external loop mode. They only configure
which tools may bind and what permission stage applies inside the internal
loop from epic 01. See
[MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).

## Landed

1. `llm-role-preset` — per-role `enabledToolIds` + `permission` posture;
   `resolveEffectiveEnabledToolIds` / `paramsAfterRolePresetApply` /
   `resolveRolePermissionPosture`.
2. Inspector: selecting a preset materializes `enabledToolIds`; multiselect
   lists harness builtins + wired tools; overrides stick until next apply.
3. Runtime: `buildExecutionContext` merges role posture over project
   `permission` (shallow per-tool replace) into the harness.
4. Docs: merge rules in [LLM_NODES.md](../../LLM_NODES.md); use-case Missing
   parts updated for coding-agent / plan-refine.

## In scope

- Preset → tools + permission defaults for the internal loop
- Docs + inspector behavior

## Out of scope

- New palette agent node types
- Chat Input (epic 13)
- Changing tool-execution mechanics (internal vs external)
- Demo workflow sample graphs (epic 05 Partial pilots)

## Acceptance criteria

1. Selecting Coder vs Explorer changes default tool set / gates without manual
   checkbox marathon. ✅
2. Overrides still stick after preset apply (define merge rules). ✅
3. coding-agent / plan-refine use-case Missing parts updated. ✅
