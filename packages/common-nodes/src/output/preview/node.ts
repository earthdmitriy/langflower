import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

function formatPreviewText(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	return String(value);
}

/**
 * Shows a wired value. `output` passes the input through; `text` is the
 * display string (JSON for objects).
 */
export const previewNode = defineReactiveNode({
	type: 'common-preview',
	displayName: 'Preview',
	category: 'Output',
	description: `
Show a wired value on the canvas and in the work log so you can inspect it.

Typical uses:
- Debug a mid-pipeline value
- A human-readable end of a small graph
`.trim(),
	// Locked box: markdown payload must not auto-size the node wider.
	defaultCanvasSize: { width: 320, height: 280 },
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const input = makeInput<unknown>('input', {
			name: 'input',
			dynamic: true,
			required: true,
			inline: 'preview-markdown',
		});
		const text$ = input.pipeValue(map(formatPreviewText));

		return {
			inputs: [input],
			outputs: [
				configureOutput('output', input, {
					inferTypeFrom: input,
				}),
				configureOutput('text', text$, {
					wireType: 'string',
					feed: { role: 'result' },
				}),
			],
		};
	},
});
