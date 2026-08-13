import type {
	PortTelemetry,
	RuntimeDoneTelemetry,
	RuntimeEdge,
	RuntimeEditorApi,
	RuntimeRunnerApi,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { message, WsBridgeConfig } from '@langflower/websocket-bridge';
import type {
	DividerPositions,
	ExecutionFeedSnapshotPayload,
	RunnerSnapshotPayload,
	SessionStateSnapshotPayload,
	ToolConfigSnapshotPayload,
} from './types/langflower-bootstrap.js';
import type {
	LangflowerConfigDraftDiscardRequestedPayload,
	LangflowerConfigDraftPatchRequestedPayload,
	LangflowerConfigDraftSnapshotPayload,
	LangflowerConfigSaveRequestedPayload,
	LangflowerConfigSnapshotPayload,
	LangflowerModelsCatalogSnapshotPayload,
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from './types/langflower-config.js';
import type {
	RunnerCheckpointDiscardRequestedPayload,
	RunnerCheckpointsSnapshotPayload,
	RunnerResumeFailedPayload,
	RunnerResumeRequestedPayload,
	WorkflowCheckpointSummary,
} from './types/workflow-checkpoint.js';
import type {
	EditorAddEdgeRequestedPayload,
	EditorAddNodeRequestedPayload,
	EditorPasteRequestedPayload,
	EditorSelectedNodePayload,
	EditorSelectNodeRequestedPayload,
	EditorSettingsRequestedPayload,
	EditorSettingsSnapshotPayload,
	EditorUpdateNodeRequestedPayload,
} from './types/langflower-editor.js';
import type { CustomPaletteSnapshotPayload } from './types/langflower-custom-palette.js';
import type {
	PaletteConfigPayload,
	PaletteNodeDefinition,
} from './types/langflower-palette.js';
import type { ProjectBootstrapResultPayload } from './types/langflower-project-bootstrap.js';
import type { SessionReadyPayload } from './types/langflower-server.js';
import type {
	CanvasViewport,
	WorkflowCurrentSnapshotPayload,
	WorkflowCurrentStatusPayload,
	WorkflowCopyPayload,
	WorkflowCreatePayload,
	WorkflowDeletePayload,
	WorkflowListSnapshotPayload,
	WorkflowLoadFailedPayload,
	WorkflowLoadPayload,
	WorkflowLoadRepairedPayload,
	WorkflowNodePersisted,
	WorkflowRenameCurrentPayload,
	WorkflowSaveCurrentPayload,
} from './types/langflower-workflow.js';

/**
 * Route tables merged into {@link langflowerWsConfig} (no transport).
 *
 * Each partial owns one event namespace prefix (`editor.*`, `runner.*`, ...).
 * Keep prefixes unique so the final spread merge cannot shadow another route.
 */
type WsBridgeRoutes = Pick<
	WsBridgeConfig,
	'fromClientToServer' | 'fromServerToClient'
>;

/**
 * **Editor** — live session canvas bound to {@link RuntimeEditorApi}.
 *
 * Context: per-WebSocket session holds a `RuntimeFacade.editor` mirror of what
 * the user sees on ngDiagram.
 *
 * **Canvas topology sync:** on reconnect the full graph document arrives in
 * `workflow.current.snapshot` (snapshot — replace projection; includes
 * `activeWorkflow.graph.viewport`). After bootstrap, structural edits append
 * `editor.*.delta` facts (event-sourcing friendly). Server broadcasts each
 * delta to all connected tabs. `workflow.current.snapshot` is reserved for
 * load/save/rename and connect — not live canvas edits.
 * Do **not** expect graph / viewport on {@link SessionStateSnapshotPayload}.
 *
 * Does not load/save workflow JSON — that is {@link workflowManagerConfig}.
 * Does not wire or run ports — that is {@link runnerConfig}.
 */
const editorConfig = {
	fromClientToServer: {
		/**
		 * Palette drop or explicit add-node intent — minimal
		 * {@link EditorAddNodeRequestedPayload}.
		 *
		 * UI sends node `type`, canvas `position`, and optional initial
		 * `params`, `inputs`, and `label`. Server owns `nodeId` assignment,
		 * default param/input filling, runtime materialization, graph insertion,
		 * and dirty marking when runner is not `'running'`.
		 *
		 * Emits `editor.addNode.delta` with added nodes or `[]` (broadcast).
		 */
		'editor.addNode.requested': message<EditorAddNodeRequestedPayload>(),

		/**
		 * Committed update for one existing node — unified
		 * {@link EditorUpdateNodeRequestedPayload}.
		 *
		 * Payload uses `nodeId` plus any combination of optional root-level
		 * `position`, `ui`, `params`, and `inputs`. Covers move, resize, label,
		 * panel params, inline params, and open input seed values. Server rejects
		 * payloads with no update fields and while the graph is locked.
		 *
		 * `ui` / `position` / panel `params` update the session document only
		 * (params never rebind the runtime mirror — they are next-run ctx seeds).
		 * `inputs` updates also rebind the runtime mirror while unlocked.
		 * Panel `params` apply even while `runnerStatus === 'running'`;
		 * `position` / `ui` / `inputs` return `[]` while locked.
		 *
		 * Emits `editor.updateNodes` with updated nodes or `[]` (broadcast).
		 */
		'editor.updateNode.requested':
			message<EditorUpdateNodeRequestedPayload>(),

		/**
		 * User connected two ports on the canvas.
		 *
		 * Server materializes runtime ports and calls
		 * {@link RuntimeEditorApi.addEdge}. Emits `editor.addEdge.delta`
		 * with added edges or `[]` (broadcast).
		 */
		'editor.addEdge.requested': message<EditorAddEdgeRequestedPayload>(),

		/**
		 * Clipboard paste batch — {@link EditorPasteRequestedPayload}.
		 *
		 * Client strips optimistic local clones then sends remappable
		 * `clientId`s. Server materializes nodes (honoring optional size on
		 * `position`) and edges in one dirty mark, then emits
		 * `editor.addNodes` then `editor.addEdges` (broadcast).
		 */
		'editor.paste.requested': message<EditorPasteRequestedPayload>(),

		/**
		 * User deleted an edge — payload is the canvas edge id.
		 */
		'editor.removeEdge.requested': message<string>(),

		/**
		 * User deleted a node — payload is the canvas node id.
		 */
		'editor.removeNode.requested': message<string>(),

		/**
		 * Canvas pan/zoom committed — shared session viewport slice.
		 *
		 * Does not lock with graph edits; server stores on session and
		 * broadcasts `editor.viewport.delta` to all tabs.
		 */
		'editor.viewport.requested': message<CanvasViewport>(),

		/**
		 * Divider positions changed — client sends on drag end.
		 *
		 * Server validates, updates session, broadcasts to all tabs, and
		 * persists to `langflower.jsonc`.
		 */
		'editor.dividers.requested': message<DividerPositions>(),

		/**
		 * Canvas selection changed — `nodeId` is the clicked node, or `null`
		 * to clear. Shared session state, like {@link CanvasViewport}: not
		 * locked with graph edits, not persisted to the workflow document.
		 *
		 * Server validates `nodeId` against the active graph, stores it on
		 * the session, and broadcasts `editor.nodeSelected` to all tabs.
		 * Selecting a node while Settings is open also closes Settings
		 * (`editor.settings.snapshot` with `open: false`).
		 */
		'editor.selectNode.requested':
			message<EditorSelectNodeRequestedPayload>(),

		/**
		 * Settings aside open/close + scope intent.
		 *
		 * When `open: true`, `scope` is required (`project` | `global`).
		 * When `open: false`, server keeps the prior scope. Session memory
		 * only — not written to `langflower.jsonc`. Broadcasts
		 * `editor.settings.snapshot` to all tabs.
		 */
		'editor.settings.requested': message<EditorSettingsRequestedPayload>(),
	},
	fromServerToClient: {
		/** Added nodes — client applies delta. Empty array = no change applied. */
		'editor.addNodes': message<WorkflowNodePersisted[]>(),

		/** Updated nodes — client applies delta. Empty array = no change applied. */
		'editor.updateNodes': message<WorkflowNodePersisted[]>(),

		/** Added edges — client merges / remaps ids. Empty array = no change applied. */
		'editor.addEdges': message<RuntimeEdge[]>(),

		/** Removed nodes — client deletes by `id`. Empty array = no change applied. */
		'editor.deleteNodes': message<WorkflowNodePersisted[]>(),

		/** Removed edges (incl. cascade) — client deletes by `id`. Empty array = no change applied. */
		'editor.deleteEdges': message<RuntimeEdge[]>(),

		/** Shared canvas viewport — client applies via ng-diagram `setViewport`. */
		'editor.viewport.delta': message<CanvasViewport>(),

		/** Divider positions — broadcast to all tabs after server persistence. */
		'editor.dividers.snapshot': message<DividerPositions>(),

		/**
		 * Authoritative selected node — full {@link WorkflowNodePersisted}
		 * plus its {@link PaletteNodeDefinition} (for Inspector panel
		 * `uiSchema` fields), or `node: null` when nothing is selected.
		 *
		 * Broadcast to all tabs after `editor.selectNode.requested`, after an
		 * `editor.updateNode.requested` that touches the selected node, and
		 * when the selection is invalidated (node removed, workflow switched).
		 * Client renders the Inspector directly from this payload — no local
		 * lookup against other node lists.
		 */
		'editor.nodeSelected': message<EditorSelectedNodePayload>(),

		/**
		 * Authoritative Settings aside chrome — `open` + `scope`.
		 * Broadcast after `editor.settings.requested` and when selecting a
		 * node closes Settings. Hydrated on connect via
		 * {@link SessionStateSnapshotPayload.settings}. When effective
		 * providers are empty, connect forces open Global Settings.
		 */
		'editor.settings.snapshot': message<EditorSettingsSnapshotPayload>(),
	},
} as const satisfies WsBridgeRoutes;

/**
 * **Runner** — session execution control and port telemetry.
 *
 * Context: {@link RuntimeRunnerApi} on the same session `RuntimeFacade` as
 * {@link editorConfig}.
 *
 * **Runtime sync (snapshot + event-sourcing):**
 * - **Reconnect:** dedicated `executionFeed.snapshot` (and `runner.snapshot`)
 *   replay value-state port frames (`RuntimeRunnerEvent`) so a refreshed tab
 *   restores mid-run UI. Not part of {@link SessionStateSnapshotPayload}.
 * - **Live:** only **new** `runner.*` telemetry frames — hot streams, no
 *   per-mutation full snapshot. Late subscribers rely on bootstrap replay first.
 *
 * Load workflows through {@link workflowManagerConfig} before using raw
 * `runner.*` intents; runner events operate on the graph already bound into
 * this session.
 */
const runnerConfig = {
	fromClientToServer: {
		/**
		 * Run the **current session graph** (already in editor). Wires all
		 * edges, seeds open inputs, sets status `'running'`.
		 *
		 * Server calls {@link RuntimeRunnerApi.start}. Emits `runner.started`
		 * (`runId`) then port telemetry.
		 */
		'runner.start.requested':
			message<Parameters<RuntimeRunnerApi['start']>>(),

		/**
		 * Run-from-node — wire only the weakly connected cluster of `nodeId`.
		 *
		 * Server calls {@link RuntimeRunnerApi.startNode}. Emits
		 * `runner.startNode.started`.
		 */
		'runner.startNode.requested':
			message<Parameters<RuntimeRunnerApi['startNode']>>(),

		/**
		 * Cancel active run (Stop). Unsubscribes wiring, status `'stopped'`.
		 *
		 * Server calls {@link RuntimeRunnerApi.interrupt} (`'cancel'`). Emits
		 * `runner.interrupted`.
		 */
		'runner.interrupt.requested':
			message<Parameters<RuntimeRunnerApi['interrupt']>[0]>(),

		/**
		 * Push a value into a node input via
		 * {@link RuntimeRunnerApi.pushIntoInput}.
		 *
		 * Used for canvas HITL gates (`inputsConfigs[].config.hitl`) and for
		 * soft Pause / Steer on the hidden LLM inventory port `steerControl`
		 * (docs ADR-032) — `{ kind: 'pause' | 'steer' | 'resume', … }`. One
		 * event targets one
		 * `nodeId` / `portId`. Multiple awaits may be open concurrently.
		 * Message name is historical; not limited to visible HITL chrome.
		 */
		'runner.hitl.event':
			message<Parameters<RuntimeRunnerApi['pushIntoInput']>[0]>(),

		/**
		 * Allow / Deny for a runtime permission ask inside the tool loop
		 * (not a canvas HITL port — see `runner.permission.ask`).
		 */
		'runner.permission.reply': message<RunnerPermissionReplyPayload>(),

		/**
		 * Clear the execution feed (work log). Server drops the runner event
		 * log and re-broadcasts an empty `executionFeed.snapshot`. No payload.
		 */
		'runner.executionFeed.clear.requested': message<{}>(),

		/**
		 * Continue from a durable checkpoint after Stop / process restart.
		 * Payload requires `runId` (picker-chosen entry; no latest-only omit).
		 */
		'runner.resume.requested': message<RunnerResumeRequestedPayload>(),

		/**
		 * Discard a durable checkpoint (corrupt / abandoned job).
		 */
		'runner.checkpoint.discard.requested':
			message<RunnerCheckpointDiscardRequestedPayload>(),
	},
	fromServerToClient: {
		/**
		 * {@link RuntimeRunnerApi.start} succeeded — payload is `runId`.
		 * Empty graph → instant `runner.done` and status `'idle'`.
		 */
		'runner.started': message<ReturnType<RuntimeRunnerApi['start']>>(),

		/**
		 * {@link RuntimeRunnerApi.startNode} succeeded — payload is `runId`.
		 */
		'runner.startNode.started':
			message<ReturnType<RuntimeRunnerApi['startNode']>>(),

		/**
		 * {@link RuntimeRunnerApi.resume} succeeded — payload is `runId`.
		 */
		'runner.resume.started':
			message<ReturnType<RuntimeRunnerApi['resume']>>(),

		/**
		 * Resume rejected — corrupt / stale / missing checkpoint, or busy.
		 */
		'runner.resume.failed': message<RunnerResumeFailedPayload>(),

		/**
		 * {@link RuntimeRunnerApi.interrupt} applied — payload is reason
		 * (today only `'cancel'`).
		 */
		'runner.interrupted':
			message<Parameters<RuntimeRunnerApi['interrupt']>[0]>(),

		/**
		 * Port signal — {@link PortTelemetry}; direction at `payload[0]` (`'in'` | `'out'`).
		 */
		'runner.port': message<PortTelemetry>(),

		/**
		 * Natural run end — {@link RuntimeDoneTelemetry}.
		 * Runner status becomes `'idle'`.
		 */
		'runner.done': message<RuntimeDoneTelemetry>(),

		/**
		 * Runtime permission ask for a gated harness tool call (feed + composer).
		 * Stays inside the internal tool loop — not a graph HITL edge.
		 */
		'runner.permission.ask': message<RunnerPermissionAskPayload>(),

		/**
		 * Server accepted one Allow / Deny reply for a still-pending permission
		 * ask. Every client removes that ask from its UI only on this fact.
		 */
		'runner.permission.accepted': message<RunnerPermissionReplyPayload>(),

		/**
		 * Resumable checkpoints for the active workflow (bootstrap + after
		 * Stop / discard / complete).
		 */
		'runner.checkpoints.snapshot':
			message<RunnerCheckpointsSnapshotPayload>(),

		/**
		 * One checkpoint write succeeded (stage boundary or Stop).
		 */
		'runner.checkpointed': message<WorkflowCheckpointSummary>(),
	},
} as const satisfies WsBridgeRoutes;

/**
 * **Bootstrap** — WebSocket connect / reconnect and cold-start projection.
 *
 * Context: UI holds **no durable state**. On every connection the server emits
 * a **slim** {@link SessionStateSnapshotPayload}, then **dedicated domain
 * snapshots**, then `session.ready`. Client **replaces** (not merges) each
 * slice from its own key — there is no fat all-domains bootstrap payload.
 *
 * **Slim `session.state.snapshot` only:** `version`, `langflowerConfig`,
 * `dividerPositions`, `selectedNode`, `settings`.
 *
 * **Do not put here** (dedicated keys, see emit order on
 * {@link langflowerWsConfig}): workflows, viewport, runner gate, execution
 * feed, tool config, palette.
 *
 * Authoritative emit order:
 * `packages/server/src/bridge/emit-bootstrap.ts`.
 */
const bootstrapConfig = {
	fromClientToServer: {},
	fromServerToClient: {
		/**
		 * Slim session projection — emitted on **every** connect and reconnect,
		 * first in the bootstrap sequence (before domain snapshots and
		 * `session.ready`).
		 *
		 * Payload is only {@link SessionStateSnapshotPayload}: `version`,
		 * `langflowerConfig`, `dividerPositions`, `selectedNode`, `settings`.
		 * Replace those slices from this event; hydrate workflows / runner /
		 * feed / viewport / tool config from their dedicated snapshot keys
		 * (see state-sync table on {@link langflowerWsConfig}). Live Settings
		 * updates after connect use `editor.settings.snapshot`.
		 */
		'session.state.snapshot': message<SessionStateSnapshotPayload>(),

		/**
		 * Terminal marker: bootstrap sequence for this connection is complete.
		 * Client enables diagram interactions after this.
		 *
		 * Follows slim `session.state.snapshot` **and** the dedicated domain
		 * snapshots on the same connection (`runner.snapshot`,
		 * `executionFeed.snapshot`, `toolConfig.snapshot`,
		 * `workflow.*.snapshot`, …). `version` bumps when bootstrap semantics
		 * change.
		 */
		'session.ready': message<SessionReadyPayload>(),

		/**
		 * Runner snapshot — run gate status (idle/running, runId, activeWorkflowId).
		 */
		'runner.snapshot': message<RunnerSnapshotPayload>(),

		/**
		 * Execution feed snapshot — replay of `RuntimeRunnerEvent` frames.
		 * `null` when no run exists or the feed was cleared.
		 */
		'executionFeed.snapshot':
			message<ExecutionFeedSnapshotPayload | null>(),

		/**
		 * Tool config snapshot — `.langflower/config.json` settings.
		 */
		'toolConfig.snapshot': message<ToolConfigSnapshotPayload>(),
	},
} as const satisfies WsBridgeRoutes;

/**
 * **Langflower project config** — project + global `langflower.jsonc` layers.
 *
 * Context: saved layers are **snapshot-only** (`langflower.config.snapshot`).
 * Unsaved Settings form state is a separate **session draft**
 * (`langflower.config.draft.*`) broadcast to all tabs. Effective merge is
 * project > global; payload also carries redacted layers + `globalPath`.
 * Slim {@link SessionStateSnapshotPayload} carries effective
 * `langflowerConfig` on reconnect (not the full layer payload).
 */
const langflowerProjectConfig = {
	fromClientToServer: {
		/**
		 * Settings Save — persist the **session draft** for one scope (or the
		 * payload when no draft is seeded), then broadcast
		 * {@link LangflowerConfigSnapshotPayload} and draft snapshot.
		 */
		'langflower.config.save.requested':
			message<LangflowerConfigSaveRequestedPayload>(),

		/**
		 * Replace the session Settings draft for a scope. Server probes
		 * connection when a provider `baseURL` / `apiKey` changes.
		 */
		'langflower.config.draft.patch.requested':
			message<LangflowerConfigDraftPatchRequestedPayload>(),

		/**
		 * Reset the session draft from the saved layer for a scope.
		 */
		'langflower.config.draft.discard.requested':
			message<LangflowerConfigDraftDiscardRequestedPayload>(),

		/**
		 * Settings → Bootstrap — force-reseed skeleton templates into the
		 * open project (workflows / skills / my-nodes / instructions).
		 * Never rewrites `langflower.jsonc`. Rejected while a run is active.
		 * Replies with {@link ProjectBootstrapResultPayload}; on success also
		 * broadcasts workflow / custom-palette snapshots.
		 */
		'project.bootstrap.requested': message<Record<string, never>>(),
	},
	fromServerToClient: {
		/**
		 * Authoritative config — emitted per connection after `session.ready`
		 * and after Settings Save. Includes effective + layer slices.
		 */
		'langflower.config.snapshot':
			message<LangflowerConfigSnapshotPayload>(),

		/**
		 * Authoritative unsaved Settings draft + connection statuses for one
		 * scope. Session memory; broadcast after patch / discard / save /
		 * scope change / connect.
		 */
		'langflower.config.draft.snapshot':
			message<LangflowerConfigDraftSnapshotPayload>(),

		/**
		 * Authoritative live model catalogs for all configured providers.
		 * Server-pushed after {@link LangflowerConfigSnapshotPayload} on
		 * connect (async, non-blocking) and after Settings Save. Static
		 * jsonc models remain in config; UI merges both. No client refresh
		 * intent — server owns fetch.
		 */
		'langflower.models.catalog.snapshot':
			message<LangflowerModelsCatalogSnapshotPayload>(),

		/**
		 * Outcome of `project.bootstrap.requested` (Result — expected failures
		 * are `ok: false`, not throws).
		 */
		'project.bootstrap.result': message<ProjectBootstrapResultPayload>(),
	},
} as const satisfies WsBridgeRoutes;

/**
 * **Palette** — system (built-in) node registry for canvas drop.
 *
 * Context: **snapshot-only** catalog. Server pushes `palette.snapshot` on
 * connect (after `langflower.config.snapshot`). Custom packs use
 * {@link customPaletteConfig}. Multi-tab: broadcast snapshot so every tab
 * shares the same catalog without RPC-style replies.
 */
const paletteConfig = {
	fromClientToServer: {
		/**
		 * Refresh the system palette catalog (no custom-node compile).
		 *
		 * Emits `palette.snapshot`. May broadcast to other connections.
		 */
		'palette.reload.requested': message<Record<string, never>>(),
	},
	fromServerToClient: {
		/**
		 * Authoritative **system** catalog — outcome of
		 * `palette.reload.requested` or connect bootstrap.
		 */
		'palette.snapshot': message<PaletteConfigPayload>(),
	},
} as const satisfies WsBridgeRoutes;

/**
 * **Custom palette** — project packs under `.langflower/nodes/`.
 *
 * Source of truth for the Custom nodes UI section: compiled nodes, pack
 * errors (same content as each pack's `COMPILATION_ERRORS.md`), and status.
 */
const customPaletteConfig = {
	fromClientToServer: {
		/**
		 * Recompile project custom packs and refresh the custom registry.
		 *
		 * Server broadcasts `customPalette.snapshot` (`compiling`, then final).
		 */
		'customPalette.update.requested': message<Record<string, never>>(),
	},
	fromServerToClient: {
		/**
		 * Authoritative custom-node slice for the Custom palette section.
		 */
		'customPalette.snapshot': message<CustomPaletteSnapshotPayload>(),
	},
} as const satisfies WsBridgeRoutes;

/**
 * **Workflow manager** — persisted workflows, catalog, active session workflow.
 *
 * ## Why snapshots (not command replies)
 *
 * Several browser tabs can share one server session. Catalog and active-workflow
 * changes must stay in sync across tabs without asking “which command caused this?”
 *
 * RPC-style replies break in that model:
 *
 * 1. Tab A: `workflow.saveCurrent.requested`
 * 2. Server → all tabs: `workflow.saved` (metadata only)
 * 3. Tab B: saved *what*? Which workflow is active? Is the catalog stale?
 *
 * Instead: after every intent the server **broadcasts authoritative state slices**.
 * Every tab applies the same snapshot — no correlation id, no per-command reply.
 *
 * ## Flow
 *
 * 1. Client emits `workflow.*.requested` (intent only).
 * 2. Server executes (or skips mutation on failure).
 * 3. Server pushes snapshot(s) — to **all** connected clients when the slice
 *    changed globally (catalog save/delete), otherwise at least to the requester.
 *
 * Two snapshot contexts (apply independently):
 * - {@link WorkflowListSnapshotPayload} — catalog metadata rows
 * - {@link WorkflowCurrentSnapshotPayload} — active workflow document + dirty flag
 *
 * On failure the server still pushes the current authoritative slice (unchanged
 * content is valid — tabs stay aligned). UI verifies outcomes by reading the
 * snapshot, not by matching a reply to “my” command.
 *
 * On connect, both slices arrive as dedicated `workflow.list.snapshot` /
 * `workflow.current.snapshot` events (not inside
 * {@link SessionStateSnapshotPayload}).
 */
const workflowManagerConfig = {
	fromClientToServer: {
		/**
		 * Serialize the session's in-memory active workflow to disk.
		 * Server builds the save payload from `session.activeWorkflow`.
		 */
		'workflow.saveCurrent.requested': message<WorkflowSaveCurrentPayload>(),

		/**
		 * Rename active workflow identity (name + id + `{id}.json`).
		 * Partial save: metadata is persisted immediately; dirty graph edits
		 * remain uncommitted until `workflow.saveCurrent.requested`.
		 */
		'workflow.renameCurrent.requested':
			message<WorkflowRenameCurrentPayload>(),

		/**
		 * Start an empty workflow in the session (dirty, not written to disk).
		 */
		'workflow.create.requested': message<WorkflowCreatePayload>(),

		/**
		 * Copy a persisted workflow to a new `{id}-copy.json` file and open it.
		 */
		'workflow.copy.requested': message<WorkflowCopyPayload>(),

		/**
		 * Load one workflow by `workflowId` from disk into the server session
		 * (bind-replay into editor).
		 */
		'workflow.load.requested': message<WorkflowLoadPayload>(),

		/**
		 * Refresh workflow catalog (metadata only, no graphs).
		 */
		'workflow.list.requested': message<Record<string, never>>(),

		/**
		 * Delete one persisted workflow by id.
		 */
		'workflow.delete.requested': message<WorkflowDeletePayload>(),
	},
	fromServerToClient: {
		/**
		 * Active workflow document and dirty/pristine state.
		 * Pushed after workflow manager intents (load/save/rename/delete).
		 */
		'workflow.current.snapshot': message<WorkflowCurrentSnapshotPayload>(),

		/**
		 * Load rejected — missing file, invalid graph / edge, or locked
		 * editor. Unicast to the requester (see `runner.resume.failed`).
		 * Server still follows with `workflow.current.snapshot` for the
		 * unchanged active document.
		 */
		'workflow.load.failed': message<WorkflowLoadFailedPayload>(),

		/**
		 * Load opened after stripping unknown nodes / unbindable edges.
		 * Unicast to the requester; active document is dirty until Save.
		 * Server still follows with `workflow.current.snapshot`.
		 */
		'workflow.load.repaired': message<WorkflowLoadRepairedPayload>(),

		/**
		 * Dirty/pristine flag only — broadcast after editor mutations without
		 * replacing the canvas graph (see `editor.*.delta`).
		 */
		'workflow.currentStatus.snapshot':
			message<WorkflowCurrentStatusPayload>(),

		/**
		 * Workflow catalog (metadata only). Pushed on list intent and after
		 * save/delete when the on-disk catalog changes.
		 */
		'workflow.list.snapshot': message<WorkflowListSnapshotPayload>(),
	},
} as const satisfies WsBridgeRoutes;

/**
 * Typed internal WebSocket registry for co-versioned Langflower
 * UI/server/runtime (ws-bridge, **pure event-driven**).
 *
 * Runtime APIs are the protocol source of truth by design: changing runtime
 * method shapes should fail fast at compile time across server and UI instead
 * of spawning DTO adapters that can drift. The shared transport path/port lives
 * here for the same reason — client and server consume one source of truth.
 *
 * No RPC envelopes, no `requestId`. Client emits `*.requested` intents; the server
 * executes and broadcasts authoritative snapshots (see {@link workflowManagerConfig}
 * for multi-tab workflow sync). Clients **replace local projection from snapshots**
 * — they do not correlate replies to “their” command.
 *
 * ## State sync model (snapshot vs event-sourcing)
 *
 * Several tabs may share one server session. On **connect / reconnect** (browser
 * refresh, new tab) each client must reach the same authoritative state without
 * replaying full history. Domains use **dedicated snapshot keys** — slim
 * {@link SessionStateSnapshotPayload} is **not** a fat reconnect bundle.
 *
 * | Domain | Model | Reconnect | Live updates |
 * | ------ | ----- | --------- | -------------- |
 * | Session chrome (dividers, selection, settings) + effective `langflowerConfig` | **snapshot only** | slim `session.state.snapshot` | dividers / selection / settings via `editor.dividers.snapshot` / `editor.nodeSelected` / `editor.settings.snapshot` |
 * | Langflower project config (full layers) | **snapshot only** | `langflower.config.snapshot` after `session.ready`; effective also in slim session | full slice replace |
 * | Live provider model catalogs | **snapshot only** | `langflower.models.catalog.snapshot` after config (async on connect) + after Save | full map replace |
 * | Tool config | **snapshot only** | `toolConfig.snapshot` | full slice replace |
 * | Workflow catalog + active doc | **snapshot only** | `workflow.list.snapshot` / `workflow.current.snapshot` | full slice replace |
 * | Workflow dirty/pristine | **snapshot only** | `currentStatus` in `workflow.current.snapshot`; `workflow.currentStatus.snapshot` after editor mutations | status slice replace |
 * | Palette (system) | **snapshot only** | `palette.snapshot` on connect (server-pushed) | full slice replace |
 * | Custom palette | **snapshot only** | `customPalette.snapshot` after system palette | full slice replace |
 * | Canvas graph (topology) | **snapshot** in workflow slice | `activeWorkflow` in `workflow.current.snapshot` | `editor.*.delta` (broadcast to all tabs) |
 * | Canvas viewport (pan/zoom) | **snapshot + event-sourcing** | `activeWorkflow.graph.viewport` in `workflow.current.snapshot` | `editor.viewport.delta` (broadcast to all tabs) |
 * | Runtime / execution on graph | **snapshot + event-sourcing** | `runner.snapshot` + `executionFeed.snapshot` (+ `runner.checkpoints.snapshot`) | `runner.*` (`RuntimeRunnerEvent`) — **new events only** |
 *
 * **Reconnect sequence** (authoritative:
 * `packages/server/src/bridge/emit-bootstrap.ts`):
 * `session.state.snapshot` → `runner.snapshot` → `executionFeed.snapshot` →
 * `runner.checkpoints.snapshot` → `toolConfig.snapshot` →
 * `workflow.list.snapshot` → `workflow.current.snapshot` → `session.ready` →
 * `langflower.config.snapshot` → (async) `langflower.models.catalog.snapshot` →
 * `palette.snapshot` → `customPalette.snapshot`. Later workflow intents
 * broadcast `workflow.*.snapshot`.
 *
 * **Runtime after reconnect:** hydrate the log / port state from
 * `executionFeed.snapshot`, then append live `runner.port`, `runner.done`, … — no replay of the full runner
 * history on every mutation, only the dedicated feed snapshot plus new frames.
 *
 * Partials: {@link editorConfig} | {@link runnerConfig} |
 * {@link bootstrapConfig} | {@link langflowerProjectConfig} |
 * {@link paletteConfig} | {@link customPaletteConfig} |
 * {@link workflowManagerConfig}.
 */
export const langflowerWsConfig = {
	transport: { path: '/ws', port: 4010 },
	fromClientToServer: {
		...editorConfig.fromClientToServer,
		...runnerConfig.fromClientToServer,
		...bootstrapConfig.fromClientToServer,
		...langflowerProjectConfig.fromClientToServer,
		...paletteConfig.fromClientToServer,
		...customPaletteConfig.fromClientToServer,
		...workflowManagerConfig.fromClientToServer,
	},
	fromServerToClient: {
		...editorConfig.fromServerToClient,
		...runnerConfig.fromServerToClient,
		...bootstrapConfig.fromServerToClient,
		...langflowerProjectConfig.fromServerToClient,
		...paletteConfig.fromServerToClient,
		...customPaletteConfig.fromServerToClient,
		...workflowManagerConfig.fromServerToClient,
	},
} as const satisfies WsBridgeConfig;
