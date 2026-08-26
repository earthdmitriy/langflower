import type { InlineConfig } from '@langflower/node-sdk';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import type { Edge } from 'ng-diagram';
import {
	fromInputPortId,
	fromOutputPortId,
	splitSlotHandle,
	toInputPortId,
	toOutputPortId,
	toSlotHandle,
} from './diagram-port-id.js';

export type DiagramInputPortRow = {
	readonly handle: string;
	readonly portId: string;
	readonly label: string;
	readonly wireType: string;
	readonly basePortId: string;
	readonly slotIndex: number;
	/** On-node editor kind — `null` when the port has no inline control. */
	readonly inline: InlineConfig | null;
	/** Design-time literal for the port (`node.inputs[basePortId]` or its default). */
	readonly value: unknown;
	/** Whether an edge is wired into this specific handle. */
	readonly connected: boolean;
	/** Hidden wire port — no incoming handle; may still show `inline`. */
	readonly hidden: boolean;
};

export type DiagramOutputPortRow = {
	readonly portId: string;
	readonly label: string;
	readonly wireType: string;
};

export type DiagramBypassPortRow = {
	readonly handle: string;
	readonly inputPortId: string;
	readonly outputPortId: string;
	readonly label: string;
	readonly wireType: string;
};

export type DiagramNodePorts = {
	readonly inputPorts: readonly DiagramInputPortRow[];
	readonly outputPorts: readonly DiagramOutputPortRow[];
	readonly bypassPorts: readonly DiagramBypassPortRow[];
};

type PortInputConfig = PaletteNodeDefinition['inputsConfigs'][number];
type PortOutputConfig = PaletteNodeDefinition['outputsConfigs'][number];

/**
 * Plain (non-tuple) array shape of {@link PaletteNodeDefinition}'s port
 * configs, so callers without a definition can fall back to `[]`.
 */
export type PortsConfig = {
	readonly inputsConfigs: readonly PortInputConfig[];
	readonly outputsConfigs: readonly PortOutputConfig[];
	readonly bypassPorts: Record<string, string | symbol>;
};

function isHidden(value: { readonly hidden?: boolean } | undefined): boolean {
	return value?.hidden === true;
}

function isEditableInline(inline: unknown): boolean {
	if (inline === undefined) {
		return false;
	}

	if (typeof inline === 'string') {
		return !inline.startsWith('preview');
	}

	if (typeof inline === 'object' && inline !== null && 'type' in inline) {
		const type = (inline as { readonly type: unknown }).type;
		return typeof type === 'string' && !type.startsWith('preview');
	}

	return true;
}

function isVisibleOutputPort(entry: {
	readonly portId?: string | symbol;
	readonly hidden?: boolean;
}): boolean {
	return typeof entry.portId !== 'symbol' && !isHidden(entry);
}

/** Canvas row: ordinary ports, plus hidden ports that still have an editable inline. */
function isShownInputPort(entry: PortInputConfig): boolean {
	if (typeof entry.portId === 'symbol') {
		return false;
	}

	if (!isHidden(entry)) {
		return true;
	}

	return isEditableInline(entry.inline);
}

function inputWireType(config: PortInputConfig): string {
	if (config.dynamic === true) {
		return 'dynamic';
	}

	return String(config.wireType ?? 'any');
}

function maxInputSlot(
	edges: readonly Edge[],
	nodeId: string,
	basePortId: string,
): number {
	let max = -1;

	for (const edge of edges) {
		if (edge.target !== nodeId || edge.targetPort === undefined) {
			continue;
		}

		const { basePortId: base, slotIndex } = splitSlotHandle(
			fromInputPortId(edge.targetPort),
		);

		if (base !== basePortId) {
			continue;
		}

		if (slotIndex > max) {
			max = slotIndex;
		}
	}

	return max;
}

function isHandleConnected(
	edges: readonly Edge[],
	nodeId: string,
	handle: string,
): boolean {
	const portId = toInputPortId(handle);

	return edges.some(
		(edge) => edge.target === nodeId && edge.targetPort === portId,
	);
}

function resolveInputPortRows(
	config: PortsConfig | undefined,
	nodeId: string,
	edges: readonly Edge[],
	nodeInputs: Readonly<Record<string, unknown>>,
): readonly DiagramInputPortRow[] {
	if (config === undefined) {
		return [];
	}

	const rows: DiagramInputPortRow[] = [];

	for (const entry of config.inputsConfigs) {
		if (!isShownInputPort(entry)) {
			continue;
		}

		const basePortId = String(entry.portId ?? entry.name ?? 'unknown');
		const label = entry.name ?? basePortId;
		const wireType = inputWireType(entry);
		const hidden = isHidden(entry);
		const value =
			nodeInputs[basePortId] !== undefined
				? nodeInputs[basePortId]
				: entry.defaultValue;

		if (entry.multi !== undefined) {
			const maxSlot = maxInputSlot(edges, nodeId, basePortId);

			for (let slot = 0; slot <= maxSlot + 1; slot++) {
				const handle = toSlotHandle(basePortId, slot);

				rows.push({
					handle,
					portId: toInputPortId(handle),
					label,
					wireType,
					basePortId,
					slotIndex: slot,
					inline: slot === 0 ? (entry.inline ?? null) : null,
					value: slot === 0 ? value : undefined,
					connected: isHandleConnected(edges, nodeId, handle),
					hidden,
				});
			}

			continue;
		}

		rows.push({
			handle: basePortId,
			portId: toInputPortId(basePortId),
			label,
			wireType,
			basePortId,
			slotIndex: 0,
			inline: entry.inline ?? null,
			value,
			connected: isHandleConnected(edges, nodeId, basePortId),
			hidden,
		});
	}

	return rows;
}

function resolveOutputPortRows(
	config: PortsConfig | undefined,
): readonly DiagramOutputPortRow[] {
	if (config === undefined) {
		return [];
	}

	const rows: DiagramOutputPortRow[] = [];

	for (const entry of config.outputsConfigs) {
		if (entry === undefined || !isVisibleOutputPort(entry)) {
			continue;
		}

		const portId = String(entry.portId ?? 'unknown');
		const name = entry.name;
		let wireType: string;
		if (entry.fromInput !== undefined) {
			wireType = `from(${entry.fromInput})`;
		} else {
			wireType = String(entry.wireType);
		}

		rows.push({
			portId: toOutputPortId(portId),
			label: (name as string | undefined) ?? portId,
			wireType,
		});
	}

	return rows;
}

function resolveBypassPortRows(
	config: PortsConfig | undefined,
	nodeId: string,
	edges: readonly Edge[],
): readonly DiagramBypassPortRow[] {
	if (config === undefined) {
		return [];
	}

	const bypassPorts: DiagramBypassPortRow[] = [];

	for (const [basePortId, wireType] of Object.entries(config.bypassPorts)) {
		const wireTypeString = String(wireType);

		const maxInputSlot = maxBypassSlot(edges, nodeId, basePortId, 'target');
		const maxOutputSlot = maxBypassSlot(
			edges,
			nodeId,
			basePortId,
			'source',
		);

		const maxSlots = Math.max(maxInputSlot, maxOutputSlot);

		for (let slot = 0; slot <= maxSlots + 1; slot++) {
			const handle = toSlotHandle(basePortId, slot);

			bypassPorts.push({
				handle,
				inputPortId: toInputPortId(handle),
				outputPortId: toOutputPortId(handle),
				label: handle,
				wireType: wireTypeString,
			});
		}
	}

	return bypassPorts;
}

function maxBypassSlot(
	edges: readonly Edge[],
	nodeId: string,
	basePortId: string,
	role: 'source' | 'target',
): number {
	let max = -1;

	for (const edge of edges) {
		const endpointId = role === 'source' ? edge.source : edge.target;
		const port = role === 'source' ? edge.sourcePort : edge.targetPort;

		if (endpointId !== nodeId || port === undefined) {
			continue;
		}

		const { basePortId: base, slotIndex } = splitSlotHandle(
			role === 'source' ? fromOutputPortId(port) : fromInputPortId(port),
		);

		if (base !== basePortId) {
			continue;
		}

		if (slotIndex > max) {
			max = slotIndex;
		}
	}

	return max;
}

export function resolveNodePorts(
	config: PortsConfig | undefined,
	nodeId: string,
	edges: readonly Edge[] = [],
	nodeInputs: Readonly<Record<string, unknown>> = {},
): DiagramNodePorts {
	const bypassPorts = resolveBypassPortRows(config, nodeId, edges);

	return {
		inputPorts: resolveInputPortRows(config, nodeId, edges, nodeInputs),
		outputPorts: resolveOutputPortRows(config),
		bypassPorts,
	};
}
