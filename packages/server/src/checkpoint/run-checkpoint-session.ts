import type { NodeId, RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import {
	buildWorkflowFingerprint,
	toCheckpointJsonValue,
	type WorkflowCheckpoint,
	type WorkflowCheckpointPortSnapshot,
	type WorkflowCheckpointSummary,
	type WorkflowLoadedPayload,
} from '@langflower/shared/langflower.js';
import {
	summarizeCheckpoint,
	WorkflowCheckpointStore,
} from './workflow-checkpoint-store.js';

type OutputSnapshotMap = Map<
	string,
	Map<string, WorkflowCheckpointPortSnapshot>
>;

/**
 * Per-session accumulator for durable checkpoints (ADR-018 D).
 *
 * Always accumulates JSON-safe output snapshots. Persists only when an
 * explicit boundary fires (`createCheckpoint` / `common-checkpoint`), or
 * when Stop/complete updates a run that already crossed a boundary.
 */
export class RunCheckpointSession {
	private readonly store: WorkflowCheckpointStore;
	private active:
		| {
				readonly runId: string;
				readonly workflowId: string;
				readonly workflowFingerprint: string;
				readonly completedNodeIds: Set<string>;
				readonly outputSnapshots: OutputSnapshotMap;
				status: WorkflowCheckpoint['status'];
				boundaryCrossed: boolean;
				label: string | undefined;
		  }
		| undefined;
	private unsupportedValue: string | undefined;
	/** Serialize disk writes — concurrent stage boundaries race on Windows rename. */
	private persistChain: Promise<unknown> = Promise.resolve();

	constructor(projectDir: string) {
		this.store = new WorkflowCheckpointStore(projectDir);
	}

	getStore(): WorkflowCheckpointStore {
		return this.store;
	}

	beginRun(runId: RunId, workflow: WorkflowLoadedPayload): void {
		this.unsupportedValue = undefined;
		this.active = {
			runId: String(runId),
			workflowId: workflow.workflowId,
			workflowFingerprint: buildWorkflowFingerprint(
				workflow.graph.nodes,
				workflow.graph.edges,
			),
			completedNodeIds: new Set(),
			outputSnapshots: new Map(),
			status: 'running',
			boundaryCrossed: false,
			label: undefined,
		};
	}

	hydrateFromCheckpoint(
		checkpoint: WorkflowCheckpoint,
		workflow: WorkflowLoadedPayload,
	): void {
		this.unsupportedValue = undefined;
		const outputSnapshots: OutputSnapshotMap = new Map();
		for (const [nodeId, ports] of Object.entries(
			checkpoint.outputSnapshots,
		)) {
			outputSnapshots.set(nodeId, new Map(Object.entries(ports)));
		}

		this.active = {
			runId: checkpoint.runId,
			workflowId: workflow.workflowId,
			workflowFingerprint: buildWorkflowFingerprint(
				workflow.graph.nodes,
				workflow.graph.edges,
			),
			completedNodeIds: new Set(checkpoint.completedNodeIds),
			outputSnapshots,
			status: 'running',
			boundaryCrossed: true,
			label: checkpoint.label,
		};
	}

	/**
	 * Accumulate a live output emission.
	 *
	 * @returns `true` when this emission is an explicit checkpoint boundary
	 *          that should trigger an immediate persist.
	 */
	observe(
		event: RuntimeRunnerEvent,
		boundary?: { readonly label?: string },
	): boolean {
		if (this.active === undefined || event.kind !== 'output-emitted') {
			return false;
		}

		if (String(event.runId) !== this.active.runId) {
			return false;
		}

		if (event.state !== 'value' || typeof event.portId !== 'string') {
			return false;
		}

		const jsonValue = toCheckpointJsonValue(event.value);
		if (jsonValue === undefined) {
			this.unsupportedValue = `${event.nodeId}.${event.portId}`;
			return false;
		}

		const nodeId = String(event.nodeId);
		let ports = this.active.outputSnapshots.get(nodeId);
		if (ports === undefined) {
			ports = new Map();
			this.active.outputSnapshots.set(nodeId, ports);
		}

		ports.set(event.portId, {
			state: 'value',
			value: jsonValue,
		});

		this.active.completedNodeIds.add(nodeId);

		if (boundary === undefined) {
			return false;
		}

		this.active.boundaryCrossed = true;
		if (boundary.label !== undefined) {
			this.active.label = boundary.label;
		}

		return true;
	}

	async persist(
		status: WorkflowCheckpoint['status'],
	): Promise<WorkflowCheckpointSummary | undefined> {
		const run = async (): Promise<
			WorkflowCheckpointSummary | undefined
		> => {
			if (this.active === undefined || !this.active.boundaryCrossed) {
				return undefined;
			}

			if (this.unsupportedValue !== undefined) {
				this.active.status = 'failed';
				const failed = this.toCheckpoint('failed');
				await this.store.save(failed);
				return summarizeCheckpoint(failed);
			}

			this.active.status = status;
			const checkpoint = this.toCheckpoint(status);
			await this.store.save(checkpoint);
			return summarizeCheckpoint(checkpoint);
		};

		const result = this.persistChain.then(run, run);
		this.persistChain = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	async markCompleted(): Promise<WorkflowCheckpointSummary | undefined> {
		const summary = await this.persist('completed');
		this.active = undefined;
		return summary;
	}

	async markStopped(): Promise<WorkflowCheckpointSummary | undefined> {
		const summary = await this.persist('stopped');
		// Keep active until discard / new run so resume can use in-memory state
		// without a disk round-trip in the same process; disk is for restart.
		return summary;
	}

	clearActive(): void {
		this.active = undefined;
		this.unsupportedValue = undefined;
	}

	getUnsupportedValueMessage(): string | undefined {
		return this.unsupportedValue === undefined
			? undefined
			: `Unsupported non-JSON output at ${this.unsupportedValue}`;
	}

	resumeOptionsFromCheckpoint(checkpoint: WorkflowCheckpoint): {
		readonly runId: RunId;
		readonly completedNodeIds: readonly NodeId[];
		readonly outputSnapshots: Readonly<
			Record<string, Readonly<Record<string, unknown>>>
		>;
	} {
		const outputSnapshots: Record<string, Record<string, unknown>> = {};
		for (const [nodeId, ports] of Object.entries(
			checkpoint.outputSnapshots,
		)) {
			outputSnapshots[nodeId] = Object.fromEntries(
				Object.entries(ports).map(([portId, snap]) => [
					portId,
					snap.value,
				]),
			);
		}

		return {
			runId: checkpoint.runId as RunId,
			completedNodeIds: checkpoint.completedNodeIds as NodeId[],
			outputSnapshots,
		};
	}

	private toCheckpoint(
		status: WorkflowCheckpoint['status'],
	): WorkflowCheckpoint {
		if (this.active === undefined) {
			throw new Error('No active checkpoint run');
		}

		const outputSnapshots: Record<
			string,
			Record<string, WorkflowCheckpointPortSnapshot>
		> = {};
		for (const [nodeId, ports] of this.active.outputSnapshots) {
			outputSnapshots[nodeId] = Object.fromEntries(ports);
		}

		return {
			schemaVersion: 1,
			runId: this.active.runId,
			workflowId: this.active.workflowId,
			workflowFingerprint: this.active.workflowFingerprint,
			updatedAt: new Date().toISOString(),
			status,
			completedNodeIds: [...this.active.completedNodeIds],
			outputSnapshots,
			...(this.active.label !== undefined
				? { label: this.active.label }
				: {}),
		};
	}
}
