import type { Edge } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import {
	resolveNodePorts,
	type DiagramBypassPortRow,
	type DiagramInputPortRow,
	type DiagramOutputPortRow,
	type PortsConfig,
} from '../resolve-diagram-node-ports.js';

const contextSymbol = Symbol('context');

/** Ergonomic ng-diagram edge literal for tests — handles are already prefixed. */
function mkEdge(
	edgeId: string,
	source: string,
	sourcePort: string,
	target: string,
	targetPort: string,
): Edge {
	return { id: edgeId, source, sourcePort, target, targetPort, data: {} };
}

function portsConfig(
	partial: Partial<PortsConfig> & {
		inputsConfigs: PortsConfig['inputsConfigs'];
		outputsConfigs: PortsConfig['outputsConfigs'];
	},
): PortsConfig {
	return {
		inputsConfigs: partial.inputsConfigs,
		outputsConfigs: partial.outputsConfigs,
		bypassPorts: partial.bypassPorts ?? {},
	};
}

describe('resolveNodePorts (canvas port resolution)', () => {
	it('resolves output ports with out:<name> ids and wire types', () => {
		const config = portsConfig({
			inputsConfigs: [],
			outputsConfigs: [
				{
					dir: 'out',
					portId: 'value',
					name: 'value',
					wireType: 'string',
				},
			],
		});

		const { outputPorts } = resolveNodePorts(config, 'n1', []);

		expect(outputPorts).toEqual([
			{ portId: 'out:value', label: 'value', wireType: 'string' },
		] satisfies DiagramOutputPortRow[]);
	});

	it('resolves input ports with in:<name> ids', () => {
		const config = portsConfig({
			inputsConfigs: [
				{ dir: 'in', portId: 'text', name: 'text', wireType: 'string' },
			],
			outputsConfigs: [],
		});

		const { inputPorts } = resolveNodePorts(config, 'n1', []);

		expect(inputPorts).toEqual([
			{
				handle: 'text',
				portId: 'in:text',
				label: 'text',
				wireType: 'string',
				basePortId: 'text',
				slotIndex: 0,
				inline: null,
				value: undefined,
				connected: false,
			},
		] satisfies DiagramInputPortRow[]);
	});

	it('resolves inline config, value (from nodeInputs or defaultValue), and connected', () => {
		const config = portsConfig({
			inputsConfigs: [
				{
					dir: 'in',
					portId: 'value',
					name: 'value',
					wireType: 'string',
					inline: 'text',
					defaultValue: 'fallback',
				},
				{
					dir: 'in',
					portId: 'other',
					name: 'other',
					wireType: 'string',
					inline: 'text',
					defaultValue: 'fallback',
				},
			],
			outputsConfigs: [],
		});
		const edges: readonly Edge[] = [
			mkEdge('e1', 'n0', 'out:out', 'n1', 'in:other'),
		];

		const { inputPorts } = resolveNodePorts(config, 'n1', edges, {
			value: 'hello',
		});

		expect(inputPorts).toEqual([
			{
				handle: 'value',
				portId: 'in:value',
				label: 'value',
				wireType: 'string',
				basePortId: 'value',
				slotIndex: 0,
				inline: 'text',
				value: 'hello',
				connected: false,
			},
			{
				handle: 'other',
				portId: 'in:other',
				label: 'other',
				wireType: 'string',
				basePortId: 'other',
				slotIndex: 0,
				inline: 'text',
				value: 'fallback',
				connected: true,
			},
		] satisfies DiagramInputPortRow[]);
	});

	it('only exposes inline/value on slot 0 of a multi input', () => {
		const config = portsConfig({
			inputsConfigs: [
				{
					dir: 'in',
					portId: 'text',
					name: 'text',
					wireType: 'string',
					multi: 'merge',
					inline: 'text',
					defaultValue: 'seed',
				},
			],
			outputsConfigs: [],
		});
		const edges: readonly Edge[] = [
			mkEdge('e1', 'n0', 'out:out', 'n1', 'in:text'),
		];

		const { inputPorts } = resolveNodePorts(config, 'n1', edges);

		expect(inputPorts.map((p) => [p.slotIndex, p.inline, p.value])).toEqual(
			[
				[0, 'text', 'seed'],
				[1, null, undefined],
			],
		);
	});

	it('skips hidden inputs and symbol portIds (e.g. the reactive context port)', () => {
		const config = portsConfig({
			inputsConfigs: [
				{
					dir: 'in',
					portId: contextSymbol,
					name: 'context',
					wireType: contextSymbol,
					hidden: true,
				},
				{
					dir: 'in',
					portId: 'value',
					name: 'value',
					wireType: 'string',
				},
				{
					dir: 'in',
					portId: 'secret',
					name: 'secret',
					wireType: 'string',
					hidden: true,
				},
			],
			outputsConfigs: [
				{ dir: 'out', portId: 'out', name: 'out', wireType: 'any' },
			],
		});

		const { inputPorts } = resolveNodePorts(config, 'n1', []);

		expect(inputPorts.map((p) => p.handle)).toEqual(['value']);
	});

	it('expands multi inputs from connected edges, showing +1 free slot', () => {
		const config = portsConfig({
			inputsConfigs: [
				{
					dir: 'in',
					portId: 'text',
					name: 'text',
					wireType: 'string',
					multi: 'merge',
				},
			],
			outputsConfigs: [],
		});
		const edges: readonly Edge[] = [
			mkEdge('e1', 'n0', 'out:out', 'n1', 'in:text'),
		];

		const { inputPorts } = resolveNodePorts(config, 'n1', edges);

		expect(inputPorts.map((p) => p.portId)).toEqual([
			'in:text',
			'in:text@1',
		]);
	});

	it('expands multi inputs to three slots when two edges are connected', () => {
		const config = portsConfig({
			inputsConfigs: [
				{
					dir: 'in',
					portId: 'text',
					name: 'text',
					wireType: 'string',
					multi: 'merge',
				},
			],
			outputsConfigs: [],
		});
		const edges: readonly Edge[] = [
			mkEdge('e1', 'n0', 'out:out', 'n1', 'in:text'),
			mkEdge('e2', 'n2', 'out:out', 'n1', 'in:text@1'),
		];

		const { inputPorts } = resolveNodePorts(config, 'n1', edges);

		expect(inputPorts.map((p) => p.portId)).toEqual([
			'in:text',
			'in:text@1',
			'in:text@2',
		]);
	});

	it('returns empty ports for an unknown node type (no config)', () => {
		const { inputPorts, outputPorts } = resolveNodePorts(
			undefined,
			'n1',
			[],
		);

		expect(inputPorts).toEqual([]);
		expect(outputPorts).toEqual([]);
	});

	it('renders bypass ports as combined in/out rows with the configured wire type', () => {
		const config = portsConfig({
			inputsConfigs: [],
			outputsConfigs: [],
			bypassPorts: { ch: 'dynamic' },
		});

		const { inputPorts, outputPorts, bypassPorts } = resolveNodePorts(
			config,
			'n1',
			[],
		);

		expect(inputPorts).toEqual([]);
		expect(outputPorts).toEqual([]);
		expect(bypassPorts).toEqual([
			{
				handle: 'ch',
				inputPortId: 'in:ch',
				outputPortId: 'out:ch',
				label: 'ch',
				wireType: 'dynamic',
			},
		] satisfies DiagramBypassPortRow[]);
	});

	it('exposes one additional free bypass slot per connected channel (symmetric)', () => {
		const config = portsConfig({
			inputsConfigs: [],
			outputsConfigs: [],
			bypassPorts: { ch: 'dynamic' },
		});

		const edges: readonly Edge[] = [
			mkEdge('e1', 'n1', 'out:ch', 'n2', 'in:in'),
			mkEdge('e2', 'n1', 'out:ch@1', 'n3', 'in:in'),
			mkEdge('e3', 'n1', 'out:ch@2', 'n4', 'in:in'),
			mkEdge('e4', 'n0', 'out:out', 'n1', 'in:ch'),
			mkEdge('e5', 'n0b', 'out:out', 'n1', 'in:ch@1'),
			mkEdge('e6', 'n0c', 'out:out', 'n1', 'in:ch@2'),
		];

		const { bypassPorts } = resolveNodePorts(config, 'n1', edges);

		expect(bypassPorts.map((p) => p.handle)).toEqual([
			'ch',
			'ch@1',
			'ch@2',
			'ch@3',
		]);
	});

	it('grows both input and output when only input edges exist (symmetric)', () => {
		const config = portsConfig({
			inputsConfigs: [],
			outputsConfigs: [],
			bypassPorts: { ch: 'dynamic' },
		});

		const edges: readonly Edge[] = [
			mkEdge('e1', 'n0', 'out:out', 'n1', 'in:ch'),
			mkEdge('e2', 'n0b', 'out:out', 'n1', 'in:ch@1'),
		];

		const { bypassPorts } = resolveNodePorts(config, 'n1', edges);

		expect(bypassPorts.map((p) => [p.inputPortId, p.outputPortId])).toEqual(
			[
				['in:ch', 'out:ch'],
				['in:ch@1', 'out:ch@1'],
				['in:ch@2', 'out:ch@2'],
			],
		);
	});
});
