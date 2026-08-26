import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

/**
 * Conversational run entry. `message` is hidden + inline: field, no handle.
 * Prefill on the node or in the composer; Start cold-starts via `pushIntoInput`.
 */
export const chatInputNode = defineReactiveNode({
	type: 'common-chat-input',
	displayName: 'Chat Input',
	category: 'HITL',
	description: `
Start this graph from the composer **Start** control — not plain Run.

Prefill a message on the node or type in the composer. Stop then Start reuses it.
`.trim(),
	chatEntry: true,
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const message = makeInput<string>('message', {
			name: 'Message',
			wireType: 'string',
			hidden: true,
			inline: 'text-multiline',
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
