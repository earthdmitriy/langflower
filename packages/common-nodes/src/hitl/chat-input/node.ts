import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';
import type { ChatCompletionUserTurn } from '../../ai/features/chat-completion-stream.js';
import { coerceChatUserTurn, replyValue } from '../coerce-user-turn.js';

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
		const message = makeInput<string | ChatCompletionUserTurn>('message', {
			name: 'message',
			wireType: ['string', 'user-turn'],
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

		// A message with no files stays the plain string it always was, so a
		// graph wired before attachments existed behaves as before.
		const messageOut$ = message.pipeValue(map(replyValue));
		const textOut$ = message.pipeValue(
			map((value) => coerceChatUserTurn(value).text),
		);

		return {
			inputs: [message],
			outputs: [
				configureOutput('message', messageOut$, {
					// A string, or a `user-turn` when files are attached.
					wireType: ['string', 'user-turn'],
					feed: { role: 'none' },
				}),
				configureOutput('text', textOut$, {
					wireType: 'string',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
