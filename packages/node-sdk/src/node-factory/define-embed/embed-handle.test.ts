import { describe, expect, it } from 'vitest';
import {
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
} from '../define-tool-registrations/tool-handle.js';
import {
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
	type EmbedHandle,
} from './embed-handle.js';

const validHandle = (): EmbedHandle => ({
	dim: 8,
	embedTexts: async (texts) => texts.map(() => new Float32Array(8).fill(0.1)),
});

describe('EMBED_HANDLE_WIRE_TYPE', () => {
	it('is the embed-handle literal and is not tool-handle', () => {
		expect(EMBED_HANDLE_WIRE_TYPE).toBe('embed-handle');
		expect(EMBED_HANDLE_WIRE_TYPE).not.toBe(TOOL_HANDLE_WIRE_TYPE);
	});
});

describe('isEmbedHandle', () => {
	it('accepts a handle with positive dim and embedTexts', () => {
		expect(isEmbedHandle(validHandle())).toBe(true);
	});

	it('rejects missing embedTexts', () => {
		expect(isEmbedHandle({ dim: 8 })).toBe(false);
	});

	it('rejects non-positive or non-finite dim', () => {
		const embedTexts = validHandle().embedTexts;
		expect(isEmbedHandle({ dim: 0, embedTexts })).toBe(false);
		expect(isEmbedHandle({ dim: -1, embedTexts })).toBe(false);
		expect(isEmbedHandle({ dim: Number.NaN, embedTexts })).toBe(false);
		expect(
			isEmbedHandle({
				dim: Number.POSITIVE_INFINITY,
				embedTexts,
			}),
		).toBe(false);
	});

	it('rejects a ToolHandle-shaped object', () => {
		const tool: ToolHandle = {
			toolId: 'search',
			name: 'search',
			description: 'search',
			inputSchema: {},
			invoke: async () => '',
		};
		expect(isEmbedHandle(tool)).toBe(false);
	});
});
