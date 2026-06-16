import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { Subject, of } from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type HitlTestNodeOptions = {
	readonly nodeId: string;
};

type HitlPrompt = {
	readonly question: string;
	readonly awaiting: true;
};

export type HitlTestNodeHandle = {
	readonly node: RuntimeNode;
	/** Push user answer — emits on `reply` output port. */
	readonly submitReply: (answer: string) => void;
};

/**
 * HITL stand-in: `question` in → `prompt` out; external `submitReply` → `reply` out.
 */
export function createHitlTestNode(
	options: HitlTestNodeOptions,
): HitlTestNodeHandle {
	const { nodeId } = options;
	const questionIn = statefulConnection<string, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'question',
			wireType: 'string',
			mode: 'single',
		} satisfies PortMeta,
	});
	const replyTrigger$ = new Subject<string>();

	const prompt = statefulObservable({
		input: questionIn.value$,
		loader: (question) =>
			of({
				question: String(question ?? ''),
				awaiting: true as const,
			} satisfies HitlPrompt),
		meta: {
			dir: 'out',
			portId: 'prompt',
			wireType: 'string',
		} satisfies PortMeta,
	});

	const reply = statefulObservable({
		input: replyTrigger$,
		loader: (answer) => of(String(answer)),
		meta: {
			dir: 'out',
			portId: 'reply',
			wireType: 'string',
		} satisfies PortMeta,
	});

	return {
		node: {
			nodeId: nodeId as NodeId,
			inputs: { question: questionIn },
			outputs: { prompt, reply },
			bypassPorts: {},
		},
		submitReply(answer: string) {
			replyTrigger$.next(answer);
		},
	};
}
