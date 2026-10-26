import type { InlineConfig } from '@langflower/node-sdk';
import { formatWireType } from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
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
	/** Author-declared port description (tooltip body). */
	readonly description?: string | undefined;
	/** Port meta lines for the tooltip footer (multi mode, required). */
	readonly details?: readonly string[] | undefined;
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
	/** Author-declared port description (tooltip body). */
	readonly description?: string | undefined;
	/** Port meta lines for the tooltip footer. */
	readonly details?: readonly string[] | undefined;
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

const isHidden = (
	value:
		| {
				readonly hidden?: boolean;
		  }
		| undefined,
): boolean => value?.hidden === true;

/** True when the port's inline control is an author-time editor (not a live preview). */
export const isEditableInline = (inline: unknown): boolean => {
	if (inline === undefined || inline === null) {
		return false;
	}

	if (typeof inline === 'string') {
		return !inline.startsWith('preview');
	}

	if (typeof inline !== 'object' || !('type' in inline)) {
		return true;
	}

	const type = inline.type;
	return typeof type === 'string' && !type.startsWith('preview');
};

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

const MULTI_MODE_DETAILS = {
	merge: 'Multi-input · merge: every wired value is forwarded individually as it arrives',
	combine:
		'Multi-input · combine: emits an array of the latest value of every wire',
	zip: 'Multi-input · zip: emits an array once every wire delivered a new value',
} as const;

function inputPortDetails(
	entry: PortInputConfig,
): readonly string[] | undefined {
	const lines: string[] = [];

	if (entry.multi !== undefined) {
		lines.push(MULTI_MODE_DETAILS[entry.multi]);
	}

	if (entry.required === true) {
		lines.push('Required');
	}

	if (entry.dynamic === true) {
		lines.push('Dynamic type: accepts any wire type');
	}

	if (entry.hitl !== undefined) {
		lines.push(`Human input (${entry.hitl.kind}): ${entry.hitl.title}`);
	}

	lines.push(...feedDetails(entry.feed));

	return lines.length > 0 ? lines : undefined;
}

function feedDetails(
	feed: { readonly role?: string; readonly streaming?: boolean } | undefined,
): readonly string[] {
	if (feed?.role === undefined || feed.role === 'none') {
		return [];
	}

	return [
		`Work log: ${feed.role}${feed.streaming === true ? ' (streaming)' : ''}`,
	];
}

function outputPortDetails(
	entry: PortOutputConfig,
): readonly string[] | undefined {
	const lines: string[] = [];

	if (entry.fromInput !== undefined) {
		lines.push(`Passes through input "${String(entry.fromInput)}"`);
	}

	lines.push(...feedDetails(entry.feed));

	if (entry.createCheckpoint === true) {
		lines.push(
			entry.checkpointLabel !== undefined
				? `Saves a checkpoint on every emit: ${entry.checkpointLabel}`
				: 'Saves a checkpoint on every emit',
		);
	}

	if (entry.rewireFrom !== undefined) {
		lines.push(
			`Continues input "${entry.rewireFrom}" when the node is deleted`,
		);
	}

	return lines.length > 0 ? lines : undefined;
}

function inputWireType(config: PortInputConfig): string {
	if (config.dynamic === true) {
		return 'dynamic';
	}

	return formatWireType(config.wireType ?? 'any');
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
					description: entry.description,
					details: inputPortDetails(entry),
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
			description: entry.description,
			details: inputPortDetails(entry),
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
			wireType = formatWireType(entry.wireType);
		}

		rows.push({
			portId: toOutputPortId(portId),
			label: (name as string | undefined) ?? portId,
			wireType,
			description: entry.description,
			details: outputPortDetails(entry),
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
		const wireTypeString = formatWireType(wireType);

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
