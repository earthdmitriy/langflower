# Code regression — LEDGER

Memory across regression runs. Chunk reports hold the **open** findings;
this file holds what is **settled**, so a later run cannot re-file it as new.

Rules for reviewers and the orchestrator
([`.cursor/skills/langflower-code-regression/`](../../.cursor/skills/langflower-code-regression/SKILL.md)):

- A row here must **not** be reopened as a finding without a **new mechanism**:
  the code changed, a new consumer appeared, or a repro exists. "I looked more
  carefully" is not a mechanism.
- Do **not** store false-positives here or in chunk reports. If a previous
  row is not a listed class, delete it. Later runs must not re-file it.
- Closing a finding edits the chunk report (`status: fixed` + evidence) **and**
  appends § Closed here. Marking a row closed only in `SUMMARY.md` is forbidden.
- Severity is inherited. Raising it needs `promoted-from` plus a mechanism —
  see § Perennial suggestions for the items that must be justified or demoted.

## Closed

Drained and verified gone. Do not restore the deleted paths.

| id                                     | Chunk               | Class                 | Closed     | Evidence                                                                                                                              |
| -------------------------------------- | ------------------- | --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `server-bridge-seeded-run-lock`        | server-bridge       | two-writers           | 2026-09-19 | `startHeld` token around seed + start/resume; rollback only when this attempt never announced a `RunId` (BUG-2026-09-19)              |
| `ui-composer-stale-hitl-hydrate`       | ui-composer         | stale-hydrate         | 2026-09-19 | `foldAwaitingHitl` ignores same feed array / same `runId` after reset; `composer/tests/execution-hitl-fold.test.ts` (BUG-2026-09-19b) |
| `shared-wait-config-snapshot`          | shared              | dead-export           | 2026-09-19 | `waitLangflowerConfigSnapshot` deleted from `langflower-ws-waits.ts`                                                                  |
| `shared-settings-draft-row-id`         | shared              | two-writers           | 2026-09-19 | `mergeDraftPatch` / `providerConnectionKey` match and key by `row.id`                                                                 |
| `shared-workflow-list-wait`            | shared              | uncorrelated-wait     | 2026-09-19 | `requestWorkflowList` requires a list predicate instead of the next broadcast                                                         |
| `shared-runner-start-runid-wait`       | shared              | uncorrelated-wait     | 2026-09-19 | `startRunner` / `startRunnerFromNode` send and filter their own `runId`                                                               |
| `node-sdk-skip-execution-telemetry`    | node-sdk            | dead-export           | 2026-09-19 | `skipExecutionTelemetry` deleted on both the SDK instance type and the runtime twin                                                   |
| `node-sdk-define-node-as-never`        | node-sdk            | forbidden-op          | 2026-09-19 | `defineNode` no longer enters the reactive factory via `as never`                                                                     |
| `runtime-graph-has-cycle`              | runtime             | dead-export           | 2026-09-19 | `graphHasCycle` deleted from `runtime-helpers.ts`                                                                                     |
| `runtime-wire-scope-swallowed-throw`   | runtime             | fail-open-io          | 2026-09-19 | `wireScope` throw emits `['done', runId]` instead of an empty `catch`                                                                 |
| `runtime-missing-node-cluster`         | runtime             | fail-open-io          | 2026-09-19 | `getClusterByNodeId` / `startNode` return `false` on a missing node                                                                   |
| `legacy-langflower-ts-entry`           | server-core         | dead-export           | 2026-09-18 | `langflower.ts` stayed deleted (re-verified 2026-09-19)                                                                               |
| `legacy-enabled-tool-ids`              | common-nodes        | dead-export           | 2026-09-18 | `enabledToolIds` stayed deleted (re-verified 2026-09-19)                                                                              |
| `legacy-amend-input`                   | node-sdk            | dead-export           | 2026-09-18 | `ExecutionContext.amendInput` stayed deleted; host keys locked (re-verified 2026-09-19)                                               |
| `legacy-last-event-protocol`           | cli/launcher        | dead-export           | 2026-09-18 | No `last-event-writer.ts`, `last_event_line.rs`, or `Last event:` parse (re-verified 2026-09-19)                                      |
| `legacy-wait-session-ready`            | langflower-mcp      | uncorrelated-wait     | 2026-09-18 | `wait_session_ready` stayed deleted (re-verified 2026-09-19)                                                                          |
| `legacy-workflow-delete-snapshot-wait` | shared              | uncorrelated-wait     | 2026-09-18 | `requestWorkflowDeleteSnapshot` stayed deleted (re-verified 2026-09-19)                                                               |
| `legacy-filter-enabled-registrations`  | common-nodes        | dead-export           | 2026-09-18 | `filter-enabled-registrations` stayed deleted (re-verified 2026-09-19)                                                                |
| `legacy-client-ws-port-fallback`       | shared              | false-ready           | 2026-09-18 | Client `/ws` + `4010` fallback stayed deleted (re-verified 2026-09-19)                                                                |
| `mcp-output-emitted-catalog-ghost`     | langflower-mcp      | docs-ghost            | 2026-09-20 | `CURATED_TOOLS` `wait_event` / `get_execution_feed_tail` name `runner.port` and `in`/`out`/`done`; no `output-emitted` copy           |
| `server-bridge-resume-composer-drift`  | server-bridge       | two-writers           | 2026-09-20 | Resume and `beginSeededRun` share `isStartBusy` / `startHeld` and the same `!started` rollback                                        |
| `runtime-port-meta-test-ghost`         | runtime             | docs-ghost            | 2026-09-20 | `port-meta.test.ts` deleted                                                                                                           |
| `tools-timeout-not-cancel`             | tools               | found-bugs-recurrence | 2026-09-20 | bash `spawn` takes `ctx.signal`; memory `searchGrep` walk caps + abort                                                                |
| `tools-mcp-config-skip-silent`         | tools               | fail-open-io          | 2026-09-20 | Invalid id / missing server / empty command/url record `failures[]`                                                                   |
| `compiler-host-peer-subpath-paths`     | compiler            | found-bugs-recurrence | 2026-09-20 | `hostPathMappings` includes `@langflower/node-sdk/llm` and other published subpaths                                                   |
| `llm-session-machine-dead-export`      | common-nodes-ai     | dead-export           | 2026-09-20 | `runLlmSessionMachine` deleted; `runTurnFromState` stays                                                                              |
| `router-channels-jsdoc-ghost`          | common-nodes-domain | docs-ghost            | 2026-09-20 | Router JSDoc no longer teaches `routerChannels`                                                                                       |
| `file-nodes-ctx-files-docs`            | common-nodes-rest   | docs-ghost            | 2026-09-20 | Read/Write/Append NODE.md document `paths` + `denyPaths`                                                                              |
| `mcp-workflow-load-failed-wait`        | langflower-mcp      | uncorrelated-wait     | 2026-09-20 | Load races `workflow.load.failed` against correlated current                                                                          |
| `mcp-stdio-handle-queue-blocks-ping`   | langflower-mcp      | uncorrelated-wait     | 2026-09-20 | `ping` / `initialize` / `tools/list` skip the in-flight `tools/call` queue                                                            |
| `server-bridge-bootstrap-hot-swap`     | server-bridge       | fail-open-io          | 2026-09-20 | Bootstrap seed calls `compileAndHotSwapCustomNodes({ force: true })`                                                                  |
| `server-bridge-rpc-snapshot-wait`      | server-bridge       | uncorrelated-wait     | 2026-09-20 | Palette RPC waits for its own `requestId` snapshot                                                                                    |
| `server-core-config-read-fail-open`    | server-core         | fail-open-io          | 2026-09-20 | `ENOENT` vs `INVALID`; merge writes do not clobber an unparsed file                                                                   |
| `ui-editor-first-measure-persist`      | ui-editor           | false-ready           | 2026-09-20 | Divider persist only after non-zero row/aside measure                                                                                 |
| `ui-sidebar-inspect-provider-autobind` | ui-sidebar-feed     | two-writers           | 2026-09-20 | Inspector no longer persists `providerId` from inspect `effect`                                                                       |
| `ui-feed-latest-recovery-item`         | ui-feed             | dead-export           | 2026-09-20 | `latestRecoveryItem` / `isLatestRecoveryRow` deleted; `liveRecoveryTail` stays                                                        |
| `ui-canvas-entries-for-node-dead`      | ui-canvas           | dead-export           | 2026-09-20 | `entriesForNode` deleted                                                                                                              |
| `ui-palette-false-ready-startwith`     | ui-palette          | false-ready           | 2026-09-20 | Sidebar combines raw cached snapshots; no empty catalog `startWith`                                                                   |
| `ui-palette-seeded-category-expansion` | ui-palette          | false-ready           | 2026-09-20 | Category seed waits for both system and custom snapshots                                                                              |
| `ui-services-run-gate-snapshot-graph`  | ui-services         | two-writers           | 2026-09-20 | `hasRunnableGraph` reads `activeGraph()?.nodes.length`; snapshot type map deleted                                                     |
| `ui-services-liveness-started-wipe`    | ui-services         | found-bugs-recurrence | 2026-09-20 | Liveness adopt/keep `runId` on `started` (BUG-2026-08-18d)                                                                            |
| `integration-docs-ghost-matrix`        | integration-tests   | docs-ghost            | 2026-09-20 | TESTING.md / tests/README match live `execute-*.ws.test.ts` and fixtures                                                              |
| `launcher-docs-npm-script-twin`        | launcher            | docs-ghost            | 2026-09-20 | Author docs name root `launcher:*` only; crate `package.json` has no scripts                                                          |

## Wontfix (do not reopen without a new mechanism)

| id  | Chunk | Why accepted | Recorded |
| --- | ----- | ------------ | -------- |

None recorded yet. Add a row only after the user accepts the behaviour as-is;
reviewers must not self-assign `wontfix` to skip work.

## Perennial suggestions

Reported in two or more runs with no action. Next run: promote with a
mechanism, or move to Wontfix. Do not re-file as a fresh Suggestion.

| id                            | Chunk   | Runs                               | Note                                                                                                                                               |
| ----------------------------- | ------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-wire-scope-shape`    | runtime | 2026-07-22, 2026-09-19, 2026-09-20 | `runtime-runner.ts` `wireScope` size/shape. Still Suggestion; no action. Do not re-file as fresh.                                                  |
| `tools-permission-brace-glob` | tools   | 2026-07-22, 2026-09-19, 2026-09-20 | `matchPermissionPattern` `{md,mdx}`. 2026-09-20 **demoted** Important → Suggestion: 2026-09-19 promotion had no mechanism. Still no brace matcher. |
| `tools-args-asnumber-twin`    | tools   | 2026-07-22, 2026-09-19, 2026-09-20 | `builtins/args.ts` vs `domain/args.ts` `asNumber`. 2026-09-20 **demoted** Important → Suggestion for the same reason.                              |
