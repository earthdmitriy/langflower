import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import type {
	EdgeId,
	NodeId,
	RuntimeEdge,
	RuntimeEditor,
} from '@langflower/runtime';
import type {
	EditorAddEdgeRequestedPayload,
	EditorAddNodeRequestedPayload,
	EditorPasteRequestedPayload,
	EditorUpdateNodeRequestedPayload,
	WorkflowLoadedPayload,
	WorkflowNodePersisted,
} from '@langflower/shared/langflower.js';
import { of } from 'rxjs';
import type { LangflowerSession } from '../session/langflower-session.js';
import type { ResolveNodeDefinition } from './workflow-document.js';
import { prunePersistedInputs } from './workflow-persisted-inputs.js';

export type EditorAddEdgeResult = {
	readonly removed: readonly RuntimeEdge[];
	readonly added: readonly RuntimeEdge[];
};

const emptyAddEdgeResult: EditorAddEdgeResult = {
	removed: [],
	added: [],
};

const persistedEdgeEndpointsMatch = (
	left: Pick<RuntimeEdge, 'fromNodeId' | 'fromPort' | 'toNodeId' | 'toPort'>,
	right: Pick<RuntimeEdge, 'fromNodeId' | 'fromPort' | 'toNodeId' | 'toPort'>,
): boolean =>
	left.fromNodeId === right.fromNodeId &&
	left.fromPort[0] === right.fromPort[0] &&
	left.fromPort[1] === right.fromPort[1] &&
	left.toNodeId === right.toNodeId &&
	left.toPort[0] === right.toPort[0] &&
	left.toPort[1] === right.toPort[1];

const findRuntimeEdgeByEndpoints = (
	editor: RuntimeEditor,
	edgeInput: Omit<RuntimeEdge, 'edgeId'>,
): RuntimeEdge | undefined =>
	editor
		.getEdges()
		.find((edge) => persistedEdgeEndpointsMatch(edge, edgeInput));

const defaultParamsFromDefinition = (
	definition: ReactiveNodeDefinition,
): Readonly<Record<string, unknown>> => {
	const uiSchema = definition.uiSchema as readonly {
		readonly field: string;
		readonly default?: unknown;
	}[];

	return Object.fromEntries(
		uiSchema
			.filter((item) => item.default !== undefined)
			.map((item) => [item.field, item.default]),
	);
};

const hasUpdateNodeFields = (
	payload: EditorUpdateNodeRequestedPayload,
): boolean =>
	payload.position !== undefined ||
	payload.ui !== undefined ||
	payload.params !== undefined ||
	payload.inputs !== undefined;

/**
 * Topology / seed-input fields blocked while `runnerStatus === 'running'`.
 * Panel `params` are session-document only (next-run ctx seeds) and are never
 * gated by this lock — see applyEditorUpdateNode.
 */
const hasGraphLockedBlockedFields = (
	payload: EditorUpdateNodeRequestedPayload,
): boolean =>
	payload.position !== undefined ||
	payload.ui !== undefined ||
	payload.inputs !== undefined;

const patchPersistedNodeUi = (
	node: WorkflowNodePersisted,
	payload: EditorUpdateNodeRequestedPayload,
): WorkflowNodePersisted => ({
	...node,
	ui: {
		...node.ui,
		position: {
			...node.ui.position,
			...(payload.position ?? {}),
			...(payload.ui?.width !== undefined
				? { width: payload.ui.width }
				: {}),
			...(payload.ui?.height !== undefined
				? { height: payload.ui.height }
				: {}),
		},
		...(payload.ui?.label !== undefined ? { label: payload.ui.label } : {}),
	},
});

const normalizeNodeParams = (
	type: string,
	params: Readonly<Record<string, unknown>> | undefined,
	resolveDefinition: ResolveNodeDefinition,
	existing: Pick<WorkflowNodePersisted, 'type' | 'params'>,
): Readonly<Record<string, unknown>> => {
	if (params === undefined) {
		return {};
	}

	const definition = resolveDefinition({
		type: existing.type,
		params: existing.params,
	});

	if (definition === undefined || type !== existing.type) {
		return params;
	}

	const normalized = { ...params };
	const uiSchema = definition.uiSchema as readonly {
		readonly field: string;
		readonly type?: string;
	}[];

	for (const field of uiSchema) {
		if (field.type !== 'number') {
			continue;
		}

		const raw = normalized[field.field];

		if (typeof raw !== 'string') {
			continue;
		}

		const trimmed = raw.trim();
		if (trimmed === '') {
			normalized[field.field] = 0;
			continue;
		}

		const parsed = Number(trimmed);
		normalized[field.field] = Number.isFinite(parsed) ? parsed : 0;
	}

	return normalized;
};

const normalizeNodeInputs = (
	type: string,
	inputs: Readonly<Record<string, unknown>> | undefined,
	resolveDefinition: ResolveNodeDefinition,
	existing: Pick<WorkflowNodePersisted, 'type' | 'params'>,
): Readonly<Record<string, unknown>> => {
	if (inputs === undefined) {
		return {};
	}

	const definition = resolveDefinition({
		type: existing.type,
		params: existing.params,
	});

	if (definition === undefined || type !== existing.type) {
		return inputs;
	}

	const normalized = { ...inputs };

	for (const inputConfig of definition.inputsConfigs) {
		if (typeof inputConfig.portId !== 'string') {
			continue;
		}

		const raw = normalized[inputConfig.portId];

		if (typeof raw !== 'string') {
			continue;
		}

		if (inputConfig.wireType === 'number') {
			const trimmed = raw.trim();
			const parsed = trimmed === '' ? 0 : Number(trimmed);
			normalized[inputConfig.portId] = Number.isFinite(parsed)
				? parsed
				: 0;
		} else if (inputConfig.wireType === 'boolean') {
			normalized[inputConfig.portId] = raw === 'true';
		}
	}

	return prunePersistedInputs(normalized, definition);
};

export const normalizeEditorUpdateNodePayload = (
	payload: EditorUpdateNodeRequestedPayload,
	existing: Pick<WorkflowNodePersisted, 'type' | 'params'>,
	resolveDefinition: ResolveNodeDefinition,
): EditorUpdateNodeRequestedPayload => {
	if (payload.params === undefined && payload.inputs === undefined) {
		return payload;
	}

	return {
		...payload,
		...(payload.params !== undefined
			? {
					params: normalizeNodeParams(
						existing.type,
						payload.params,
						resolveDefinition,
						existing,
					),
				}
			: {}),
		...(payload.inputs !== undefined
			? {
					inputs: normalizeNodeInputs(
						existing.type,
						payload.inputs,
						resolveDefinition,
						existing,
					),
				}
			: {}),
	};
};

const materializeRuntimeNode = (
	projectDir: string,
	node: WorkflowNodePersisted,
	resolveDefinition: ResolveNodeDefinition,
) => {
	const definition = resolveDefinition({
		type: node.type,
		params: node.params,
	});

	if (definition === undefined) {
		return undefined;
	}

	const instance = definition.getInstance();

	// ADR-028: persisted inputs are overrides only. Missing keys get the
	// *current* definition defaultValue (not a baked copy from disk).
	for (const config of definition.inputsConfigs) {
		if (typeof config.portId !== 'string') {
			continue;
		}

		const input = instance.inputs[config.portId];

		if (input === undefined) {
			continue;
		}

		// HITL ports stay inactive until `pushIntoInput` (composer Start /
		// reply). Connecting a persisted Chat Input message here would
		// double-emit when cold-start does startNode + pushIntoInput.
		if (config.hitl !== undefined) {
			continue;
		}

		if (Object.hasOwn(node.inputs, config.portId)) {
			input.connect(of(node.inputs[config.portId]));
			continue;
		}

		if (config.defaultValue === undefined) {
			continue;
		}

		// `connect(of(null))` emits raw `null` and breaks @rx-evo
		// `isSuccess` (reads `.state` on null). Leave null-default ports
		// inactive; they are not part of LLM inventory `combineInputs`.
		if (config.defaultValue === null) {
			continue;
		}

		input.connect(of(config.defaultValue));
	}

	return {
		nodeId: node.id as NodeId,
		inputs: instance.inputs,
		outputs: instance.outputs,
		bypassPorts: instance.bypassPorts,
		...(instance.emitOncePerActivation === true
			? { emitOncePerActivation: true }
			: {}),
		...(instance.stopsRun === true ? { stopsRun: true } : {}),
		...(instance.chatEntry === true ? { chatEntry: true } : {}),
	};
};

type SyncActiveWorkflowTopologyOptions = {
	readonly upsertNodes?: readonly WorkflowNodePersisted[];
};

/**
 * Single-writer for live graph topology.
 * RuntimeEditor is authoritative for which nodes/edges exist; session document
 * keeps persisted payloads (type/params/inputs/ui) keyed by node id.
 * Call after every successful editor topology mutation (and after payload
 * upserts that must stay aligned with the editor).
 */
const syncActiveWorkflowTopologyFromEditor = (
	session: LangflowerSession,
	options: SyncActiveWorkflowTopologyOptions = {},
): void => {
	const active = session.activeWorkflow;

	if (active === null) {
		return;
	}

	const previousById = new Map(
		active.graph.nodes.map((node) => [node.id, node] as const),
	);
	const upsertById = new Map(
		(options.upsertNodes ?? []).map((node) => [node.id, node] as const),
	);

	const nodes = session.runtime.editor
		.getNodes()
		.map((runtimeNode) => {
			const id = runtimeNode.nodeId as string;
			return upsertById.get(id) ?? previousById.get(id);
		})
		.filter((node): node is WorkflowNodePersisted => node !== undefined);

	session.activeWorkflow = {
		...active,
		graph: {
			...active.graph,
			nodes,
			edges: [...session.runtime.editor.getEdges()],
		},
	};
	session.markDirty();
};

export type EditorPasteResult = {
	readonly nodes: readonly WorkflowNodePersisted[];
	readonly edges: readonly RuntimeEdge[];
};

const emptyPasteResult: EditorPasteResult = {
	nodes: [],
	edges: [],
};

/**
 * Composer: resolve defaults → materialize → runtime add → sync session from editor.
 */
export const applyEditorAddNode = (
	session: LangflowerSession,
	projectDir: string,
	payload: EditorAddNodeRequestedPayload,
	resolveDefinition: ResolveNodeDefinition,
): WorkflowNodePersisted[] => {
	if (session.isGraphLocked()) {
		return [];
	}

	// 1. Resolve definition + build persisted node
	const definition = resolveDefinition({
		type: payload.type,
		params: payload.params ?? {},
	});

	if (definition === undefined) {
		return [];
	}

	const persisted: WorkflowNodePersisted = {
		id: crypto.randomUUID(),
		type: payload.type,
		params: {
			...defaultParamsFromDefinition(definition),
			...(payload.params ?? {}),
		},
		inputs: prunePersistedInputs(payload.inputs ?? {}, definition),
		ui: {
			position: payload.position,
			...(payload.label !== undefined ? { label: payload.label } : {}),
		},
	};

	// 2. Materialize runtime node
	const runtimeNode = materializeRuntimeNode(
		projectDir,
		persisted,
		resolveDefinition,
	);

	if (runtimeNode === undefined) {
		return [];
	}

	// 3. Add to runtime editor
	const added = session.runtime.editor.addNode(runtimeNode);

	if (added === false) {
		return [];
	}

	const settledNode =
		added.nodeId === persisted.id
			? persisted
			: { ...persisted, id: added.nodeId };

	// 4. Sync session topology from editor (+ upsert persisted payload)
	syncActiveWorkflowTopologyFromEditor(session, {
		upsertNodes: [settledNode],
	});

	return [settledNode];
};

/**
 * Composer: batch paste nodes then edges with clientId → server id remap.
 * Single `markDirty` when anything lands. Locked graph → empty result.
 */
export const applyEditorPaste = (
	session: LangflowerSession,
	projectDir: string,
	payload: EditorPasteRequestedPayload,
	resolveDefinition: ResolveNodeDefinition,
): EditorPasteResult => {
	if (session.isGraphLocked()) {
		return emptyPasteResult;
	}

	const clientToServerId = new Map<string, NodeId>();
	const addedNodes: WorkflowNodePersisted[] = [];

	for (const node of payload.nodes) {
		const added = applyEditorAddNode(
			session,
			projectDir,
			{
				type: node.type,
				position: {
					x: node.position.x,
					y: node.position.y,
					...(node.position.width !== undefined
						? { width: node.position.width }
						: {}),
					...(node.position.height !== undefined
						? { height: node.position.height }
						: {}),
				},
				...(node.params !== undefined ? { params: node.params } : {}),
				...(node.inputs !== undefined ? { inputs: node.inputs } : {}),
				...(node.label !== undefined ? { label: node.label } : {}),
			},
			resolveDefinition,
		);

		const settled = added[0];

		if (settled === undefined) {
			continue;
		}

		clientToServerId.set(node.clientId, settled.id as NodeId);
		addedNodes.push(settled);
	}

	const addedEdges: RuntimeEdge[] = [];

	for (const edge of payload.edges) {
		const fromNodeId = clientToServerId.get(edge.fromClientId);
		const toNodeId = clientToServerId.get(edge.toClientId);

		if (fromNodeId === undefined || toNodeId === undefined) {
			continue;
		}

		const { added } = applyEditorAddEdge(session, {
			fromNodeId,
			fromPort: edge.fromPort,
			toNodeId,
			toPort: edge.toPort,
		});

		addedEdges.push(...added);
	}

	if (addedNodes.length === 0 && addedEdges.length === 0) {
		return emptyPasteResult;
	}

	// applyEditorAddNode / AddEdge already sync+markDirty per item.
	return { nodes: addedNodes, edges: addedEdges };
};

/**
 * Composer: patch persisted → optional rebind → sync session from editor.
 * Session document owns payload fields (params/inputs/ui); editor owns topology.
 *
 * Panel `params` always patch the session document only — no
 * `bindWorkflowToSessionEditor`. A prior params→full-rebind path returned
 * silent `[]` whenever rebind failed (e.g. `RuntimeEditor.locked` even when
 * session looked idle). Params take effect on the next run via ctx seeds.
 * `inputs` / position / ui stay blocked while `runnerStatus === 'running'`;
 * `inputs` still rebind the runtime mirror when unlocked.
 */
export const applyEditorUpdateNode = (
	session: LangflowerSession,
	projectDir: string,
	payload: EditorUpdateNodeRequestedPayload,
	resolveDefinition: ResolveNodeDefinition,
): WorkflowNodePersisted[] => {
	if (!hasUpdateNodeFields(payload)) {
		return [];
	}

	if (session.isGraphLocked() && hasGraphLockedBlockedFields(payload)) {
		return [];
	}

	const active = session.activeWorkflow;

	if (active === null) {
		return [];
	}

	const existing = active.graph.nodes.find(
		(node) => node.id === payload.nodeId,
	);

	if (existing === undefined) {
		return [];
	}

	const previousWorkflow = active;
	const needsRuntimeRebind = payload.inputs !== undefined;

	// 1. Patch persisted node fields
	let updatedNode = patchPersistedNodeUi(existing, payload);

	if (payload.params !== undefined) {
		updatedNode = {
			...updatedNode,
			params: normalizeNodeParams(
				existing.type,
				payload.params,
				resolveDefinition,
				existing,
			),
		};
	}

	if (payload.inputs !== undefined) {
		updatedNode = {
			...updatedNode,
			inputs: normalizeNodeInputs(
				existing.type,
				payload.inputs,
				resolveDefinition,
				existing,
			),
		};
	}

	// 2. Rebind runtime when inputs changed (rollback on failure)
	if (needsRuntimeRebind) {
		session.activeWorkflow = {
			...active,
			graph: {
				...active.graph,
				nodes: active.graph.nodes.map((node) =>
					node.id === updatedNode.id ? updatedNode : node,
				),
			},
		};

		const bindResult = bindWorkflowToSessionEditor(
			session.runtime.editor,
			projectDir,
			session.activeWorkflow,
			resolveDefinition,
		);

		if (!bindResult.ok) {
			session.activeWorkflow = previousWorkflow;
			return [];
		}
	}

	// 3. Sync topology from editor + upsert persisted payload + dirty
	syncActiveWorkflowTopologyFromEditor(session, {
		upsertNodes: [updatedNode],
	});

	return [updatedNode];
};

/**
 * Composer: try add → else replace; sync session topology from editor.
 */
export const applyEditorAddEdge = (
	session: LangflowerSession,
	payload: EditorAddEdgeRequestedPayload,
): EditorAddEdgeResult => {
	if (session.isGraphLocked()) {
		return emptyAddEdgeResult;
	}

	const edgeInput = {
		fromNodeId: payload.fromNodeId,
		fromPort: [...payload.fromPort] as [string, number],
		toNodeId: payload.toNodeId,
		toPort: [...payload.toPort] as [string, number],
	};

	// Path A: plain add
	const added = session.runtime.editor.addEdge(edgeInput);

	if (added !== false) {
		syncActiveWorkflowTopologyFromEditor(session);
		return { removed: [], added: [added] };
	}

	// Path B: replace occupying edge
	const replaced = session.runtime.editor.replaceEdge(edgeInput);

	if (replaced === false) {
		return emptyAddEdgeResult;
	}

	// Editor already mutated — sync even if endpoint lookup fails.
	syncActiveWorkflowTopologyFromEditor(session);

	const addedRuntime = findRuntimeEdgeByEndpoints(
		session.runtime.editor,
		edgeInput,
	);

	if (addedRuntime === undefined) {
		return { removed: [replaced], added: [] };
	}

	return { removed: [replaced], added: [addedRuntime] };
};

/**
 * Composer: snapshot → runtime remove → sync session topology from editor.
 */
export const applyEditorRemoveEdge = (
	session: LangflowerSession,
	edgeId: EdgeId,
): RuntimeEdge[] => {
	if (session.isGraphLocked()) {
		return [];
	}

	const beforeEdges = session.runtime.editor.getEdges();
	const beforeById = new Map(beforeEdges.map((edge) => [edge.edgeId, edge]));

	if (!beforeById.has(edgeId)) {
		return [];
	}

	// 1. Runtime remove
	session.runtime.editor.removeEdge(edgeId);

	const afterIds = new Set(
		session.runtime.editor.getEdges().map((edge) => edge.edgeId),
	);
	const removedEdgeIds = [...beforeById.keys()].filter(
		(id) => !afterIds.has(id),
	);

	// 2. Sync session edges from editor
	syncActiveWorkflowTopologyFromEditor(session);

	return removedEdgeIds
		.map((id) => beforeById.get(id))
		.filter((edge): edge is RuntimeEdge => edge !== undefined);
};

/**
 * Composer: snapshot → runtime remove → sync session topology from editor.
 */
export const applyEditorRemoveNode = (
	session: LangflowerSession,
	nodeId: NodeId,
): WorkflowNodePersisted[] => {
	if (session.isGraphLocked()) {
		return [];
	}

	const nodeSnapshot = session.activeWorkflow?.graph.nodes.find(
		(node) => node.id === nodeId,
	);

	// 1. Runtime remove
	const removed = session.runtime.editor.removeNode(nodeId);

	if (removed === false) {
		return [];
	}

	// 2. Sync session (drops node + incident edges)
	syncActiveWorkflowTopologyFromEditor(session);

	return nodeSnapshot !== undefined ? [nodeSnapshot] : [];
};

/**
 * Replace live editor instances whose persisted `type` is in `customTypes`.
 * Types missing from the set keep the old instance. Allowed while locked.
 */
export const swapCustomNodesInEditor = (
	session: LangflowerSession,
	projectDir: string,
	resolveDefinition: ResolveNodeDefinition,
	customTypes: ReadonlySet<string>,
): readonly RuntimeEdge[] => {
	const active = session.activeWorkflow;

	if (active === null) {
		return [];
	}

	const persistedById = new Map(
		active.graph.nodes.map((node) => [node.id, node] as const),
	);
	const droppedEdges: RuntimeEdge[] = [];

	for (const runtimeNode of session.runtime.editor.getNodes()) {
		const persisted = persistedById.get(runtimeNode.nodeId);

		if (persisted === undefined || !customTypes.has(persisted.type)) {
			continue;
		}

		const next = materializeRuntimeNode(
			projectDir,
			persisted,
			resolveDefinition,
		);

		if (next === undefined) {
			continue;
		}

		const { nodeId: _nodeId, ...rest } = next;
		const swapped = session.runtime.editor.swapNode(
			runtimeNode.nodeId,
			rest,
		);

		if (swapped === false) {
			continue;
		}

		droppedEdges.push(...swapped.droppedEdges);
	}

	if (droppedEdges.length > 0) {
		syncActiveWorkflowTopologyFromEditor(session);
	}

	return droppedEdges;
};

export type BindWorkflowResult =
	| {
			readonly ok: true;
			readonly droppedNodeIds: readonly string[];
			readonly droppedEdgeIds: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly code: string;
			readonly message: string;
	  };

/**
 * Load path: document → editor (activate/rename/rebind).
 * Unsupported nodes and invalid edges are skipped (graceful degradation);
 * only a locked editor hard-fails. Live edits go the other way via
 * syncActiveWorkflowTopologyFromEditor.
 */
export const bindWorkflowToSessionEditor = (
	editor: RuntimeEditor,
	projectDir: string,
	document: WorkflowLoadedPayload,
	resolveDefinition: ResolveNodeDefinition,
): BindWorkflowResult => {
	for (const node of editor.getNodes()) {
		editor.removeNode(node.nodeId);
	}

	const droppedNodeIds: string[] = [];
	const droppedEdgeIds: string[] = [];

	for (const node of document.graph.nodes) {
		const runtimeNode = materializeRuntimeNode(
			projectDir,
			node,
			resolveDefinition,
		);

		if (runtimeNode === undefined) {
			droppedNodeIds.push(node.id);
			continue;
		}

		const added = editor.addNode(runtimeNode);

		if (added === false) {
			return {
				ok: false,
				code: 'GRAPH_LOCKED',
				message: `Cannot bind node ${node.id}`,
			};
		}
	}

	for (const edge of document.graph.edges) {
		const added = editor.addEdge(
			{
				fromNodeId: edge.fromNodeId,
				fromPort: edge.fromPort,
				toNodeId: edge.toNodeId,
				toPort: edge.toPort,
			},
			{ edgeId: edge.edgeId },
		);

		if (added === false) {
			droppedEdgeIds.push(edge.edgeId);
		}
	}

	return { ok: true, droppedNodeIds, droppedEdgeIds };
};
