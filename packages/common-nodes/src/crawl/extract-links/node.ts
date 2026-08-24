import { defineReactiveNode } from '@langflower/node-sdk';
import { extractLinks } from '@langflower/tools/html';

/**
 * Extract absolute links from an HTML document.
 *
 * **Use when:** expanding a seed page into crawl candidates before Merge or Crawl.
 * Pure / offline — no network I/O.
 */
export const extractLinksNode = defineReactiveNode({
	type: 'common-extract-links',
	displayName: 'Extract Links',
	category: 'Crawl',
	paletteSecondary: true,
	description: `
Pull absolute URLs from HTML.

Typical uses:
- List outbound links after Fetch URL
- Feed those URLs into Crawl or another fetch
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const html = makeInput<string>('html', {
			name: 'html',
			wireType: 'string',
			inline: 'text-multiline',
			required: true,
		});
		const baseUrl = makeInput<string>('baseUrl', {
			name: 'baseUrl',
			wireType: 'string',
			inline: 'text',
			required: true,
		});

		const links$ = combineInputs([html, baseUrl], ([rawHtml, rawBase]) =>
			extractLinks(String(rawHtml ?? ''), String(rawBase ?? '')),
		);

		return {
			inputs: [html, baseUrl],
			outputs: [
				configureOutput('links', links$, {
					wireType: 'json',
				}),
			],
		};
	},
});
