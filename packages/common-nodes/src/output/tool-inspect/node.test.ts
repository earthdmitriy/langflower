import type { ToolHandle } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { getCommonReactiveNode } from '../../catalog.js';
import {
	EMPTY_TOOL_INSPECT_TEXT,
	formatToolInspectText,
	unmatchedToolInspectText,
} from './format-tool-inspect-text.js';
import { toolInspectNode } from './node.js';

const handle = (
	toolId: string,
	options?: {
		readonly description?: string;
		readonly inputSchema?: object;
	},
): ToolHandle => ({
	toolId,
	name: toolId,
	description: options?.description ?? toolId,
	inputSchema: options?.inputSchema ?? { type: 'object', properties: {} },
	invoke: async () => 'SECRET_INVOKE',
});

const waitText = (instance: ReturnType<typeof toolInspectNode.getInstance>) =>
	firstValueFrom(instance.outputs.text.value$);

describe('formatToolInspectText', () => {
	it('returns the empty message for unwired / junk-only values', () => {
		expect(formatToolInspectText([])).toBe(EMPTY_TOOL_INSPECT_TEXT);
		expect(formatToolInspectText(null)).toBe(EMPTY_TOOL_INSPECT_TEXT);
		expect(formatToolInspectText(['nope', 12, { toolId: 'fake' }])).toBe(
			EMPTY_TOOL_INSPECT_TEXT,
		);
	});

	it('prints toolId, description, and example args — not invoke', () => {
		const dump = formatToolInspectText([
			handle('echo__ping', {
				description: 'Ping the echo server (MCP:echo)',
				inputSchema: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						count: { type: 'integer', default: 3 },
						flag: { type: 'boolean' },
						tags: { type: 'array', items: { type: 'string' } },
					},
				},
			}),
		]);

		expect(dump).toContain('echo__ping');
		expect(dump).toContain('Ping the echo server (MCP:echo)');
		expect(dump).toContain('"message": ""');
		expect(dump).toContain('"count": 3');
		expect(dump).toContain('"flag": false');
		expect(dump).toContain('"tags": []');
		expect(dump).toContain('"properties"');
		expect(dump).not.toContain('SECRET_INVOKE');
		expect(dump).not.toContain('invoke');
	});

	it('prints inputSchema enums and field descriptions (not only placeholders)', () => {
		const dump = formatToolInspectText([
			handle('civitai-mcp-server__upload_image', {
				description: 'Upload an image (MCP:civitai-mcp-server)',
				inputSchema: {
					type: 'object',
					properties: {
						url: {
							type: 'string',
							description: 'HTTP URL of the image.',
						},
						contentType: {
							type: 'string',
							description: 'MIME type of the image.',
							enum: ['image/jpeg', 'image/png', 'image/webp'],
						},
					},
					required: ['url'],
				},
			}),
		]);

		expect(dump).toContain('"contentType": "image/jpeg"');
		expect(dump).toContain('HTTP URL of the image.');
		expect(dump).toContain('MIME type of the image.');
		expect(dump).toContain('"image/png"');
		expect(dump).toContain('"image/webp"');
		expect(dump).toContain('"required"');
	});

	it('separates several tools and last-wins duplicate toolId', () => {
		const dump = formatToolInspectText([
			handle('dup', { description: 'first' }),
			handle('keep', { description: 'Keep me' }),
			handle('dup', { description: 'second' }),
		]);

		expect(dump).toContain('second');
		expect(dump).not.toContain('first');
		expect(dump).toContain('keep');
		expect(dump).toContain('Keep me');
		expect(dump).toContain('---');
	});

	it('filters to matching toolIds; empty filter keeps the pack', () => {
		const pack = [
			handle('civitai-mcp-server__upload_image', {
				description: 'Upload',
			}),
			handle('civitai-mcp-server__list_models', {
				description: 'List',
			}),
		];

		const all = formatToolInspectText(pack, '');
		expect(all).toContain('upload_image');
		expect(all).toContain('list_models');
		expect(all).toContain('---');

		const one = formatToolInspectText(pack, 'upload_image');
		expect(one).toContain('civitai-mcp-server__upload_image');
		expect(one).toContain('Upload');
		expect(one).not.toContain('list_models');
		expect(one).not.toContain('---');

		expect(formatToolInspectText(pack, 'nope')).toBe(
			unmatchedToolInspectText('nope'),
		);
	});
});

describe('common-tool-inspect', () => {
	it('registers in the Output catalog', () => {
		const node = getCommonReactiveNode('common-tool-inspect');

		expect(node).toBeDefined();
		expect(node?.displayName).toBe('Tool inspect');
		expect(node?.category).toBe('Output');
		expect(node?.getInstance).toBeTypeOf('function');
	});

	it('exposes tools and toolId in, text out', () => {
		const inputIds = toolInspectNode.inputsConfigs
			.map((meta) => meta.portId)
			.filter((id): id is string => typeof id === 'string');
		const toolsIn = toolInspectNode.inputsConfigs.find(
			(meta) => meta.portId === 'tools',
		);
		const toolIdIn = toolInspectNode.inputsConfigs.find(
			(meta) => meta.portId === 'toolId',
		);
		const outputIds = toolInspectNode.outputsConfigs.map((meta) =>
			String(meta.portId),
		);

		expect(inputIds).toEqual(['tools', 'toolId']);
		expect(toolsIn?.mode).toBe('single');
		expect(toolsIn?.wireType).toBe('tool-handle');
		expect(toolIdIn?.wireType).toBe('string');
		expect(outputIds).toEqual(['text']);
	});

	it('emits the empty message when unwired / empty', async () => {
		const instance = toolInspectNode.getInstance();
		instance.inputs.toolId.connect(of(''));
		instance.inputs.tools.connect(of([]));

		await expect(waitText(instance)).resolves.toBe(EMPTY_TOOL_INSPECT_TEXT);
	});

	it('emits a copy-paste dump for wired handles', async () => {
		const instance = toolInspectNode.getInstance();
		instance.inputs.toolId.connect(of(''));
		instance.inputs.tools.connect(
			of([
				handle('echo__ping', {
					description: 'Ping',
					inputSchema: {
						type: 'object',
						properties: { message: { type: 'string' } },
					},
				}),
			]),
		);

		const text = await waitText(instance);
		expect(text.startsWith('echo__ping\nPing\n\n')).toBe(true);
		expect(text).toContain('"message": ""');
		expect(text).not.toContain('SECRET_INVOKE');
	});

	it('filters the dump when toolId is set', async () => {
		const instance = toolInspectNode.getInstance();
		instance.inputs.toolId.connect(of('ping'));
		instance.inputs.tools.connect(
			of([
				handle('echo__ping', { description: 'Ping' }),
				handle('echo__pong', { description: 'Pong' }),
			]),
		);

		const text = await waitText(instance);
		expect(text).toContain('echo__ping');
		expect(text).not.toContain('echo__pong');
	});
});
