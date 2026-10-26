import { defineReactiveNode, withLoading } from '@langflower/node-sdk';
import { statefulObservable } from '@rx-evo/stateful-observable';
import { filter, map, merge, switchMap, take, tap } from 'rxjs';
import type { ChatCompletionUserTurn } from '../../ai/features/chat-completion-stream.js';
import { replyValue } from '../coerce-user-turn.js';
import { createGateWait } from '../gate-wait.js';

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
		const requestChanges = makeInput<string | ChatCompletionUserTurn>(
			'requestChanges',
			{
				name: 'request changes',
				wireType: ['string', 'user-turn'],
				hidden: true,
				hitl: {
					title: 'Request changes',
					kind: 'textarea',
					placeholder: 'What should be improved?',
					submitLabel: 'Send feedback',
				},
			},
		);

		// While the gate waits it keeps `result` as node state and re-opens the
		// wait itself after a restart ({@link createGateWait}).
		const wait = createGateWait();

		// Subscribing `result.value$` on both outs keeps the upstream edge live
		// (BUG-2026-07-21d). A restored wait joins it here, not on the input:
		// a stream derived from an input stays inactive until the input itself
		// has a value.
		const waiting = () =>
			statefulObservable({
				loader: () => merge(result.value$, wait.restored$),
			}).pipe(withLoading());

		const response$ = waiting().pipeValue(
			tap((reviewed: string) => wait.markWaiting(reviewed ?? '')),
			switchMap((reviewed: string) =>
				approve.value$.pipe(
					filter((approved) => approved === true),
					take(1),
					tap(() => wait.markAnswered()),
					map(() => reviewed ?? ''),
				),
			),
		);

		const feedback$ = waiting().pipeValue(
			tap((reviewed: string) => wait.markWaiting(reviewed ?? '')),
			switchMap(() =>
				requestChanges.value$.pipe(
					take(1),
					tap(() => wait.markAnswered()),
					map(replyValue),
				),
			),
		);

		return {
			state: wait.state,
			inputs: [result, approve, requestChanges],
			outputs: [
				// User answer is tracked by the HITL-configured inputs (approve /
				// requestChanges → hitl-user). Protocol outs stay wired but omit from feed.
				configureOutput('response', response$, {
					wireType: 'string',
					feed: { role: 'none' },
					// Approve path continues `result` when the gate is deleted.
					// `feedback` is a different value and must not splice.
					rewireFrom: 'result',
				}),
				configureOutput('feedback', feedback$, {
					// A string when no files are attached, a `user-turn` when there are.
					wireType: ['string', 'user-turn'],
					feed: { role: 'none' },
				}),
			],
		};
	},
});
