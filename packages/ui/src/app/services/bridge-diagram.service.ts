import type { RuntimeEdge } from '@langflower/runtime';
import type {
	PaletteNodeDefinition,
	WorkflowNodePersisted,
} from '@langflower/shared/langflower';
import type { Edge, Node } from 'ng-diagram';
import {
	toInputPortId,
	toOutputPortId,
	toSlotHandle,
} from '../diagram/diagram-port-id.js';
import type { PortsConfig } from '../diagram/resolve-diagram-node-ports.js';
import type { LfNodeData } from '../features/canvas/components/lf-node.component.js';
import {
	PREVIEW_NODE_TYPE,
	previewNodeDefaultSize,
} from '../features/canvas/utils/preview-node-default-size.js';

const emptyPortsConfig: PortsConfig = {
	inputsConfigs: [],
	outputsConfigs: [],
	bypassPorts: {},
};

export const paletteByType = (
	nodes: readonly PaletteNodeDefinition[],
): ReadonlyMap<string, PaletteNodeDefinition> =>
	new Map(nodes.map((node) => [node.type, node]));

/** Static port metadata for a node type from the palette catalog. */
export const portsConfigForType = (
	type: string,
	paletteCatalog: ReadonlyMap<string, PaletteNodeDefinition>,
): PortsConfig => {
	const definition = paletteCatalog.get(type);
	return definition !== undefined ? definition : emptyPortsConfig;
};

/**
 * Diagram size for a persisted node.
 *
 * Width-gated sizing contract (docs/DONE/UI/00): only when
 * `ui.position.width` is set do we emit a fixed `size` and
 * `autoSize: false`. Height-only persistence must not invent a width
 * (legacy default 180 would silently lock mode B).
 * Exception: `common-preview` defaults both axes (320×280) when width is
 * unset so markdown payload cannot autoSize the node wider.
 */
const nodeSize = (
	node: WorkflowNodePersisted,
): { readonly width: number; readonly height: number } | undefined => {
	const width = node.ui.position.width;

	if (width === undefined) {
		return node.type === PREVIEW_NODE_TYPE
			? previewNodeDefaultSize
			: undefined;
	}

	return {
		width,
		height: node.ui.position.height ?? 72,
	};
};

/**
 * Convert a server-originated persisted node to an ng-diagram node.
 *
 * Must ONLY be called when `node` comes directly from a server push (snapshot
 * or delta). Do NOT use this function on nodes that were already converted to
 * diagram format — there is no round-trip conversion.
 *
 * Port rows are NOT precomputed here — `LfNodeComponent` derives them live
 * from the diagram's own edges signal (see `resolveNodePorts` usage there).
 * Only the static `portsConfig` (palette metadata) is carried on `data`.
 */
export const persistedNodeToDiagram = (
	node: WorkflowNodePersisted,
	paletteCatalog: ReadonlyMap<string, PaletteNodeDefinition>,
): Node<LfNodeData> => {
	const size = nodeSize(node);
	const portsConfig = portsConfigForType(node.type, paletteCatalog);
	const widthLocked = size !== undefined;

	return {
		id: node.id,
		type: 'lf-node',
		position: {
			x: node.ui.position.x,
			y: node.ui.position.y,
		},
		...(size !== undefined ? { size } : {}),
		autoSize: !widthLocked,
		resizable: true,
		data: {
			...node,
			portsConfig,
		},
	};
};
/**
 * Convert a server-originated persisted edge to an ng-diagram edge.
 *
 * Must ONLY be called when `edge` comes directly from a server push (snapshot
 * or delta). Do NOT use this function on edges that were already converted to
 * diagram format — there is no round-trip conversion between `RuntimeEdge`
 * and ng-diagram `Edge`.
 */
export const persistedEdgeToDiagram = (edge: RuntimeEdge): Edge => ({
	id: edge.edgeId,
	type: 'lf-edge',
	source: edge.fromNodeId,
	target: edge.toNodeId,
	sourcePort: toOutputPortId(toSlotHandle(...edge.fromPort)),
	targetPort: toInputPortId(toSlotHandle(...edge.toPort)),
	data: {},
});
