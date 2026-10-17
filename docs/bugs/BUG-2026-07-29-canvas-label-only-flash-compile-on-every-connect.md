---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-29
flaw: Connect treated as a compile...
package: node-sdk
fixed: yes
---

### BUG-2026-07-29 — Canvas label-only flash + compile-on-every-connect

| Field                  | Value                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-07-29                                                                                                                                                                                                                                                                                                         |
| **Area**               | canvas · palette · server · node-sdk                                                                                                                                                                                                                                                                               |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                              |
| **Symptom**            | On load, canvas nodes showed labels only for ~1s before ports/inline appeared. WS log had almost no gap between `workflow.current.snapshot` and `palette.snapshot`, but `customPalette` went `compiling` → `ok` (~1.1s) and `palette.snapshot` was ~376 KB with nested RxJS Observable junk under `inferTypeFrom`. |
| **Repro**              | Start Langflower with custom packs; refresh the editor; watch node bodies and WS frames.                                                                                                                                                                                                                           |
| **Root cause**         | (1) Connect bootstrap always `compilingSnapshot` + `compileProjectNodes` per client. (2) `configureOutput` stored live `inferTypeFrom` Observables on port meta; `toPaletteDefinition` only stripped `getInstance`. (3) Canvas `startWith` empty palette painted label-only nodes before real catalogs.            |
| **Fix**                | Compile custom packs once in `createServer` before listen; connect emits warm `getSnapshot` only. Omit `inferTypeFrom` from stored output meta + strip in `toPaletteDefinition`. Remove canvas palette `startWith`s so `combineLatest` waits for real snapshots.                                                   |
| **Design flaw signal** | Connect treated as a compile trigger; probe handles left on serializable port meta; invented empty catalogs via `startWith` instead of waiting for readiness.                                                                                                                                                      |
| **Regression test**    | `packages/node-sdk/.../samples.test.ts` (JSON-safe passthrough meta); `packages/server/src/palette/palette.service.test.ts` (no Observable junk / compact palette JSON)                                                                                                                                            |
