import { defineReactiveNode } from '@langflower/node-sdk';
import { createWebFetch } from '@langflower/tools/create-web-fetch';
import { from, map, mergeMap, throwError } from 'rxjs';
import { htmlToText } from '@langflower/tools/html';
import { getRunHostServices } from '../../ai/features/run-host-services.js';

type FetchedPage = {
	readonly html: string;
	readonly text: string;
	readonly status: number;
};

/**
 * HTTP GET a URL via server `ctx.harness.webFetch` (SSRF guards), then extract
 * plain text from HTML.
 *
 * **Use when:** a research branch needs one page’s body without a full BFS crawl.
 *
 * Safety: private/loopback/link-local targets are blocked server-side; optional
 * `harness.allowedHosts` allowlist in `langflower.jsonc`. Prefer offline mocks
 * in tests — never call the public internet from unit tests.
 */
export const fetchUrlNode = defineReactiveNode({
	type: 'common-fetch-url',
	displayName: 'Fetch URL',
	category: 'Crawl',
	paletteSecondary: true,
	description: `
Download a page and get HTML plus readable text.

Typical uses:
- Pull an article before Extract Links or an LLM
- Seed a Crawl
`.trim(),
	uiSchema: [
		{
			field: 'timeoutMs',
			type: 'number',
			label: 'Timeout (ms)',
			default: 30_000,
		},
		{
			field: 'maxBytes',
			type: 'number',
			label: 'Max response bytes',
			default: 5_000_000,
		},
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const url = makeInput<string>('url', {
			name: 'url',
			wireType: 'string',
			inline: 'text',
			required: true,
		});

		const fetched$ = combineInputs([url, ctx], ([rawUrl, ec]) => ({
			rawUrl: String(rawUrl ?? '').trim(),
			ec,
		})).pipeValue(
			mergeMap(({ rawUrl, ec }) => {
				if (rawUrl.length === 0) {
					return throwError(
						() => new Error('Fetch URL requires a non-empty url.'),
					);
				}

				const allowedHosts = getRunHostServices(ec)?.allowedHosts;
				const webFetch = createWebFetch({
					...(allowedHosts !== undefined ? { allowedHosts } : {}),
				});

				const timeoutMs = Number(ec.params.timeoutMs ?? 30_000);
				const maxBytes = Number(ec.params.maxBytes ?? 5_000_000);

				return from(
					webFetch({
						url: rawUrl,
						timeoutMs,
						maxBytes,
					}),
				).pipe(
					map((result): FetchedPage => {
						if (!result.ok && result.body.length === 0) {
							throw new Error(
								result.error ?? `Fetch failed for ${rawUrl}`,
							);
						}

						return {
							html: result.body,
							text: htmlToText(result.body),
							status: result.status,
						};
					}),
				);
			}),
		);

		return {
			inputs: [url],
			outputs: [
				configureOutput(
					'text',
					fetched$.pipeValue(map((page) => page.text)),
					{ wireType: 'string' },
				),
				configureOutput(
					'html',
					fetched$.pipeValue(map((page) => page.html)),
					{ wireType: 'string' },
				),
				configureOutput(
					'status',
					fetched$.pipeValue(map((page) => page.status)),
					{ wireType: 'number' },
				),
			],
		};
	},
});
