# Plan: Split monolithic snapshot + deferred UI rendering

## Problem

1. `session.state.snapshot` bundles unrelated domains (workflow, runner, viewport,
   config, execution feed). UI must merge/coordinate them.
2. Other domain snapshots (`workflow.list.snapshot`, `workflow.current.snapshot`)
   duplicate data already in the monolithic payload.
3. UI components render before required snapshots arrive, forcing intermediate
   state handling.

## Goal

Each domain gets its own snapshot event. `session.state.snapshot` becomes a thin
bootstrap signal. UI components wait for their required snapshot before rendering.

## Extensions (from spec review)

- **Disk persistence:** Divider positions persist to `.langflower/langflower.jsonc`
  via `LangflowerConfigService.setDividerPositions()`.
- **Cross-tab sync:** `editor.dividers.snapshot` broadcast to all tabs on change.
- **Version bump:** `SNAPSHOT_VERSION` 3 → 4.

---

## Step 1: Slim down `SessionStateSnapshotPayload`

**File:** `packages/shared/src/types/langflower-bootstrap.ts`

```ts
// BEFORE — 9 fields bundling everything
export type SessionStateSnapshotPayload = {
	readonly version: number;
	readonly workflows: readonly WorkflowListEntry[];
	readonly activeWorkflow: WorkflowLoadedPayload | null;
	readonly currentStatus: WorkflowCurrentStatusPayload;
	readonly runner: SessionRunnerSnapshot;
	readonly executionFeed: SessionExecutionFeedSnapshot | null;
	readonly toolConfig: Readonly<Record<string, unknown>>;
	readonly langflowerConfig: LangflowerConfig;
	readonly viewport: SessionCanvasViewport | null;
};

// AFTER — 3 fields, thin bootstrap signal
export type SessionStateSnapshotPayload = {
	readonly version: number;
	readonly langflowerConfig: LangflowerConfig;
	readonly dividerPositions: DividerPositions;
};
```

**Add new types:**

```ts
export type DividerPositions = {
	readonly leftWidth: number; // default 280, range 224–480
	readonly rightWidth: number; // default 360, range 288–560
	readonly composerHeight: number; // default 168, range 120–320
};

export type RunnerSnapshotPayload = {
	readonly status: RuntimeRunnerStatus;
	readonly runId?: string;
	readonly activeWorkflowId?: string;
};

export type ExecutionFeedSnapshotPayload = {
	readonly runId: string;
	readonly workflowId: string;
	readonly status: ExecutionProgressStatus;
	readonly events: readonly RuntimeRunnerEvent[];
};

export type ToolConfigSnapshotPayload = {
	readonly config: Readonly<Record<string, unknown>>;
};

export type ViewportSnapshotPayload = SessionCanvasViewport | null;
```

**Delete:** `SessionRunnerSnapshot`, `SessionExecutionFeedSnapshot` — replaced by
`RunnerSnapshotPayload`, `ExecutionFeedSnapshotPayload`.

**Bump:** `SNAPSHOT_VERSION` from 3 → 4 in `langflower-session.ts`.

**Extend `LangflowerConfig`:** Add optional `dividerPositions` field to
`packages/shared/src/types/langflower-config.ts`:

```ts
export type LangflowerConfig = {
	readonly currentWorkflowId?: string;
	readonly model?: string;
	readonly provider?: Readonly<Record<string, unknown>>;
	readonly dividerPositions?: DividerPositions;
};
```

---

## Step 2: Add new WS events

**File:** `packages/shared/src/langflower-bus-config.ts`

Add to `bootstrapConfig.fromServerToClient`:

```ts
'viewport.snapshot': message<ViewportSnapshotPayload>(),
'runner.snapshot': message<RunnerSnapshotPayload>(),
'executionFeed.snapshot': message<ExecutionFeedSnapshotPayload>(),
'toolConfig.snapshot': message<ToolConfigSnapshotPayload>(),
```

Add to `editorConfig.fromClientToServer`:

```ts
'editor.dividers.requested': message<DividerPositions>(),
```

Add to `editorConfig.fromServerToClient`:

```ts
'editor.dividers.snapshot': message<DividerPositions>(),
```

---

## Step 3: Slim down `build-session-snapshot.ts`

**File:** `packages/server/src/session/build-session-snapshot.ts`

Rename to `build-session-bootstrap.ts`. Remove workflowService, configService deps:

```ts
export async function buildSessionBootstrap(
	session: LangflowerSession,
	langflowerConfigService: LangflowerConfigService,
): Promise<SessionStateSnapshotPayload> {
	const langflowerConfig = await langflowerConfigService.read();
	return {
		version: LangflowerSession.snapshotVersion,
		langflowerConfig,
		dividerPositions: session.dividerPositions ?? DEFAULT_DIVIDER_POSITIONS,
	};
}
```

---

## Step 4: Add `dividerPositions` to session

**File:** `packages/server/src/session/langflower-session.ts`

```ts
import { DEFAULT_DIVIDER_POSITIONS } from '@langflower/shared/langflower.js';
import type { DividerPositions } from '@langflower/shared/langflower.js';

// Add field:
dividerPositions: DividerPositions = DEFAULT_DIVIDER_POSITIONS;
```

---

## Step 5: Send domain snapshots on connect

**File:** `packages/server/src/bridge/attach-langflower-bridge.ts`

Replace single `clientEmit(client, 'session.state.snapshot', snapshot)`:

```ts
// Bootstrap (thin)
clientEmit(client, 'session.state.snapshot', {
	version: LangflowerSession.snapshotVersion,
	langflowerConfig,
	dividerPositions: session.dividerPositions,
});

// Domain snapshots
clientEmit(client, 'viewport.snapshot', session.canvasViewport);
clientEmit(client, 'runner.snapshot', {
	status: session.runnerStatus,
	...(session.runId !== undefined ? { runId: session.runId } : {}),
	...(session.activeWorkflowId !== undefined
		? { activeWorkflowId: session.activeWorkflowId }
		: {}),
});
clientEmit(client, 'executionFeed.snapshot', session.buildExecutionFeed());
clientEmit(client, 'toolConfig.snapshot', { config: toolConfig });
clientEmit(client, 'workflow.list.snapshot', { workflows });
clientEmit(client, 'workflow.current.snapshot', {
	activeWorkflow: session.activeWorkflow,
	currentStatus: { status: session.currentStatus },
});
clientEmit(client, 'langflower.config.snapshot', { config: langflowerConfig });
clientEmit(client, 'palette.snapshot', paletteResult.payload);
clientEmit(client, 'session.ready', {
	version: LangflowerSession.sessionReadyVersion,
});
```

Add handler for divider persistence + cross-tab broadcast:

```ts
bridge['editor.dividers.requested'].subscribe((raw) => {
	if (!isInboundEvent<DividerPositions>(raw)) return;
	session.dividerPositions = raw.payload;
	bridgeEmit(bridge, 'editor.dividers.snapshot', raw.payload);
	// Persist to disk (fire-and-forget)
	void context.langflowerConfigService.setDividerPositions(raw.payload);
});
```

**File:** `packages/server/src/config/langflower-config.service.ts`

Add method:

```ts
async setDividerPositions(positions: DividerPositions): Promise<void> {
  const raw = await this.readRaw();
  const merged = mergeLangflowerConfig(raw, { dividerPositions: positions });
  await fs.mkdir(path.dirname(this.configPath()), { recursive: true });
  await fs.writeFile(this.configPath(), serializeLangflowerConfig(merged), 'utf8');
}
```

Update `mergeLangflowerConfig` to handle `dividerPositions`:

```ts
if ('dividerPositions' in patch && isRecord(patch.dividerPositions)) {
	merged.dividerPositions = patch.dividerPositions;
}
```

---

## Step 6: UI — template-first snapshot handling

**Pattern:**

```html
@if (bus['event.name'] | async; as data) {
<inner-component [data]="data" />
}
```

Component never renders until snapshot arrives. No intermediate state.

### `editor-shell.component.ts`

**File:** `packages/ui/src/app/features/editor/components/editor-shell.component.ts`

Init `leftWidth`, `rightWidth`, `composerHeight` from `session.state.snapshot.dividerPositions`.
On drag end, emit `editor.dividers.requested`.

Subscribe to `editor.dividers.snapshot` for cross-tab sync:

```ts
subscription.add(
	this.bridge.raw['editor.dividers.snapshot'].subscribe((positions) => {
		this.leftWidth.set(positions.leftWidth);
		this.rightWidth.set(positions.rightWidth);
		this.composerHeight.set(positions.composerHeight);
	}),
);
```

### `bridge-diagram.service.ts`

**File:** `packages/ui/src/app/services/bridge-diagram.service.ts`

Replace `session.state.snapshot` subscriber (lines 704-728) with:

- `viewport.snapshot` → canvas viewport
- `runner.snapshot` → graph lock state
- `workflow.current.snapshot` → canvas hydration (already exists at line 752)
- `session.state.snapshot` → only `dividerPositions` for layout init

### `workflow-topbar.component.ts`

**File:** `packages/ui/src/app/features/topbar/components/workflow-topbar.component.ts`

Remove `session.state.snapshot` from merge (line 197). Workflow data comes from
`workflow.list.snapshot` and `workflow.current.snapshot` only.

### `run-button.component.ts`

**File:** `packages/ui/src/app/features/editor/components/run-button.component.ts`

Subscribe to `runner.snapshot` instead of `session.state.snapshot`.

---

## Step 7: Update tests

- `packages/ui/src/app/features/canvas/tests/flow-canvas.component.test.ts` —
  update mock subjects, add `viewport.snapshot`, `runner.snapshot`,
  `toolConfig.snapshot` subjects
- `tests/integration/ws/` — update WS protocol assertions

---

## Step 8: Dead code sweep

```bash
node build/tools/agent-run.mjs dead-code
# Delete: SessionRunnerSnapshot, SessionExecutionFeedSnapshot (if orphaned)
node build/tools/agent-run.mjs check-exports
node build/tools/agent-run.mjs verify
```

---

## Summary

| Change                                            | Files                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Slim `SessionStateSnapshotPayload`                | `langflower-bootstrap.ts`                                                     |
| Add `DividerPositions` + snapshot payloads        | `langflower-bootstrap.ts`                                                     |
| Extend `LangflowerConfig` with `dividerPositions` | `langflower-config.ts`                                                        |
| Add WS events (incl. `editor.dividers.snapshot`)  | `langflower-bus-config.ts`                                                    |
| Rename + slim `build-session-snapshot`            | `build-session-bootstrap.ts`                                                  |
| Add `dividerPositions` to session + bump version  | `langflower-session.ts`                                                       |
| Send domain snapshots on connect                  | `attach-langflower-bridge.ts`                                                 |
| Persist dividers to disk                          | `langflower-config.service.ts`                                                |
| UI template-first pattern + divider sync          | `editor-shell`, `bridge-diagram`, `workflow-topbar`, `run-button`             |
| Update tests                                      | `flow-canvas.component.test.ts`, `langflower-ws-client.ts`, integration tests |
| Dead code sweep                                   | `dead-code` → delete → `check-exports` → `verify`                             |
