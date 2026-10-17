---
kind: adr
owner: docs
covers: []
status: current
id: ADR-028
supersedes: []
superseded-by: []
package: docs
---

## ADR-028 — Persisted `inputs` are visible overrides; defaults from definition on load

**Status:** accepted · **Date:** 2026-07-23

**Context:** Saving Fake LLM (and other LLM-class) nodes baked every
`defaultValue` into `node.inputs` (`tools: []`, `systemPrompt: ""`, …). Older
demo workflows used `"inputs": {}`. Load only `connect`'d keys present in JSON,
so empty inputs left inventory ports inactive; with a CJS/ESM dual-package
miss on `isInactive`, `applyPortDefaults` skipped seeds and
`combineInputs` stalled after `userPrompt` arrived — workflows looked
“broken” unless the user recreated the node (which re-baked defaults). Baking
defaults into JSON also freezes stale values across node upgrades.

**Alternatives considered:**

- **Always persist definition defaults into `inputs`** — recreate “worked”;
  rejected: upgrades / changed defaults diverge from disk; masks runtime seed
  bugs; noisy git diffs.
- **Rely only on run-time `applyPortDefaults`** — correct long-term seed path;
  insufficient alone while Symbol-identity guards fail across dual packages.
- **Visible overrides on disk + inject current defaults on materialize
  (chosen)** — file stays sparse; load uses _current_ definition; runtime seed
  remains a safety net with structural inactive detection.

**Decision:**

1. **Persist** `node.inputs[port]` only when the port has a **visible UI field**
   (editable `inline`, not preview-*, **including** `hidden: true` + inline —
   Chat Input `message`) **and** the value is **not** deep-equal to the current
   definition `defaultValue`. Hidden HITL without inline (Review Gate) is not
   persistable.
2. **On load / materialize**, for each input with `defaultValue` and no saved
   override, `connect(of(currentDefault))` from the live definition (not from
   a historical baked copy).
3. **Normalize** on load and save: strip unknown / non-persistable /
   default-equal keys (in-memory; disk cleaned on next Save).
4. **Runtime** classifies port status with `@rx-evo` `serializeResponse` →
   `ResponseDto` (`'pending' in dto`, `'inactive' in dto`, …). Sentinels
   use `Symbol.for` (0.6.0) so dual-package identity cannot skip
   `applyPortDefaults` or invent a parallel string union.

**Tradeoffs accepted:** (+) Sparse JSON, upgrade-safe defaults, recreate no
longer required to “fix” empty inputs. (−) UI must treat missing keys as
“show definition default”; materialize must disconnect seeds when edges wire
(existing BUG-2026-07-12b). (−) Wire telemetry is `ResponseDto`, not a
Langflower-owned `RuntimePortSignalState` string.

**Consequences:**

- `applyEditorAddNode` no longer merges `defaultInputsFromDefinition` into
  persisted inputs; `WorkflowService` load/save run
  `normalizeWorkflowDocumentInputs`.
- `WorkflowNodePersisted.inputs` docs updated; FOUND_BUGS for empty-inputs
  stall; revisit if port UI metadata cannot express “visible field”.

---
