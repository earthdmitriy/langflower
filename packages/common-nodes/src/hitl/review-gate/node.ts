import { defineReactiveNode, withLoading } from '@langflower/node-sdk';
import { filter, map, switchMap, take } from 'rxjs';

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
			name: 'result',
			wireType: 'string',
			required: true,
		});
		const approve = makeInput<boolean>('approve', {
			name: 'approve',
			wireType: 'boolean',
			hidden: true,
			hitl: {
				title: 'Review result',
				kind: 'button',
				label: 'Approve',
				payload: true,
			},
		});
		const requestChanges = makeInput<string>('requestChanges', {
			name: 'request changes',
			wireType: 'string',
			hidden: true,
			hitl: {
				title: 'Request changes',
				kind: 'textarea',
				placeholder: 'What should be improved?',
				submitLabel: 'Send feedback',
			},
		});

		// `result.pipe` on both outs keeps the upstream edge live (BUG-2026-07-21d).
		const response$ = result.pipe(withLoading()).pipeValue(
			switchMap((reviewed: string) =>
				approve.value$.pipe(
					filter((approved) => approved === true),
					take(1),
					map(() => reviewed ?? ''),
				),
			),
		);

		const feedback$ = result.pipe(withLoading()).pipeValue(
			switchMap(() =>
				requestChanges.value$.pipe(
					take(1),
					map((text) => text ?? ''),
				),
			),
		);

		return {
			inputs: [result, approve, requestChanges],
			outputs: [
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
