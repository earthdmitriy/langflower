import type {
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/types/langflower-config.js';
import type { PermissionAskRequest } from '@langflower/tools/permission';

type PendingAsk = {
	readonly payload: RunnerPermissionAskPayload;
	readonly settle: (
		decision: 'allow' | 'deny',
		emitAccepted: boolean,
	) => void;
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
		emitAccepted?: (payload: RunnerPermissionReplyPayload) => void,
		signal?: AbortSignal,
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
			const onAbort = (): void => {
				const entry = this.pending.get(askId);
				entry?.settle('deny', true);
			};

			const settle = (
				decision: 'allow' | 'deny',
				shouldEmitAccepted: boolean,
			): void => {
				if (!this.pending.has(askId)) {
					return;
				}

				this.pending.delete(askId);
				signal?.removeEventListener('abort', onAbort);

				if (shouldEmitAccepted && emitAccepted !== undefined) {
					emitAccepted({ runId, askId, decision });
				}

				resolve(decision);
			};

			this.pending.set(askId, { payload, settle });

			if (signal?.aborted) {
				settle('deny', true);
				return;
			}

			signal?.addEventListener('abort', onAbort);
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

		entry.settle(payload.decision === 'allow' ? 'allow' : 'deny', false);
		return true;
	};

	/** Fail closed all outstanding asks (interrupt / run end). */
	denyAll = (runId?: string): void => {
		const entries = [...this.pending.values()].filter(
			(entry) => runId === undefined || entry.payload.runId === runId,
		);

		for (const entry of entries) {
			entry.settle('deny', false);
		}
	};
}
