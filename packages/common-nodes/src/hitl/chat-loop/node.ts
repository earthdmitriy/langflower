import { defineReactiveNode, withLoading } from '@langflower/node-sdk';
import { statefulObservable } from '@rx-evo/stateful-observable';
import { map, merge, switchMap, take, tap } from 'rxjs';
import type { ChatCompletionUserTurn } from '../../ai/features/chat-completion-stream.js';
import { coerceChatUserTurn, replyValue } from '../coerce-user-turn.js';
import { createGateWait } from '../gate-wait.js';

/** Mid-run chat turn: one HITL reply. `feedback` is the user turn. */
export const chatLoopNode = defineReactiveNode({
	type: 'common-chat-loop',
	displayName: 'Chat Loop',
	category: 'HITL',
	description: `
Pause for the next human message and send it back to the agent.

Wire agent \`response\` → \`result\`, and \`feedback\` → agent \`feedback\`.
\`text\` is the same reply as a string, for string consumers.
The run continues until **Stop** — there is no Approve / finish port.
`.trim(),
	uiSchema: [],
	bind(_ctx, { makeInput, configureOutput }) {
		const result = makeInput<string>('result', {
			name: 'result',
			wireType: 'string',
			required: true,
		});
		const message = makeInput<string | ChatCompletionUserTurn>('message', {
			name: 'reply',
			wireType: ['string', 'user-turn'],
			hidden: true,
			hitl: {
				title: 'Reply',
				kind: 'textarea',
				placeholder: 'Type a reply…',
				submitLabel: 'Send',
				role: 'reply',
			},
		});

		// While the loop waits it keeps `result` as node state and re-opens the
		// wait itself after a restart ({@link createGateWait}). Subscribing
		// `result.value$` keeps the upstream agent edge live (BUG-2026-07-21d); a
		// restored wait joins it here, not on the input, because a stream derived
		// from an input stays inactive until the input itself has a value.
		const wait = createGateWait();
		const feedback$ = statefulObservable({
			loader: () => merge(result.value$, wait.restored$),
		})
			.pipe(withLoading())
			.pipeValue(
				tap((reviewed: string) => wait.markWaiting(reviewed ?? '')),
				switchMap(() =>
					message.value$.pipe(
						take(1),
						tap(() => wait.markAnswered()),
						map(replyValue),
					),
				),
			);
		const text$ = feedback$.pipeValue(
			map((value) => coerceChatUserTurn(value).text),
		);

		return {
			state: wait.state,
			inputs: [result, message],
			outputs: [
				configureOutput('feedback', feedback$, {
					// A string, or a `user-turn` when files are attached.
					wireType: ['string', 'user-turn'],
					feed: { role: 'none' },
				}),
				configureOutput('text', text$, {
					wireType: 'string',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
