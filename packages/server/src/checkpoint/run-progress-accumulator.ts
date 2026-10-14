import {
	isPortTelemetry,
	type RunId,
	type RuntimeRunnerEvent,
} from '@langflower/runtime';
import { toCheckpointJsonValue } from '@langflower/shared/checkpoint/json-value.js';
import type {
	WorkflowSessionOutputSnapshots,
	WorkflowSessionPortSnapshot,
} from '@langflower/shared/types/workflow-session.js';

type OutputSnapshotMap = Map<string, Map<string, WorkflowSessionPortSnapshot>>;

/**
 * JSON-safe output progress for the active run.
 * The session store appends a point from this snapshot. This type does not
 * write `.langflower/runs`.
 */
export type RunProgress = {
	readonly runId: string;
	readonly completedNodeIds: readonly string[];
	readonly outputSnapshots: WorkflowSessionOutputSnapshots;
	readonly label?: string;
	readonly unsupported?: string;
};

/**
 * Accumulates JSON-safe output snapshots for one run.
 * A boundary emission returns true so the caller can append one point.
 * Replays of a node that is already completed (resume overlay) do not.
 */
export class RunProgressAccumulator {
	private active:
		| {
				readonly runId: string;
				readonly completedNodeIds: Set<string>;
				readonly outputSnapshots: OutputSnapshotMap;
		  }
		| undefined;
	private unsupportedValue: string | undefined;
	private boundaryLabel: string | undefined;

	beginRun(runId: RunId): void {
		this.unsupportedValue = undefined;
		this.boundaryLabel = undefined;
		this.active = {
			runId: String(runId),
			completedNodeIds: new Set(),
			outputSnapshots: new Map(),
		};
	}

	/** Continue accumulation from a stored point. Does not rewrite that point. */
	hydrate(progress: RunProgress): void {
		this.unsupportedValue = undefined;
		this.boundaryLabel = undefined;
		const outputSnapshots: OutputSnapshotMap = new Map();

		for (const [nodeId, ports] of Object.entries(
			progress.outputSnapshots,
		)) {
			outputSnapshots.set(nodeId, new Map(Object.entries(ports)));
		}

		this.active = {
			runId: progress.runId,
			completedNodeIds: new Set(progress.completedNodeIds),
			outputSnapshots,
		};
	}

	/**
	 * Accumulate a live output emission.
	 *
	 * @returns `true` when this emission is a new checkpoint boundary.
	 */
	observe(
		event: RuntimeRunnerEvent,
		boundary?: { readonly label?: string },
	): boolean {
		if (
			this.active === undefined ||
			!isPortTelemetry(event) ||
			event[0] !== 'out'
		) {
			return false;
		}

		const [, nodeIdRaw, portId, response] = event;

		if (!('value' in response) || typeof portId !== 'string') {
			return false;
		}

		const nodeId = String(nodeIdRaw);
		const jsonValue = toCheckpointJsonValue(response.value);

		if (jsonValue === undefined) {
			this.unsupportedValue = `${nodeId}.${portId}`;
			if (boundary === undefined) {
				return false;
			}

			const alreadyCompleted = this.active.completedNodeIds.has(nodeId);

			if (alreadyCompleted) {
				return false;
			}

			this.boundaryLabel = boundary.label;
			return true;
		}

		const alreadyCompleted = this.active.completedNodeIds.has(nodeId);
		let ports = this.active.outputSnapshots.get(nodeId);

		if (ports === undefined) {
			ports = new Map();
			this.active.outputSnapshots.set(nodeId, ports);
		}

		ports.set(portId, {
			state: 'value',
			value: jsonValue,
		});
		this.active.completedNodeIds.add(nodeId);

		if (boundary === undefined || alreadyCompleted) {
			return false;
		}

		this.boundaryLabel = boundary.label;
		return true;
	}

	/** Copy of the progress for the boundary `observe` just accepted. */
	snapshot(): RunProgress | undefined {
		if (this.active === undefined) {
			return undefined;
		}

		const outputSnapshots: Record<
			string,
			Record<string, WorkflowSessionPortSnapshot>
		> = {};

		for (const [nodeId, ports] of this.active.outputSnapshots) {
			outputSnapshots[nodeId] = Object.fromEntries(ports);
		}

		const label = this.boundaryLabel;
		const unsupported = this.unsupportedValue;
		this.boundaryLabel = undefined;

		return {
			runId: this.active.runId,
			completedNodeIds: [...this.active.completedNodeIds],
			outputSnapshots,
			...(label !== undefined ? { label } : {}),
			...(unsupported !== undefined ? { unsupported } : {}),
		};
	}

	clearActive(): void {
		this.active = undefined;
		this.unsupportedValue = undefined;
		this.boundaryLabel = undefined;
	}
}
