import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

/**
 * Conversational run entry — no wireable inputs; the feed composer submits
 * `message`, which cold-starts the cluster via `pushIntoInput`.
 */
export const chatInputNode = defineReactiveNode({
	type: 'common-chat-input',
	displayName: 'Chat Input',
	category: 'HITL',
	description: `
Start this graph from the composer **Start** control — not plain Run.

Type a message to kick off the chat. Graphs with this node wait for that message.
`.trim(),
	chatEntry: true,
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const message = makeInput<string>('message', {
			name: 'Message',
			wireType: 'string',
			hidden: true,
			hitl: {
				title: 'Message',
				kind: 'textarea',
				placeholder: 'Type a message to start…',
				submitLabel: 'Start',
				role: 'chat-start',
			},
		});

		const messageOut$ = message.pipeValue(map((text) => text ?? ''));

		return {
			inputs: [message],
			outputs: [
				configureOutput('message', messageOut$, {
					wireType: 'string',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
