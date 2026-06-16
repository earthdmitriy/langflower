import { statefulObservable } from '@rx-evo/stateful-observable';
import { concatMap, delay, of, Observable } from 'rxjs';
import { defineReactiveNode } from '../../define-reactive-node.js';

const ASYNC_OUTPUT_DELAY_MS = 1;
const DEFAULT_DRAFT_DELTAS = ['The', ' quick', ' brown', ' fox'] as const;

const emitDraftDeltas = (deltas: readonly string[]): Observable<string> =>
	new Observable((subscriber) => {
		for (const delta of deltas) {
			subscriber.next(delta);
		}

		subscriber.complete();
	});

/** Agent stand-in: `prompt` (+ optional `feedback`) → streaming `draft` + `response`. */
export const agentSampleNode = defineReactiveNode({
	type: 'sample-agent',
	displayName: 'Agent',
	category: 'Samples',
	uiSchema: [
		{ field: 'responsePrefix', type: 'string', default: 'Final' },
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const prompt = makeInput<string>('prompt', {
			name: 'prompt',
			wireType: 'string',
			required: true,
		});
		const feedback = makeInput<string>('feedback', {
			name: 'feedback',
			wireType: 'string',
			defaultValue: '',
		});
		const prefixFallback = 'Final';

		const draft$ = statefulObservable({
			input: prompt.value$,
			mapOperator: concatMap,
			refCount: false,
			loader: () => emitDraftDeltas(DEFAULT_DRAFT_DELTAS),
		});

		const response$ = combineInputs(
			[prompt, feedback, ctx],
			([promptValue, feedbackValue, ec]) => {
				const panel = ec.params as
					{ readonly responsePrefix?: unknown } | undefined;
				const prefix =
					panel?.responsePrefix !== undefined
						? String(panel.responsePrefix)
						: prefixFallback;
				const text =
					feedbackValue !== undefined && feedbackValue !== ''
						? String(feedbackValue)
						: String(promptValue ?? '');

				return `${prefix}: ${text}`;
			},
		).pipeValue(
			concatMap((text) => of(text).pipe(delay(ASYNC_OUTPUT_DELAY_MS))),
		);

		return {
			inputs: [prompt, feedback],
			outputs: [
				configureOutput('draft', draft$, {
					wireType: 'string',
				}),
				configureOutput('response', response$, {
					wireType: 'string',
				}),
			],
		};
	},
});
