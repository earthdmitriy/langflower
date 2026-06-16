import {
	getBypassConnection,
	isBypassPort,
	materializeBypassNodeOnAdd,
	materializeBypassSlot,
} from './bypass-ports.js';
import { edgeKey, SlotKey, slotKey } from './port-meta.js';
import {
	GraphCluster,
	detectGraphClusters,
	resolveClusterForNode,
} from './runtime-helpers.js';
import {
	RuntimeEdge,
	RuntimeEditorApi,
	RuntimeNode,
	type EdgeId,
	type NodeId,
} from './types.js';

export class RuntimeEditor implements RuntimeEditorApi {
	/** Node ID -> node definition. */
	private readonly nodes = new Map<NodeId, RuntimeNode>();
	/** Edge ID -> edge definition. */
	private readonly edges = new Map<EdgeId, RuntimeEdge>();

	private nodeIdCounter = 0;
	private disposed = false;
	private locked = false;

	allClusters: readonly GraphCluster[] = [];

	addNode(
		node: Omit<RuntimeNode, 'nodeId'> &
			Partial<Pick<RuntimeNode, 'nodeId'>>,
	): RuntimeNode | false {
		if (this.disposed) return false;

		if (this.locked) {
			return false;
		}

		if (node.nodeId !== undefined) {
			// node being added from serizlized workflow
			if (this.nodes.has(node.nodeId)) {
				return false;
			}

			const runtimeNode = materializeBypassNodeOnAdd(node as RuntimeNode);
			this.nodes.set(node.nodeId, runtimeNode);
			this.refreshClusters();

			return runtimeNode;
		} else {
			let nodeId: NodeId;

			do {
				this.nodeIdCounter += 1;
				nodeId = `node-${this.nodeIdCounter}` as NodeId;
			} while (this.nodes.has(nodeId));

			const runtimeNode = materializeBypassNodeOnAdd({
				...node,
				nodeId,
			} as RuntimeNode);
			this.nodes.set(nodeId, runtimeNode);
			this.refreshClusters();

			return runtimeNode;
		}
	}

	/**
	 * Composer: prepare (bypass materialize) → occupancy check → commit+refresh.
	 */
	addEdge(
		edgeInput: Omit<RuntimeEdge, 'edgeId'>,
		options?: { readonly edgeId?: EdgeId },
	): RuntimeEdge | false {
		if (this.disposed || this.locked) {
			return false;
		}

		if (this.hasDuplicateEdge(edgeInput)) {
			return false;
		}

		// 1. Prepare insert (may materialize bypass ports)
		const prepared = this.prepareEdgeInsert(edgeInput);

		if (prepared === false) {
			return false;
		}

		// 2. Reject if target port already occupied
		const [toPortId, toSlotIndex] = edgeInput.toPort;

		if (
			this.findEdgeOnTargetPort(edgeInput.toNodeId, toPortId, toSlotIndex)
		) {
			prepared.rollbackBypassMaterialization();
			return false;
		}

		// 3. Commit edge + refresh clusters
		return this.commitEdgeInsert(edgeInput, options?.edgeId);
	}

	/**
	 * Composer: find occupying → prepare → swap → cleanup/rollback → refresh.
	 */
	replaceEdge(edgeInput: Omit<RuntimeEdge, 'edgeId'>): RuntimeEdge | false {
		if (this.disposed || this.locked) {
			return false;
		}

		if (this.hasDuplicateEdge(edgeInput)) {
			return false;
		}

		// 1. Find occupying edge on target port
		const [toPortId, toSlotIndex] = edgeInput.toPort;
		const occupying = this.findEdgeOnTargetPort(
			edgeInput.toNodeId,
			toPortId,
			toSlotIndex,
		);

		if (occupying === undefined) {
			return false;
		}

		// 2. Prepare insert
		const prepared = this.prepareEdgeInsert(edgeInput);

		if (prepared === false) {
			return false;
		}

		const { rollbackBypassMaterialization } = prepared;

		// 3. Swap edges
		this.edges.delete(occupying.edgeId);

		const edgeId = crypto.randomUUID() as EdgeId;
		const edge: RuntimeEdge = { edgeId, ...edgeInput };
		this.edges.set(edgeId, edge);

		// 4. Validate; rollback on prune failure
		const pruned = this.cleanupInvalidEdges();

		if (pruned.length > 0) {
			for (const prunedEdge of pruned) {
				this.edges.set(prunedEdge.edgeId, prunedEdge);
			}

			this.edges.delete(edgeId);
			this.edges.set(occupying.edgeId, occupying);
			rollbackBypassMaterialization();
			this.refreshClusters();

			return false;
		}

		// 5. Refresh clusters
		this.refreshClusters();

		return occupying;
	}

	removeNode(nodeId: NodeId): RuntimeNode | false {
		if (this.disposed) {
			return false;
		}

		if (this.locked) {
			return false;
		}

		const node = this.nodes.get(nodeId);

		if (node === undefined) {
			return false;
		}

		this.nodes.delete(nodeId);

		for (const [edgeId, edge] of this.edges.entries()) {
			if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
				this.edges.delete(edgeId);
			}
		}

		this.cleanupInvalidEdges();
		this.refreshClusters();

		return node;
	}

	removeEdge(edgeId: EdgeId): RuntimeNode[] {
		if (this.disposed) {
			return [];
		}

		if (this.locked) {
			return [];
		}

		const edge = this.edges.get(edgeId);

		if (edge === undefined) {
			return [];
		}

		const affectedNodeIds = new Set<NodeId>([
			edge.fromNodeId,
			edge.toNodeId,
		]);
		this.edges.delete(edgeId);

		for (const removedEdge of this.cleanupInvalidEdges()) {
			affectedNodeIds.add(removedEdge.fromNodeId);
			affectedNodeIds.add(removedEdge.toNodeId);
		}

		this.refreshClusters();

		return [...affectedNodeIds]
			.map((nodeId) => this.nodes.get(nodeId))
			.filter((node): node is RuntimeNode => node !== undefined);
	}

	getNode(nodeId: NodeId): RuntimeNode | false {
		return this.nodes.get(nodeId) ?? false;
	}

	getEdge(edgeId: EdgeId): RuntimeEdge | false {
		return this.edges.get(edgeId) ?? false;
	}

	getNodes(): RuntimeNode[] {
		return [...this.nodes.values()];
	}

	getEdges(): RuntimeEdge[] {
		return [...this.edges.values()];
	}

	getAll(): { nodes: RuntimeNode[]; edges: RuntimeEdge[] } {
		return {
			nodes: [...this.nodes.values()],
			edges: [...this.edges.values()],
		};
	}

	getClusterByNodeId(nodeId: NodeId): GraphCluster {
		if (!this.nodes.has(nodeId)) {
			throw new Error(`Node ${nodeId} not found`);
		}

		return resolveClusterForNode(this.allClusters, nodeId);
	}

	setLocked(locked: boolean): void {
		this.locked = locked;
	}

	dispose(): void {
		this.disposed = true;
	}

	private refreshClusters(): void {
		this.allClusters = detectGraphClusters(this.nodes.keys(), [
			...this.edges.values(),
		]);
	}

	private hasDuplicateEdge(edgeInput: Omit<RuntimeEdge, 'edgeId'>): boolean {
		const key = edgeKey(edgeInput);

		for (const existing of this.edges.values()) {
			if (edgeKey(existing) === key) {
				return true;
			}
		}

		return false;
	}

	private findEdgeOnTargetPort(
		toNodeId: NodeId,
		toPortId: string,
		toSlotIndex: number,
	): RuntimeEdge | undefined {
		for (const existing of this.edges.values()) {
			if (
				existing.toNodeId === toNodeId &&
				existing.toPort[0] === toPortId &&
				existing.toPort[1] === toSlotIndex
			) {
				return existing;
			}
		}

		return undefined;
	}

	private prepareEdgeInsert(
		edgeInput: Omit<RuntimeEdge, 'edgeId'>,
	): { readonly rollbackBypassMaterialization: () => void } | false {
		const originalFromNode = this.nodes.get(edgeInput.fromNodeId);
		const originalToNode = this.nodes.get(edgeInput.toNodeId);

		if (originalFromNode === undefined || originalToNode === undefined) {
			return false;
		}

		const [fromPortId, fromSlotIndex] = edgeInput.fromPort;
		const [toPortId, toSlotIndex] = edgeInput.toPort;

		let fromNode = originalFromNode;
		let toNode = originalToNode;

		// Materialize bypass slots if needed
		if (isBypassPort(originalFromNode, fromPortId)) {
			fromNode = materializeBypassSlot(
				originalFromNode,
				fromPortId,
				fromSlotIndex,
			);
		}

		if (isBypassPort(originalToNode, toPortId)) {
			toNode = materializeBypassSlot(
				originalToNode,
				toPortId,
				toSlotIndex,
			);
		}

		this.nodes.set(fromNode.nodeId, fromNode);
		this.nodes.set(toNode.nodeId, toNode);

		const rollbackBypassMaterialization = () => {
			this.nodes.set(originalFromNode.nodeId, originalFromNode);
			this.nodes.set(originalToNode.nodeId, originalToNode);
		};

		// Validate output exists
		if (isBypassPort(fromNode, fromPortId)) {
			const connection = getBypassConnection(
				fromNode,
				fromPortId,
				fromSlotIndex,
			);
			if (connection === undefined) {
				rollbackBypassMaterialization();
				return false;
			}
		} else if (fromNode.outputs[fromPortId] === undefined) {
			rollbackBypassMaterialization();
			return false;
		}

		// Validate input exists
		if (isBypassPort(toNode, toPortId)) {
			const connection = getBypassConnection(
				toNode,
				toPortId,
				toSlotIndex,
			);
			if (connection === undefined) {
				rollbackBypassMaterialization();
				return false;
			}
		} else {
			const input = toNode.inputs[toPortId];

			if (input === undefined) {
				rollbackBypassMaterialization();
				return false;
			}

			const inputMeta = input.meta;

			if (inputMeta.portId !== toPortId) {
				rollbackBypassMaterialization();
				return false;
			}

			if (inputMeta.mode === 'single' && toSlotIndex !== 0) {
				rollbackBypassMaterialization();
				return false;
			}
		}

		if (!this.isEdgeWireCompatible(edgeInput)) {
			rollbackBypassMaterialization();
			return false;
		}

		return { rollbackBypassMaterialization };
	}

	private commitEdgeInsert(
		edgeInput: Omit<RuntimeEdge, 'edgeId'>,
		edgeId?: EdgeId,
	): RuntimeEdge | false {
		const resolvedId = edgeId ?? (crypto.randomUUID() as EdgeId);

		if (this.edges.has(resolvedId)) {
			return false;
		}

		const edge: RuntimeEdge = { edgeId: resolvedId, ...edgeInput };
		this.edges.set(resolvedId, edge);
		this.refreshClusters();

		return edge;
	}

	private isEdgeWireCompatible(edge: Omit<RuntimeEdge, 'edgeId'>): boolean {
		const [fromPortId, fromSlotIndex] = edge.fromPort;
		const [toPortId, toSlotIndex] = edge.toPort;
		const fromNode = this.nodes.get(edge.fromNodeId);
		const toNode = this.nodes.get(edge.toNodeId);

		if (fromNode === undefined || toNode === undefined) {
			return false;
		}

		const output = isBypassPort(fromNode, fromPortId)
			? getBypassConnection(fromNode, fromPortId, fromSlotIndex)
			: fromNode.outputs[fromPortId];

		const input = isBypassPort(toNode, toPortId)
			? getBypassConnection(toNode, toPortId, toSlotIndex)
			: toNode.inputs[toPortId];

		if (output === undefined || input === undefined) {
			return false;
		}

		const outputMeta = output.meta;
		const inputMeta = input.meta;

		if (outputMeta.portId !== fromPortId || inputMeta.portId !== toPortId) {
			return false;
		}

		const sourceWireType = this.resolveOutputEffectiveWireType(
			edge.fromNodeId,
			fromPortId,
			fromSlotIndex,
			new Set(),
		);

		if (sourceWireType === undefined) {
			return false;
		}

		if (sourceWireType === 'any' || inputMeta.wireType === 'any') {
			return true;
		}

		if (inputMeta.wireType !== 'dynamic') {
			return sourceWireType === inputMeta.wireType;
		}

		const pinnedWireType = this.resolveInputPinnedWireType(
			edge.toNodeId,
			toPortId,
			new Set(),
			isBypassPort(toNode, toPortId) ? toSlotIndex : undefined,
		);

		return (
			pinnedWireType === undefined || pinnedWireType === sourceWireType
		);
	}

	private resolveOutputEffectiveWireType(
		nodeId: NodeId,
		portId: string | symbol,
		slotIndex: number,
		visitedOutputKeys: Set<SlotKey>,
	): string | symbol | undefined {
		const outKey = slotKey(nodeId, portId, slotIndex);

		if (visitedOutputKeys.has(outKey)) {
			return undefined;
		}

		const node = this.nodes.get(nodeId);

		if (node === undefined) {
			return undefined;
		}

		// Bypass outputs: resolve from the edge feeding into this slot
		if (typeof portId === 'string' && isBypassPort(node, portId)) {
			const connection = getBypassConnection(
				node,
				portId as string,
				slotIndex,
			);

			if (connection === undefined) {
				return undefined;
			}

			visitedOutputKeys.add(outKey);

			try {
				// Find edge feeding into this bypass slot
				for (const edge of this.edges.values()) {
					if (
						edge.toNodeId !== nodeId ||
						edge.toPort[0] !== portId ||
						edge.toPort[1] !== slotIndex
					) {
						continue;
					}

					const wireType = this.resolveOutputEffectiveWireType(
						edge.fromNodeId,
						edge.fromPort[0],
						edge.fromPort[1],
						visitedOutputKeys,
					);

					if (wireType !== undefined) {
						return wireType;
					}
				}

				// No upstream edge — fall back to the static wire type
				return connection.meta.wireType !== 'dynamic'
					? connection.meta.wireType
					: undefined;
			} finally {
				visitedOutputKeys.delete(outKey);
			}
		}

		const output = node.outputs[portId as string];

		if (output === undefined) {
			return undefined;
		}

		visitedOutputKeys.add(outKey);

		try {
			const outputMeta = output.meta;

			if (outputMeta.portId !== portId) {
				return undefined;
			}

			if (outputMeta.wireType !== 'dynamic') {
				return outputMeta.wireType;
			}

			if (outputMeta.fromInput === undefined) {
				return undefined;
			}

			return this.resolveInputPinnedWireType(
				nodeId,
				outputMeta.fromInput,
				visitedOutputKeys,
			);
		} finally {
			visitedOutputKeys.delete(outKey);
		}
	}

	private resolveInputPinnedWireType(
		nodeId: NodeId,
		portId: string | symbol,
		visitedOutputKeys: Set<SlotKey>,
		slotIndex?: number,
	): string | symbol | undefined {
		const input = this.nodes.get(nodeId)?.inputs[portId];

		if (input === undefined) {
			return undefined;
		}

		const inputMeta = input.meta;

		if (inputMeta.portId !== portId) {
			return undefined;
		}

		for (const edge of this.edges.values()) {
			if (edge.toNodeId !== nodeId || edge.toPort[0] !== portId) {
				continue;
			}

			if (slotIndex !== undefined && edge.toPort[1] !== slotIndex) {
				continue;
			}

			const wireType = this.resolveOutputEffectiveWireType(
				edge.fromNodeId,
				edge.fromPort[0],
				edge.fromPort[1],
				visitedOutputKeys,
			);

			if (wireType !== undefined) {
				return wireType;
			}
		}

		// Static input ports declare their wire type without an upstream edge —
		// needed when binding persisted graphs where outbound passthrough edges
		// appear before inbound edges (e.g. preview → finish before delay → preview).
		if (inputMeta.wireType !== 'dynamic') {
			return inputMeta.wireType;
		}

		return undefined;
	}

	private cleanupInvalidEdges(): RuntimeEdge[] {
		const removed: RuntimeEdge[] = [];
		let removedEdge = true;

		while (removedEdge) {
			removedEdge = false;

			for (const [edgeId, edge] of [...this.edges.entries()]) {
				if (!this.isEdgeWireCompatible(edge)) {
					this.edges.delete(edgeId);
					removed.push(edge);
					removedEdge = true;
				}
			}
		}

		return removed;
	}
}
