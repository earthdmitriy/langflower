import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { assertUrlSafeForFetch } from './ssrf-guard.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;

/** Options for SSRF-guarded HTTP GET (`createWebFetch`). */
export type WebFetchRequest = {
	readonly url: string;
	readonly timeoutMs?: number;
	readonly maxBytes?: number;
};

/** Result of one `createWebFetch` call. */
export type WebFetchResult = {
	readonly ok: boolean;
	readonly status: number;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly error?: string;
};

export type CreateWebFetchOptions = {
	readonly allowedHosts?: readonly string[];
	/** Injected for tests; defaults to undici `fetch` with DNS pin. */
	readonly fetchImpl?: typeof fetch;
};

const headersToRecord = (
	headers: Headers,
): Readonly<Record<string, string>> => {
	const out: Record<string, string> = {};

	headers.forEach((value, key) => {
		out[key] = value;
	});

	return out;
};

const readBodyLimited = async (
	response: Response,
	maxBytes: number,
): Promise<string> => {
	if (response.body === null) {
		return '';
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let total = 0;
	let text = '';

	for (;;) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		if (value === undefined) {
			continue;
		}

		total += value.byteLength;

		if (total > maxBytes) {
			await reader.cancel();
			throw new Error(`Response exceeded maxBytes (${maxBytes}).`);
		}

		text += decoder.decode(value, { stream: true });
	}

	text += decoder.decode();
	return text;
};

/**
 * Fetch with TCP connect pinned to a previously SSRF-validated address so
 * DNS cannot rebind between check and connect (Host/SNI still use hostname).
 */
const fetchPinned = async (
	url: URL,
	pinnedAddresses: readonly string[],
	init: RequestInit,
): Promise<Response> => {
	const pinned = pinnedAddresses[0];

	// undici RequestInit ≠ DOM RequestInit under exactOptionalPropertyTypes.
	const undiciInit = init as unknown as Parameters<typeof undiciFetch>[1];

	if (pinned === undefined) {
		return undiciFetch(
			url.toString(),
			undiciInit,
		) as unknown as Promise<Response>;
	}

	const family = net.isIP(pinned) === 6 ? 6 : 4;
	const agent = new Agent({
		connect: {
			lookup: (_hostname, _options, callback) => {
				callback(null, pinned, family);
			},
		},
	});

	try {
		return (await undiciFetch(url.toString(), {
			...undiciInit,
			dispatcher: agent,
		})) as unknown as Response;
	} finally {
		await agent.close();
	}
};

/**
 * SSRF-guarded HTTP GET for crawl / Fetch URL nodes.
 * Validates every redirect hop; truncates body at `maxBytes`.
 * Default path pins DNS via undici Agent; injected `fetchImpl` skips pin
 * (tests) but still runs {@link assertUrlSafeForFetch} per hop.
 */
export const createWebFetch = (
	options: CreateWebFetchOptions = {},
): ((request: WebFetchRequest) => Promise<WebFetchResult>) => {
	const fetchImpl = options.fetchImpl;

	return async (request) => {
		const timeoutMs =
			typeof request.timeoutMs === 'number' && request.timeoutMs > 0
				? request.timeoutMs
				: DEFAULT_TIMEOUT_MS;
		const maxBytes =
			typeof request.maxBytes === 'number' && request.maxBytes > 0
				? request.maxBytes
				: DEFAULT_MAX_BYTES;

		try {
			let currentUrl = request.url;

			for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
				const safe = await assertUrlSafeForFetch(currentUrl, {
					...(options.allowedHosts !== undefined
						? { allowedHosts: options.allowedHosts }
						: {}),
				});
				const safeUrl = safe.url;

				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), timeoutMs);

				try {
					const init: RequestInit = {
						method: 'GET',
						redirect: 'manual',
						signal: controller.signal,
						headers: {
							Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
							'User-Agent': 'LangflowerCrawl/0.1',
						},
					};

					const response =
						fetchImpl !== undefined
							? await fetchImpl(safeUrl.toString(), init)
							: await fetchPinned(
									safeUrl,
									safe.pinnedAddresses,
									init,
								);

					if (
						response.status >= 300 &&
						response.status < 400 &&
						response.headers.has('location')
					) {
						const location = response.headers.get('location');

						if (location === null || location.length === 0) {
							return {
								ok: false,
								status: response.status,
								url: safeUrl.toString(),
								headers: headersToRecord(response.headers),
								body: '',
								error: 'Redirect missing Location header.',
							};
						}

						currentUrl = new URL(location, safeUrl).toString();
						continue;
					}

					const body = await readBodyLimited(response, maxBytes);

					return {
						ok: response.ok,
						status: response.status,
						url: safeUrl.toString(),
						headers: headersToRecord(response.headers),
						body,
						...(response.ok
							? {}
							: {
									error: `HTTP ${response.status} ${response.statusText}`,
								}),
					};
				} finally {
					clearTimeout(timer);
				}
			}

			return {
				ok: false,
				status: 0,
				url: currentUrl,
				headers: {},
				body: '',
				error: `Too many redirects (>${MAX_REDIRECTS}).`,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);

			return {
				ok: false,
				status: 0,
				url: request.url,
				headers: {},
				body: '',
				error: message,
			};
		}
	};
};
