import { defineReactiveNode, withLoading } from '@langflower/node-sdk';
import { map, switchMap, take } from 'rxjs';

/** Mid-run chat turn: one HITL reply, one `feedback` out — no Approve. */
export const chatLoopNode = defineReactiveNode({
	type: 'common-chat-loop',
	displayName: 'Chat Loop',
	category: 'HITL',
	description: `
Pause for the next human message and send it back to the agent.

Wire agent \`response\` → \`result\`, and \`feedback\` → agent \`feedback\`.
The run continues until **Stop** — there is no Approve / finish port.
`.trim(),
	uiSchema: [],
	bind(_ctx, { makeInput, configureOutput }) {
		const result = makeInput<string>('result', {
			name: 'result',
			wireType: 'string',
			required: true,
		});
		const message = makeInput<string>('message', {
			name: 'reply',
			wireType: 'string',
			hidden: true,
			hitl: {
				title: 'Reply',
				kind: 'textarea',
				placeholder: 'Type a reply…',
				submitLabel: 'Send',
				role: 'reply',
			},
		});

		// `result.pipe` keeps the upstream agent edge live (BUG-2026-07-21d).
		const feedback$ = result.pipe(withLoading()).pipeValue(
			switchMap(() =>
				message.value$.pipe(
					take(1),
					map((text) => text ?? ''),
				),
			),
		);

		return {
			inputs: [result, message],
			outputs: [
				configureOutput('feedback', feedback$, {
					wireType: 'string',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
