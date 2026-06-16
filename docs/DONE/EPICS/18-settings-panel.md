# Epic 18 — Settings panel

**Status:** landed  
**Depends on:** Project `langflower.jsonc` + `langflower.config.snapshot` (DONE);
**ADR-002 amend** for global scope  
**Blocks:** [settings-panel](../../use-cases/settings-panel.md) S1–S6 (Draft → Partial)  
**Index:** [README.md](README.md)

## Goal

Operators amend providers, models, and API keys from a gear-driven Settings
aside (project + global, project wins) without hand-editing JSON for the happy
path. Secrets are write-only in UI.

## In scope

1. Gear icon on the **right of the topbar**; Settings replaces the right
   aside (third mode after feed / inspector).
2. Project scope Save/Discard → persist project config; re-emit
   `langflower.config.snapshot` (no parallel `settings.*` bus unless ADR).
3. **Inspector / LLM options rebind** on every snapshot after Save (not
   connect-only cache) — settings-panel S2 gap.
4. Write-only API key fields; prefer `{env:VAR}` on disk; bridge omits `apiKey`.
5. **ADR-002 amend** + global config file (OS-specific paths) + merge
   project > global + path hint (S6).
6. Close / node-click restores feed or inspector per feature contract.

## Out of scope

- v1 permissions / MCP editors (hand-edit stays).
- Persona / multi-user SSO.
- Forcing removal of JSON hand-edit escape hatch.

## Acceptance criteria

1. [settings-panel](../../use-cases/settings-panel.md) S1–S6 Expects pass. ✅
   (unit + code paths; Prefer Partial until manual smoke)
2. ADR-002 amend recorded; OS global paths documented (CONFIG). ✅
3. After Save, LLM node inspector `providerId` / model options update without
   full page reload. ✅ (projection rebinds every snapshot)
4. Use-case Status Draft → Partial. ✅
5. Bootstrap S3 dual path — documented as available when Partial; Implementable
   when manual smoke claims happy path. ✅ (honest Partial)
6. `verify` green. ✅

## Landed

- Gear → Settings third aside; Project/Global Save/Discard; write-only keys
- Global path + merge project > global; `langflower.config.save.requested`
- ADR-002 amend + CONFIG OS paths
- [settings-panel](../../use-cases/settings-panel.md) → **Partial**

## Links

- [settings-panel use-case](../../use-cases/settings-panel.md)
- [settings-panel feature](../../features/settings-panel.md)
- [inspector](../../features/inspector.md)
- [project-configuration](../../features/project-configuration.md)
- [CONFIG.md](../../CONFIG.md)
- [ADR-002](../../ADR.md#adr-002--langflower-project-local-storage-opencode-style)
