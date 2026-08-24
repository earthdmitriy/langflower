import { defineReactiveNode } from '@langflower/node-sdk';
import {
	asapScheduler,
	filter,
	map,
	observeOn,
	of,
	startWith,
	switchMap,
	take,
} from 'rxjs';

const remainingChunks = (
	text: string,
	divider: string,
	startFrom: number,
): readonly { readonly text: string; readonly index: number }[] => {
	const splitDivider = divider.replaceAll('\\n', '\n');
	const from = Math.max(0, Math.floor(Number(startFrom) || 0));
	const pieces = String(text)
		.split(splitDivider)
		.map((piece) => piece.replace(/\r$/, ''))
		.filter((piece) => piece.length > 0);

	return pieces.slice(from).map((chunk, offset) => ({
		text: chunk,
		index: from + offset,
	}));
};

/**
 * Splits `text` on `divider` and emits one non-empty chunk per pace slot:
 * first ASAP, later on `trigger`. After the last chunk, the next slot emits
 * `finish: true`. Use for CSV / logs line-by-line; not the one-shot Split array.
 */
export const splitPacedNode = defineReactiveNode({
	type: 'common-split-paced',
	displayName: 'Split (paced)',
	category: 'Text',
	description:
		'Splits `text` on `divider` and emits **one non-empty chunk at a time**. First chunk ASAP; later chunks wait for `trigger`. After the last chunk, the next trigger emits `finish: true`. `startFrom` skips leading chunks (absolute 0-based index). In `divider`, `\\n` is replaced with a line break.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const text = makeInput<string>('text', {
			name: 'text',
			wireType: 'string',
			inline: 'text-multiline',
			required: true,
			defaultValue: '',
		});
		const divider = makeInput<string>('divider', {
			name: 'divider',
			wireType: 'string',
			inline: 'text',
			defaultValue: '\\n',
			description: '`\\n` is replaced with a line break.',
		});
		const startFrom = makeInput<number>('startFrom', {
			name: 'start from',
			wireType: 'number',
			inline: { type: 'number', min: 0, step: 1 },
			defaultValue: 0,
		});
		const trigger = makeInput<unknown>('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
		});

		const session$ = combineInputs(
			[text, divider, startFrom],
			([rawText, rawDivider, rawStart]) =>
				remainingChunks(
					String(rawText ?? ''),
					String(rawDivider ?? ''),
					Number(rawStart),
				),
		).pipeValue(
			switchMap((chunks) => {
				const n = chunks.length;
				if (n <= 0) {
					return of({ kind: 'finish' as const });
				}
				return trigger.value$.pipe(
					startWith(undefined),
					take(n + 1),
					observeOn(asapScheduler),
					map((_, slot) => {
						const chunk = chunks[slot];
						return slot < n && chunk !== undefined
							? {
									kind: 'chunk' as const,
									text: chunk.text,
									index: chunk.index,
								}
							: { kind: 'finish' as const };
					}),
				);
			}),
		);

		const textOut$ = session$.pipeValue(
			filter((e) => e.kind === 'chunk'),
			map((e) => e.text),
		);

		const indexOut$ = session$.pipeValue(
			filter((e) => e.kind === 'chunk'),
			map((e) => e.index),
		);

		const finishOut$ = session$.pipeValue(
			filter((e) => e.kind === 'finish'),
			map(() => true),
		);

		return {
			inputs: [text, divider, startFrom, trigger],
			outputs: [
				configureOutput('text', textOut$, {
					wireType: 'string',
				}),
				configureOutput('index', indexOut$, {
					wireType: 'number',
				}),
				configureOutput('finish', finishOut$, {
					wireType: 'boolean',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
