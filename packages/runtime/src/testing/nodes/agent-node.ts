import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import {
	combineLatest,
	concatMap,
	delay,
	Observable,
	of,
	startWith,
} from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

const ASYNC_OUTPUT_DELAY_MS = 1;

/** Finite LLM-style token stream — emits all deltas synchronously, then completes. */
export function emitDraftDeltas(deltas: readonly string[]): Observable<string> {
	return new Observable((subscriber) => {
		for (const delta of deltas) {
			subscriber.next(delta);
		}
		subscriber.complete();
	});
}

export type AgentTestNodeOptions = {
	readonly nodeId: string;
	/** Incremental token deltas for `draft` (LLM-style — each emit is new text only). */
	readonly draftDeltas?: readonly string[];
	/** Final `response` text prefix (default `Final`). */
	readonly responsePrefix?: string;
};

/**
 * Agent stand-in: `prompt` (+ optional `feedback`) → `draft` stream + `response`.
 */
export function createAgentTestNode(
	options: AgentTestNodeOptions,
): RuntimeNode {
	const {
		nodeId,
		draftDeltas = ['The', ' quick', ' brown', ' fox'],
		responsePrefix = 'Final',
	} = options;
	const promptIn = statefulConnection<string, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'prompt',
			wireType: 'string',
			mode: 'single',
		} satisfies PortMeta,
	});
	const feedbackIn = statefulConnection<string, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'feedback',
			wireType: 'string',
			mode: 'single',
		} satisfies PortMeta,
	});

	const draft = statefulObservable({
		input: promptIn.value$,
		mapOperator: concatMap,
		refCount: false,
		loader: () => emitDraftDeltas(draftDeltas),
		meta: {
			dir: 'out',
			portId: 'draft',
			wireType: 'string',
		} satisfies PortMeta,
	});

	const response = statefulObservable({
		input: combineLatest([
			promptIn.value$,
			feedbackIn.value$.pipe(startWith('')),
		]),
		loader: ([prompt, feedback]) => {
			const text =
				feedback !== undefined && feedback !== ''
					? String(feedback)
					: String(prompt ?? '');

			return of(`${responsePrefix}: ${text}`).pipe(
				delay(ASYNC_OUTPUT_DELAY_MS),
			);
		},
		meta: {
			dir: 'out',
			portId: 'response',
			wireType: 'string',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { prompt: promptIn, feedback: feedbackIn },
		outputs: { draft, response },
		bypassPorts: {},
	};
}
