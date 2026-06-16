import type {
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/langflower.js';
import type { PermissionAskRequest } from '@langflower/tools/permission';

type PendingAsk = {
	readonly payload: RunnerPermissionAskPayload;
	readonly resolve: (decision: 'allow' | 'deny') => void;
};

/**
 * Run-scoped registry for feed `permission.ask` pause/resume.
 * `harness.invoke` awaits {@link requestPermission}; UI replies resolve it.
 */
export class PendingPermissionAsks {
	private readonly pending = new Map<string, PendingAsk>();

	list(): readonly RunnerPermissionAskPayload[] {
		return [...this.pending.values()].map((entry) => entry.payload);
	}

	requestPermission = (
		runId: string,
		nodeId: string,
		request: PermissionAskRequest,
		emitAsk: (payload: RunnerPermissionAskPayload) => void,
	): Promise<'allow' | 'deny'> => {
		const askId = crypto.randomUUID();
		const payload: RunnerPermissionAskPayload = {
			runId,
			askId,
			nodeId,
			toolId: request.toolId,
			detail: request.detail,
			summary: request.summary,
		};

		return new Promise<'allow' | 'deny'>((resolve) => {
			this.pending.set(askId, { payload, resolve });
			emitAsk(payload);
		});
	};

	reply = (payload: RunnerPermissionReplyPayload): boolean => {
		const entry = this.pending.get(payload.askId);

		if (entry === undefined) {
			return false;
		}

		if (entry.payload.runId !== payload.runId) {
			return false;
		}

		this.pending.delete(payload.askId);
		entry.resolve(payload.decision === 'allow' ? 'allow' : 'deny');
		return true;
	};

	/** Fail closed all outstanding asks (interrupt / run end). */
	denyAll = (runId?: string): void => {
		const entries = [...this.pending.entries()].filter(
			([, entry]) => runId === undefined || entry.payload.runId === runId,
		);

		for (const [askId, entry] of entries) {
			this.pending.delete(askId);
			entry.resolve('deny');
		}
	};
}
