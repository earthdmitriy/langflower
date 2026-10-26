import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createRuntimeHarness } from './testing/workflows/workflow-events.js';
import type { NodeId, PortMeta, RuntimeNode } from './types.js';
import {
	formatWireType,
	wireTypeIs,
	wireTypesCompatible,
} from './wire-type.js';

describe('wire type helpers', () => {
	it('treats a scalar exactly as before', () => {
		expect(wireTypesCompatible('string', 'string')).toBe(true);
		expect(wireTypesCompatible('string', 'number')).toBe(false);
		expect(wireTypesCompatible('any', 'number')).toBe(true);
		expect(wireTypesCompatible('number', 'any')).toBe(true);
	});

	it('connects a union when the sides share a member', () => {
		const input = ['string', 'user-turn'] as const;
		expect(wireTypesCompatible('string', input)).toBe(true);
		expect(wireTypesCompatible('user-turn', input)).toBe(true);
		expect(wireTypesCompatible('number', input)).toBe(false);
		expect(wireTypesCompatible(['number', 'string'], input)).toBe(true);
		expect(wireTypesCompatible('any', input)).toBe(true);
	});

	it('wireTypeIs matches only an exact single type', () => {
		expect(wireTypeIs('number', 'number')).toBe(true);
		expect(wireTypeIs(['number'], 'number')).toBe(true);
		expect(wireTypeIs(['number', 'string'], 'number')).toBe(false);
		expect(wireTypeIs(undefined, 'number')).toBe(false);
		expect(wireTypeIs(Symbol('ctx'), 'number')).toBe(false);
	});

	it('formats a union with a bar and a scalar bare', () => {
		expect(formatWireType('string')).toBe('string');
		expect(formatWireType(['string', 'user-turn'])).toBe(
			'string | user-turn',
		);
	});
});

const asNodeId = (id: string): NodeId => id as NodeId;

const source = (nodeId: string, wireType: string): RuntimeNode => ({
	nodeId: asNodeId(nodeId),
	inputs: {},
	outputs: {
		value: statefulObservable({
			loader: () => of('x'),
			meta: { dir: 'out', portId: 'value', wireType },
		}),
	},
	bypassPorts: {},
});

const sink = (
	nodeId: string,
	wireType: string | readonly string[],
): RuntimeNode => ({
	nodeId: asNodeId(nodeId),
	inputs: {
		value: statefulConnection<unknown, unknown, PortMeta>({
			meta: { dir: 'in', portId: 'value', wireType, mode: 'single' },
		}),
	},
	outputs: {},
	bypassPorts: {},
});

describe('RuntimeEditor.addEdge with union wire types', () => {
	const connect = (
		sourceType: string,
		inputType: string | readonly string[],
	): boolean => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(source('A', sourceType));
		runtime.editor.addNode(sink('B', inputType));
		return (
			runtime.editor.addEdge({
				fromNodeId: asNodeId('A'),
				fromPort: ['value', 0],
				toNodeId: asNodeId('B'),
				toPort: ['value', 0],
			}) !== false
		);
	};

	it('keeps scalar-to-scalar behavior', () => {
		expect(connect('string', 'string')).toBe(true);
		expect(connect('user-turn', 'string')).toBe(false);
	});

	it('accepts either member on a union input and rejects others', () => {
		const input = ['string', 'user-turn'] as const;
		expect(connect('string', input)).toBe(true);
		expect(connect('user-turn', input)).toBe(true);
		expect(connect('number', input)).toBe(false);
	});
});
