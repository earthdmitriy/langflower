import type { EdgeId, NodeId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import {
	displayEnabledToolIds,
	HARNESS_BUILTIN_TOOL_OPTIONS,
	mergeEnabledToolIdsOnNewWires,
	resolveEnabledToolOptions,
	resolveMcpServerOptions,
	resolveWiredToolOptions,
} from './resolve-wired-tool-options.js';

describe('resolveWiredToolOptions', () => {
	it('expands domain pack nodes into their tool ids', () => {
		const options = resolveWiredToolOptions(
			{
				nodes: [
					{
						id: 'mem',
						type: 'common-memory-tools',
						params: {},
						inputs: {},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'llm',
						type: 'common-fake-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 0, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e1' as EdgeId,
						fromNodeId: 'mem' as NodeId,
						fromPort: ['tools', 0],
						toNodeId: 'llm' as NodeId,
						toPort: ['tools', 0],
					},
				],
			},
			'llm',
		);

		expect(options.map((o) => o.value).sort()).toEqual(
			[
				'append_memory_log',
				'create_memory_file',
				'get_memory_tree',
				'read_memory_section',
				'search_memory_grep',
				'update_memory_section',
			].sort(),
		);
	});

	it('maps wired tool-registration edges to select options with description', () => {
		const options = resolveWiredToolOptions(
			{
				nodes: [
					{
						id: 'tool-grep',
						type: 'author-tool-registration',
						params: {},
						inputs: {
							toolId: 'grep',
							name: 'grep',
							description: 'search files',
						},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'tool-read',
						type: 'author-tool-registration',
						params: {},
						inputs: {
							toolId: 'read_file',
							name: 'read_file',
							description: '',
						},
						ui: { position: { x: 0, y: 120 } },
					},
					{
						id: 'llm-1',
						type: 'common-fake-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 280, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e1' as EdgeId,
						fromNodeId: 'tool-grep' as NodeId,
						fromPort: ['toolRegistration', 0],
						toNodeId: 'llm-1' as NodeId,
						toPort: ['tools', 0],
					},
					{
						edgeId: 'e2' as EdgeId,
						fromNodeId: 'tool-read' as NodeId,
						fromPort: ['toolRegistration', 0],
						toNodeId: 'llm-1' as NodeId,
						toPort: ['tools', 1],
					},
				],
			},
			'llm-1',
		);

		expect(options).toEqual([
			{
				value: 'grep',
				title: 'grep',
				description: 'search files',
			},
			{
				value: 'read_file',
				title: 'read_file',
			},
		]);
	});

	it('returns an empty list when nothing is wired into tools', () => {
		expect(
			resolveWiredToolOptions(
				{
					nodes: [
						{
							id: 'llm-1',
							type: 'common-fake-llm',
							params: {},
							inputs: {},
							ui: { position: { x: 0, y: 0 } },
						},
					],
					edges: [],
				},
				'llm-1',
			),
		).toEqual([]);
	});
});

describe('resolveMcpServerOptions', () => {
	it('lists system MCP servers from langflower.jsonc', () => {
		const options = resolveMcpServerOptions({
			mcp: {
				servers: {
					echo: {
						kind: 'stdio',
						command: 'node echo.mjs',
					},
					remote: {
						kind: 'http',
						url: 'http://127.0.0.1:3100/mcp',
					},
				},
			},
		});

		expect(options).toEqual([
			{
				value: 'echo',
				title: 'echo',
				description: 'System MCP stdio «echo»',
			},
			{
				value: 'remote',
				title: 'remote',
				description: 'System MCP http «remote»',
			},
		]);
	});
});

describe('resolveEnabledToolOptions', () => {
	it('lists harness builtins when nothing is wired', () => {
		const options = resolveEnabledToolOptions(
			{
				nodes: [
					{
						id: 'llm-1',
						type: 'common-fake-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 0, y: 0 } },
					},
				],
				edges: [],
			},
			'llm-1',
		);

		expect(options).toEqual([...HARNESS_BUILTIN_TOOL_OPTIONS]);
	});

	it('prefers wired metadata when a builtin id is also wired', () => {
		const options = resolveEnabledToolOptions(
			{
				nodes: [
					{
						id: 'tool-read',
						type: 'author-tool-registration',
						params: {},
						inputs: {
							toolId: 'read',
							name: 'read',
							description: 'wired read',
						},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'llm-1',
						type: 'common-fake-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 280, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e1' as EdgeId,
						fromNodeId: 'tool-read' as NodeId,
						fromPort: ['toolRegistration', 0],
						toNodeId: 'llm-1' as NodeId,
						toPort: ['tools', 0],
					},
				],
			},
			'llm-1',
		);

		expect(options.find((option) => option.value === 'read')).toEqual({
			value: 'read',
			title: 'read',
			description: 'wired read',
		});
		expect(
			options.filter((option) => option.value === 'read'),
		).toHaveLength(1);
	});
});

describe('displayEnabledToolIds', () => {
	it('treats unset allowlist as all option ids', () => {
		expect(displayEnabledToolIds(undefined, ['grep', 'read_file'])).toEqual(
			['grep', 'read_file'],
		);
	});

	it('preserves explicit allowlist including empty', () => {
		expect(displayEnabledToolIds([], ['grep'])).toEqual([]);
		expect(displayEnabledToolIds(['grep'], ['grep', 'read_file'])).toEqual([
			'grep',
		]);
	});
});

describe('mergeEnabledToolIdsOnNewWires', () => {
	it('appends newly wired tool ids to an explicit allowlist', () => {
		expect(
			mergeEnabledToolIdsOnNewWires(['grep'], ['grep', 'read_file']),
		).toEqual(['grep', 'read_file']);
	});

	it('returns the same array reference when nothing new is wired', () => {
		const current = ['grep'] as const;

		expect(mergeEnabledToolIdsOnNewWires(current, ['grep'])).toBe(current);
	});
});
