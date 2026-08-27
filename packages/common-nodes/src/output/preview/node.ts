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

/** Formats wired input as display text (JSON for objects). */
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
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const text = makeInput('text', {
			name: 'text',
			wireType: 'string',
			required: true,
			inline: 'preview-markdown',
		});
		const output$ = text.pipeValue(map(formatPreviewText));

		return {
			inputs: [text],
			outputs: [
				configureOutput('text', output$, {
					inferTypeFrom: text,
					feed: { role: 'result' },
				}),
			],
		};
	},
});
