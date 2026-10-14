import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type {
	WorkflowSessionActionFailedCode,
	WorkflowSessionFile,
} from '@langflower/shared/types/workflow-session.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import type { WorkflowSessionStore } from './workflow-session-store.js';

const AUTOSAVE_DELAY_MS = 1000;

export type WorkflowSessionAutosaveResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly code: WorkflowSessionActionFailedCode;
			readonly message: string;
	  };

/**
 * Trailing debounce that writes `activeWorkflow` into the bound session
 * file. `currentStatus` stays pristine — the banner is
 * `differsFromWorkflow`, not the workflow dirty flag.
 */
export class WorkflowSessionAutosave {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private dirty = false;

	constructor(
		private readonly session: LangflowerSession,
		private readonly store: WorkflowSessionStore,
		private readonly delayMs = AUTOSAVE_DELAY_MS,
	) {}

	markDirty(): void {
		if (this.session.binding.kind !== 'workflowSession') {
			return;
		}

		this.dirty = true;
		this.session.currentStatus = 'pristine';

		if (this.timer !== undefined) {
			clearTimeout(this.timer);
		}

		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.writeSnapshot();
		}, this.delayMs);
	}

	isDirty(): boolean {
		return this.dirty;
	}

	/** Cancel a pending debounce without writing. */
	cancel(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	/** Cancel the debounce and write the snapshot now. */
	async flush(): Promise<WorkflowSessionAutosaveResult> {
		if (!this.dirty) {
			this.cancel();
			return { ok: true };
		}

		this.cancel();
		return this.writeSnapshot();
	}

	private async writeSnapshot(): Promise<WorkflowSessionAutosaveResult> {
		if (this.session.binding.kind !== 'workflowSession') {
			return { ok: true };
		}

		const active = this.session.activeWorkflow;

		if (active === null) {
			return { ok: true };
		}

		const sessionId = this.session.binding.sessionId;
		const written = await this.store.update(
			active.workflowId,
			sessionId,
			(current) =>
				withSnapshot(current, active, new Date().toISOString()),
		);

		if (!written.ok) {
			this.dirty = true;
			const code: WorkflowSessionActionFailedCode =
				written.code === 'CORRUPT' || written.code === 'NOT_FOUND'
					? written.code
					: 'WRITE_FAILED';

			return {
				ok: false,
				code,
				message: written.message,
			};
		}

		this.dirty = false;
		this.session.currentStatus = 'pristine';
		return { ok: true };
	}
}

const withSnapshot = (
	current: WorkflowSessionFile,
	snapshot: WorkflowLoadedPayload,
	updatedAt: string,
): WorkflowSessionFile => ({
	...current,
	workflowSnapshot: snapshot,
	updatedAt,
});
