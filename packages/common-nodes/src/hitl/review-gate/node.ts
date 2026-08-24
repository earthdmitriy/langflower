import { defineReactiveNode } from '@langflower/node-sdk';
import { filter, map, pipe, switchMap, take } from 'rxjs';

/** Review gate: separate HITL inputs for approve vs request-changes. */
export const hitlReviewGateNode = defineReactiveNode({
	type: 'common-hitl-review-gate',
	displayName: 'Review Gate',
	category: 'HITL',
	description: `
Pause for a human. **Approve** to continue, or **Request changes** with feedback.

Typical uses:
- Gate a draft before the next stage
- Collect edits without leaving the editor
`.trim(),
	uiSchema: [],
	bind(_ctx, { makeInput, configureOutput }) {
		const result = makeInput<string>('result', {
			name: 'Result',
			wireType: 'string',
			required: true,
		});
		const approve = makeInput<boolean>('approve', {
			name: 'Approve',
			wireType: 'boolean',
			hidden: true,
			hitl: {
				title: 'Review result',
				promptFrom: 'preview',
				kind: 'button',
				label: 'Approve',
				payload: true,
			},
		});
		const requestChanges = makeInput<string>('requestChanges', {
			name: 'Request changes',
			wireType: 'string',
			hidden: true,
			hitl: {
				title: 'Request changes',
				promptFrom: 'preview',
				kind: 'textarea',
				placeholder: 'What should be improved?',
				submitLabel: 'Send feedback',
			},
		});

		// Passthrough pulls `result` (upstream edges stay live) and feeds HITL promptFrom.
		const preview = configureOutput('preview', result, {
			inferTypeFrom: result,
			feed: { role: 'none' },
		});

		const response$ = approve.pipeValue(
			pipe(
				filter((approved) => approved === true),
				switchMap(() => result.value$.pipe(take(1))),
				map((reviewed) => reviewed ?? ''),
			),
		);

		const feedback$ = requestChanges.pipeValue(map((text) => text ?? ''));

		return {
			inputs: [result, approve, requestChanges],
			outputs: [
				preview,
				// User answer is tracked by the HITL-configured inputs (approve /
				// requestChanges → hitl-user). Protocol outs stay wired but omit from feed.
				configureOutput('response', response$, {
					wireType: 'string',
					feed: { role: 'none' },
				}),
				configureOutput('feedback', feedback$, {
					wireType: 'string',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
