import { defineReactiveNode } from '@langflower/node-sdk';
import { createCrawlContext } from '@langflower/tools/create-crawl-context';
import { createWebFetch } from '@langflower/tools/create-web-fetch';
import { runBfsCrawl } from '@langflower/tools/run-bfs-crawl';
import { from, mergeMap, throwError } from 'rxjs';
import { getRunHostServices } from '../../ai/run-host-services.js';

const normalizeLimit = (
	value: unknown,
	fallback: number,
	max: number,
): number => {
	const n = Number(value);

	if (!Number.isFinite(n) || n < 0) {
		return fallback;
	}

	return Math.min(Math.floor(n), max);
};

/**
 * BFS crawl from a seed URL with depth / page caps.
 *
 * Uses SSRF-guarded `createWebFetch` and optionally `createCrawlContext.savePage`.
 * Default rate/budget control is hard caps (`maxPages`, `maxDepth`) — not a
 * global QPS limiter. CAPTCHA / browser automation are out of scope.
 * Algorithm lives in `@langflower/tools/run-bfs-crawl`.
 */
export const crawlNode = defineReactiveNode({
	type: 'common-crawl',
	displayName: 'Crawl',
	category: 'Crawl',
	paletteSecondary: true,
	description:
		'BFS crawl from a seed URL with depth/page limits; saves pages into the crawl run.',
	uiSchema: [
		{
			field: 'maxDepth',
			type: 'number',
			label: 'Max depth',
			default: 1,
		},
		{
			field: 'maxPages',
			type: 'number',
			label: 'Max pages',
			default: 8,
		},
		{
			field: 'sameHostOnly',
			type: 'boolean',
			label: 'Same host only',
			default: true,
		},
		{
			field: 'timeoutMs',
			type: 'number',
			label: 'Timeout per page (ms)',
			default: 30_000,
		},
		{
			field: 'maxBytes',
			type: 'number',
			label: 'Max bytes per page',
			default: 5_000_000,
		},
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const startUrl = makeInput<string>('startUrl', {
			name: 'startUrl',
			wireType: 'string',
			inline: 'text',
			required: true,
		});

		const pages$ = combineInputs([startUrl, ctx], ([rawUrl, ec]) => ({
			startUrl: String(rawUrl ?? '').trim(),
			ec,
		})).pipeValue(
			mergeMap(({ startUrl: seed, ec }) => {
				if (seed.length === 0) {
					return throwError(
						() => new Error('Crawl requires a non-empty startUrl.'),
					);
				}

				const hostServices = getRunHostServices(ec);
				const webFetch = createWebFetch({
					...(hostServices?.allowedHosts !== undefined
						? { allowedHosts: hostServices.allowedHosts }
						: {}),
				});
				const crawl = createCrawlContext(ec.projectDir, ec.runId);

				return from(
					runBfsCrawl({
						startUrl: seed,
						maxDepth: normalizeLimit(ec.params.maxDepth, 1, 5),
						maxPages: normalizeLimit(ec.params.maxPages, 8, 50),
						sameHostOnly: ec.params.sameHostOnly !== false,
						timeoutMs: normalizeLimit(
							ec.params.timeoutMs,
							30_000,
							120_000,
						),
						maxBytes: normalizeLimit(
							ec.params.maxBytes,
							5_000_000,
							20_000_000,
						),
						failureMode: 'skip',
						enqueueBudget: 'maxPages',
						webFetch,
						savePage: crawl.savePage,
					}).then((crawled) =>
						crawled.flatMap((page) => {
							if (!page.ok) {
								return [];
							}

							return [
								{
									url: page.url,
									text: page.text,
									status: page.status,
									...(page.title !== undefined
										? { title: page.title }
										: {}),
									...(page.savedPath !== undefined
										? { savedPath: page.savedPath }
										: {}),
								},
							];
						}),
					),
				);
			}),
		);

		return {
			inputs: [startUrl],
			outputs: [
				configureOutput('pages', pages$, {
					wireType: 'json',
				}),
			],
		};
	},
});
