import type {
	RunnerAskUserAskPayload,
	RunnerAskUserReplyPayload,
} from '@langflower/shared/langflower.js';
import type { AskUserRequest } from '@langflower/tools/create-project-harness';

type PendingAsk = {
	readonly payload: RunnerAskUserAskPayload;
	readonly resolve: (text: string) => void;
	readonly reject: (error: Error) => void;
};

const ASK_USER_ABORTED = 'ask_user aborted.';

/**
 * Run-scoped registry for feed `ask_user` pause/resume.
 * `harness.invoke` awaits {@link requestAskUser}; UI replies resolve it.
 */
export class PendingAskUserAsks {
	private readonly pending = new Map<string, PendingAsk>();

	list(): readonly RunnerAskUserAskPayload[] {
		return [...this.pending.values()].map((entry) => entry.payload);
	}

	requestAskUser = (
		runId: string,
		nodeId: string,
		request: AskUserRequest,
		emitAsk: (payload: RunnerAskUserAskPayload) => void,
	): Promise<string> => {
		const askId = crypto.randomUUID();
		const payload: RunnerAskUserAskPayload = {
			runId,
			askId,
			nodeId,
			question: request.question,
		};

		return new Promise<string>((resolve, reject) => {
			this.pending.set(askId, { payload, resolve, reject });
			emitAsk(payload);
		});
	};

	reply = (payload: RunnerAskUserReplyPayload): boolean => {
		const entry = this.pending.get(payload.askId);

		if (entry === undefined) {
			return false;
		}

		if (entry.payload.runId !== payload.runId) {
			return false;
		}

		const text = payload.text.trim();

		if (text.length === 0) {
			return false;
		}

		this.pending.delete(payload.askId);
		entry.resolve(text);
		return true;
	};

	/** Fail closed all outstanding asks (interrupt / run end). */
	failAll = (runId?: string): void => {
		const entries = [...this.pending.entries()].filter(
			([, entry]) => runId === undefined || entry.payload.runId === runId,
		);

		for (const [askId, entry] of entries) {
			this.pending.delete(askId);
			entry.reject(new Error(ASK_USER_ABORTED));
		}
	};
}
