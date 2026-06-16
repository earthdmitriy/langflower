import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BuiltMcpHandle } from './build-mcp-handle.js';
import {
	collectEnabledMcpIdsFromNodes,
	createSystemMcpHandles,
	filterMcpFailuresForNode,
	filterMcpHandlesByIds,
	parseEnabledMcpIds,
} from './create-system-mcp-handles.js';

vi.mock('./mcp-stdio-client.js', () => ({
	connectMcpStdioFromCli: vi.fn(),
}));

vi.mock('./mcp-http-client.js', () => ({
	connectMcpHttpWithOptionalLaunch: vi.fn(),
}));

vi.mock('./build-mcp-handle.js', () => ({
	buildMcpHandle: vi.fn(),
}));

import { connectMcpStdioFromCli } from './mcp-stdio-client.js';
import { connectMcpHttpWithOptionalLaunch } from './mcp-http-client.js';
import { buildMcpHandle } from './build-mcp-handle.js';

const connectStdio = vi.mocked(connectMcpStdioFromCli);
const connectHttp = vi.mocked(connectMcpHttpWithOptionalLaunch);
const buildHandle = vi.mocked(buildMcpHandle);

const fakeHandle = (id: string): BuiltMcpHandle => ({
	id,
	name: id,
	tools: [],
});

describe('parseEnabledMcpIds', () => {
	it('returns valid ids only', () => {
		expect(parseEnabledMcpIds(['ok', 'Bad Id', '', 'remote'])).toEqual([
			'ok',
			'remote',
		]);
	});

	it('returns empty when unset', () => {
		expect(parseEnabledMcpIds(undefined)).toEqual([]);
	});
});

describe('collectEnabledMcpIdsFromNodes', () => {
	it('unions enabledMcpIds across nodes', () => {
		expect(
			collectEnabledMcpIdsFromNodes([
				{ params: { enabledMcpIds: ['echo', 'a'] } },
				{ params: { enabledMcpIds: ['a', 'remote'] } },
				{ params: {} },
			]).toSorted(),
		).toEqual(['a', 'echo', 'remote']);
	});
});

describe('filterMcpHandlesByIds', () => {
	it('keeps only enabled ids', () => {
		const handles = [
			fakeHandle('echo'),
			fakeHandle('remote'),
			fakeHandle('other'),
		];
		expect(
			filterMcpHandlesByIds(handles, ['echo', 'other']).map((t) => t.id),
		).toEqual(['echo', 'other']);
	});

	it('returns none when enable list is empty', () => {
		expect(filterMcpHandlesByIds([fakeHandle('echo')], [])).toEqual([]);
	});
});

describe('filterMcpFailuresForNode', () => {
	it('keeps failures that intersect enabled ids', () => {
		expect(
			filterMcpFailuresForNode(
				[
					{ serverId: 'bad', message: 'x' },
					{ serverId: 'ok', message: 'y' },
				],
				['bad', 'other'],
			),
		).toEqual([{ serverId: 'bad', message: 'x' }]);
	});
});

describe('createSystemMcpHandles partial connect (S6)', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('keeps successful servers when another fails', async () => {
		const closeOk = vi.fn(async () => undefined);
		connectStdio.mockImplementation(async ({ commandLine }) => {
			if (String(commandLine).includes('bad')) {
				throw new Error('spawn ENOENT');
			}

			return {
				close: closeOk,
				serverName: 'good',
				listTools: async () => [],
			} as never;
		});
		buildHandle.mockImplementation(async ({ id }) =>
			fakeHandle(String(id)),
		);

		const result = await createSystemMcpHandles({
			projectRoot: '/tmp',
			serverIds: ['good', 'bad'],
			servers: {
				good: { kind: 'stdio', command: 'npx good-mcp' },
				bad: { kind: 'stdio', command: 'npx bad-mcp' },
			},
		});

		expect(result.handles.map((h) => h.id)).toEqual(['good']);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0]?.serverId).toBe('bad');
		expect(result.failures[0]?.message).toMatch(
			/MCP system connect failed/,
		);
		expect(closeOk).not.toHaveBeenCalled();

		await result.close();
		expect(closeOk).toHaveBeenCalled();
	});

	it('records http failures without aborting siblings', async () => {
		connectHttp.mockRejectedValue(new Error('fetch failed'));
		connectStdio.mockResolvedValue({
			close: async () => undefined,
			serverName: 'stdio',
			listTools: async () => [],
		} as never);
		buildHandle.mockImplementation(async ({ id }) =>
			fakeHandle(String(id)),
		);

		const result = await createSystemMcpHandles({
			projectRoot: '/tmp',
			serverIds: ['remote', 'local'],
			servers: {
				remote: { kind: 'http', url: 'http://127.0.0.1:9/mcp' },
				local: { kind: 'stdio', command: 'npx local-mcp' },
			},
		});

		expect(result.handles.map((h) => h.id)).toEqual(['local']);
		expect(result.failures[0]?.serverId).toBe('remote');
	});
});
