import { defineReactiveNode } from '@langflower/node-sdk';
import { createCrawlContext } from '@langflower/tools/create-crawl-context';
import { from, mergeMap, throwError } from 'rxjs';
import { extractHtmlTitle } from '@langflower/tools/html';

/**
 * Persist a fetched page under `.langflower/crawl/{runId}/` via `createCrawlContext`.
 *
 * **Use when:** you want durable research artifacts for later Merge / Preview.
 */
export const savePageNode = defineReactiveNode({
	type: 'common-save-page',
	displayName: 'Save Page',
	category: 'Crawl',
	paletteSecondary: true,
	description: `
Store a fetched page in this run's crawl folder and emit where it was saved.

Typical uses:
- Keep HTML/text for later review
- Persist a page before the next crawl hop
`.trim(),
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const url = makeInput<string>('url', {
			name: 'url',
			wireType: 'string',
			inline: 'text',
			required: true,
		});
		const html = makeInput<string>('html', {
			name: 'html',
			wireType: 'string',
			inline: 'text-multiline',
			defaultValue: '',
		});
		const text = makeInput<string>('text', {
			name: 'text',
			wireType: 'string',
			inline: 'text-multiline',
			defaultValue: '',
		});

		const saved$ = combineInputs(
			[url, html, text, ctx],
			([rawUrl, rawHtml, rawText, ec]) => ({
				url: String(rawUrl ?? '').trim(),
				html: String(rawHtml ?? ''),
				text: String(rawText ?? ''),
				ec,
			}),
		).pipeValue(
			mergeMap(({ url: pageUrl, html: pageHtml, text: pageText, ec }) => {
				if (pageUrl.length === 0) {
					return throwError(
						() => new Error('Save Page requires a non-empty url.'),
					);
				}

				const crawl = createCrawlContext(ec.projectDir, ec.runId);

				const title = extractHtmlTitle(pageHtml);

				return from(
					crawl.savePage({
						url: pageUrl,
						html: pageHtml,
						text: pageText,
						...(title !== undefined ? { title } : {}),
					}),
				);
			}),
		);

		return {
			inputs: [url, html, text],
			outputs: [
				configureOutput('saved', saved$, {
					wireType: 'json',
				}),
			],
		};
	},
});
