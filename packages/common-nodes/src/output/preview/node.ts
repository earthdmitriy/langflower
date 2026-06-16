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
	description:
		'Displays wired **text** in a read-only preview area on the canvas.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const text = makeInput('text', {
			name: 'text',
			wireType: 'string',
			required: true,
			inline: 'preview',
		});
		const output$ = text.pipeValue(map(formatPreviewText));

		return {
			inputs: [text],
			outputs: [
				configureOutput('text', output$, {
					inferTypeFrom: text,
				}),
			],
		};
	},
});
