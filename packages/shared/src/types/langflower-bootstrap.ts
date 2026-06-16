import type {
	RunId,
	RuntimeRunnerEvent,
	RuntimeRunnerStatus,
} from '@langflower/runtime';
import type { ToolConfig } from './config.js';
import type { LangflowerConfig } from './langflower-config.js';
import type {
	EditorSelectedNodePayload,
	EditorSettingsSnapshotPayload,
} from './langflower-editor.js';
import type { ExecutionProgressStatus } from './langflower-server.js';

/** Editor divider positions (sidebar + composer sizes in px). */
export type DividerPositions = {
	readonly leftWidth: number;
	readonly rightWidth: number;
	readonly composerHeight: number;
};

/** Runner snapshot — run gate status for domain-specific delivery. */
export type RunnerSnapshotPayload = {
	readonly status: RuntimeRunnerStatus;
	readonly runId?: RunId;
	readonly activeWorkflowId?: string;
};

/**
 * Execution log feed replayed on connect / reconnect.
 *
 * **Runtime snapshot half** of the snapshot + event-sourcing model: replays
 * value-state port frames (`RuntimeRunnerEvent`) from the server runtime log.
 * After hydration, the UI appends only **new** live frames on `runner.*`
 * (`runner.output-emitted`, `runner.input-received`, …) — not a full resnapshot
 * on every port change.
 */
export type ExecutionFeedSnapshotPayload = {
	readonly runId: RunId;
	readonly workflowId: string;
	readonly status: ExecutionProgressStatus;
	/**
	 * Chronological feed frames for this run. May be empty when the run just
	 * started; UI still uses `runId` + `status` to stay in sync with runner.
	 */
	readonly events: readonly RuntimeRunnerEvent[];
};

/** Tool config snapshot — `.langflower/config.json` slice. */
export type ToolConfigSnapshotPayload = {
	readonly config: ToolConfig;
};

/**
 * Slim session bootstrap projection pushed on every WebSocket connect / reconnect.
 *
 * UI is **stateless** — it replaces the entire local model from this payload
 * (no merge, no local cache). Server emits once per connection before
 * `session.ready`.
 *
 * Contains only session-level config. Domain-specific data (viewport, runner,
 * execution feed, tool config, workflows) arrives as separate snapshot events.
 */
export type SessionStateSnapshotPayload = {
	/** Bumps when snapshot shape or semantics change. */
	readonly version: number;
	/** `.langflower/langflower.jsonc` project config. */
	readonly langflowerConfig: LangflowerConfig;
	/** Editor divider positions (sidebar + composer sizes). */
	readonly dividerPositions: DividerPositions;
	/** Currently selected canvas node (in memory, shared across tabs), or `null`. */
	readonly selectedNode: EditorSelectedNodePayload['node'];
	/**
	 * Settings aside chrome (open + scope). Empty effective providers force
	 * `{ open: true, scope: 'global' }` on connect for bootstrap onboarding.
	 */
	readonly settings: EditorSettingsSnapshotPayload;
};
