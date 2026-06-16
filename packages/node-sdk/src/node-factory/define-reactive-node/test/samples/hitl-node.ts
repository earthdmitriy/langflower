import { defineReactiveNode } from '../../define-reactive-node.js';
import { map } from 'rxjs';

/**
 * HITL stand-in: `question` in → `prompt` out; user answer via marked
 * `reply` input — server injects via `runner.hitl.event` /
 * `RuntimeRunner.pushIntoInput`.
 */
export const hitlSampleNode = defineReactiveNode({
	type: 'sample-hitl',
	displayName: 'HITL',
	category: 'Samples',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const question = makeInput<string>('question', {
			name: 'question',
			wireType: 'string',
			required: true,
		});
		const reply = makeInput<string>('reply', {
			name: 'reply',
			wireType: 'string',
			required: true,
			hitl: {
				title: 'Your reply',
				promptFrom: 'prompt',
				kind: 'textarea',
				submitLabel: 'Send',
			},
		});

		const replyOut$ = reply.pipeValue(map((text) => text ?? ''));

		return {
			inputs: [question, reply],
			outputs: [
				configureOutput('prompt', question, {
					inferTypeFrom: question,
				}),
				configureOutput('reply', replyOut$, {
					wireType: 'string',
				}),
			],
		};
	},
});
