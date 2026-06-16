import type { WebFetchRequest, WebFetchResult } from '../create-web-fetch.js';
import {
	extractHtmlTitle,
	extractLinks,
	htmlToText,
	isSameHost,
} from './html.js';

export type BfsCrawlSavePage = (page: {
	readonly url: string;
	readonly html: string;
	readonly text: string;
	readonly title?: string;
}) => Promise<{ readonly savedPath: string }>;

/**
 * How failed fetches join the result list:
 * - `skip` — graph Crawl: empty `!ok` bodies omitted; `!ok` with body still
 *   processed; unexpected `webFetch` throws propagate.
 * - `record` — `crawl_bfs` tool: `!ok` or throw → `{ ok: false, error }`, continue.
 */
export type BfsCrawlFailureMode = 'skip' | 'record';

/**
 * Whether the frontier may grow past `maxPages`:
 * - `maxPages` — graph: stop enqueueing when `pages + queue` would exceed cap.
 * - `unlimited` — tool: enqueue freely; only processed pages hit `maxPages`.
 */
export type BfsCrawlEnqueueBudget = 'maxPages' | 'unlimited';

export type RunBfsCrawlOptions = {
	readonly startUrl: string;
	readonly maxPages: number;
	/** Cap link expansion depth (`0` = seed only). Omit for no depth limit. */
	readonly maxDepth?: number;
	/** Default `true`. */
	readonly sameHostOnly?: boolean;
	readonly timeoutMs?: number;
	readonly maxBytes?: number;
	readonly webFetch: (request: WebFetchRequest) => Promise<WebFetchResult>;
	readonly savePage?: BfsCrawlSavePage;
	readonly failureMode: BfsCrawlFailureMode;
	/** Default `maxPages`. */
	readonly enqueueBudget?: BfsCrawlEnqueueBudget;
};

export type BfsCrawlPage =
	| {
			readonly ok: true;
			readonly url: string;
			readonly status: number;
			readonly html: string;
			readonly text: string;
			readonly title?: string;
			readonly savedPath?: string;
			readonly depth: number;
	  }
	| {
			readonly ok: false;
			readonly url: string;
			readonly error: string;
			readonly depth: number;
	  };

type QueueItem = {
	readonly url: string;
	readonly depth: number;
};

const fetchErrorMessage = (url: string, fetched: WebFetchResult): string =>
	fetched.error ?? `Fetch failed for ${url} (status ${fetched.status}).`;

/**
 * Shared BFS crawl used by graph `common-crawl` and agent `crawl_bfs`.
 * Contracts differ via options — not forked algorithms.
 */
export const runBfsCrawl = async (
	options: RunBfsCrawlOptions,
): Promise<readonly BfsCrawlPage[]> => {
	const sameHostOnly = options.sameHostOnly !== false;
	const enqueueBudget = options.enqueueBudget ?? 'maxPages';
	const visited = new Set<string>();
	const scheduled = new Set<string>([options.startUrl]);
	const queue: QueueItem[] = [{ url: options.startUrl, depth: 0 }];
	const pages: BfsCrawlPage[] = [];

	const mayEnqueue = (): boolean => {
		if (enqueueBudget === 'unlimited') {
			return true;
		}

		return pages.length + queue.length < options.maxPages;
	};

	while (queue.length > 0 && pages.length < options.maxPages) {
		const next = queue.shift();

		if (next === undefined) {
			break;
		}

		if (visited.has(next.url)) {
			continue;
		}

		visited.add(next.url);

		let fetched: WebFetchResult;

		try {
			fetched = await options.webFetch({
				url: next.url,
				...(options.timeoutMs !== undefined
					? { timeoutMs: options.timeoutMs }
					: {}),
				...(options.maxBytes !== undefined
					? { maxBytes: options.maxBytes }
					: {}),
			});
		} catch (error) {
			if (options.failureMode === 'skip') {
				throw error;
			}

			pages.push({
				ok: false,
				url: next.url,
				error: error instanceof Error ? error.message : String(error),
				depth: next.depth,
			});
			continue;
		}

		if (!fetched.ok) {
			if (options.failureMode === 'record') {
				pages.push({
					ok: false,
					url: next.url,
					error: fetchErrorMessage(next.url, fetched),
					depth: next.depth,
				});
				continue;
			}

			if (fetched.body.length === 0) {
				continue;
			}
		}

		const text = htmlToText(fetched.body);
		const title = extractHtmlTitle(fetched.body);
		const pageUrl = fetched.url || next.url;
		let savedPath: string | undefined;

		if (options.savePage !== undefined) {
			const saved = await options.savePage({
				url: pageUrl,
				html: fetched.body,
				text,
				...(title !== undefined ? { title } : {}),
			});
			savedPath = saved.savedPath;
		}

		pages.push({
			ok: true,
			url: pageUrl,
			status: fetched.status,
			html: fetched.body,
			text,
			depth: next.depth,
			...(title !== undefined ? { title } : {}),
			...(savedPath !== undefined ? { savedPath } : {}),
		});

		if (options.maxDepth !== undefined && next.depth >= options.maxDepth) {
			continue;
		}

		const links = extractLinks(fetched.body, pageUrl);
		const candidates = links.filter((link) => {
			if (scheduled.has(link)) {
				return false;
			}

			if (sameHostOnly && !isSameHost(options.startUrl, link)) {
				return false;
			}

			return true;
		});

		for (const link of candidates) {
			if (!mayEnqueue()) {
				break;
			}

			scheduled.add(link);
			queue.push({ url: link, depth: next.depth + 1 });
		}
	}

	return pages;
};
