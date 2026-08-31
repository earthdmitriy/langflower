import { describe, expect, it, vi } from 'vitest';
import {
	connectMcpHttpClient,
	connectMcpHttpWithOptionalLaunch,
} from './mcp-http-client.js';

const jsonRpcResponse = (id: number, result: unknown): Response =>
	new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

const initializeFetch = (): ReturnType<typeof vi.fn> =>
	vi.fn(async (_url: string, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body ?? '{}')) as {
			readonly id?: number;
			readonly method?: string;
		};

		if (body.method === 'initialize') {
			return jsonRpcResponse(body.id ?? 1, {
				serverInfo: { name: 'echo' },
			});
		}

		return jsonRpcResponse(body.id ?? 0, {});
	});

const requestHeaders = (
	init: RequestInit | undefined,
): Record<string, string> => {
	const raw = init?.headers;
	if (raw === undefined || Array.isArray(raw) || raw instanceof Headers) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(raw).map(([key, value]) => [key, String(value)]),
	);
};

describe('connectMcpHttpClient headers', () => {
	it('sends interpolated Authorization on initialize', async () => {
		const fetchImpl = initializeFetch();
		const client = await connectMcpHttpClient({
			url: 'https://example.com/mcp',
			fetchImpl: fetchImpl as typeof fetch,
			headers: { Authorization: 'Bearer sk-live' },
		});

		const first = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
		expect(requestHeaders(first).Authorization).toBe('Bearer sk-live');
		await client.close();
	});

	it('lets protocol Content-Type win over user keys', async () => {
		const fetchImpl = initializeFetch();
		const client = await connectMcpHttpClient({
			url: 'https://example.com/mcp',
			fetchImpl: fetchImpl as typeof fetch,
			headers: {
				'Content-Type': 'text/plain',
				accept: 'text/plain',
			},
		});

		const first = requestHeaders(
			fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined,
		);
		expect(first['content-type']).toBe('application/json');
		expect(first['Content-Type']).toBeUndefined();
		expect(first.accept).toBe('application/json, text/event-stream');
		await client.close();
	});
});

describe('connectMcpHttpWithOptionalLaunch headers', () => {
	it('forwards headers to the client', async () => {
		const fetchImpl = initializeFetch();
		const session = await connectMcpHttpWithOptionalLaunch({
			url: 'https://example.com/mcp',
			fetchImpl: fetchImpl as typeof fetch,
			retries: 1,
			headers: { Authorization: 'Bearer from-launch' },
		});

		const first = requestHeaders(
			fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined,
		);
		expect(first.Authorization).toBe('Bearer from-launch');
		await session.close();
	});
});
