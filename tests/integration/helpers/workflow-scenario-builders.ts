import type { RuntimeEdge } from '@langflower/runtime';
import type {
	EditorAddNodeRequestedPayload,
	WorkflowMetadata,
	WorkflowNodePersisted,
	WorkflowNodeUiState,
	WorkflowSavePayload,
} from '@langflower/shared/langflower.js';

const BASE_TIME = '2026-06-16T00:00:00.000Z';

export const scenarioMetadata = (
	name: string,
	description?: string,
): WorkflowMetadata => {
	return {
		name,
		...(description !== undefined ? { description } : {}),
		createdAt: BASE_TIME,
		updatedAt: BASE_TIME,
	};
};

export const ui = (
	x: number,
	y: number,
	label?: string,
	extra?: Partial<WorkflowNodeUiState>,
): WorkflowNodeUiState => {
	return {
		position: { x, y },
		...(label !== undefined ? { label } : {}),
		...extra,
	};
};

export const stringNodeAddPayload = (
	value: string,
	position: { readonly x: number; readonly y: number },
	label = 'String',
): EditorAddNodeRequestedPayload => {
	return {
		type: 'common-string',
		position,
		inputs: { value },
		...(label !== undefined ? { label } : {}),
	};
};

export const previewNodeAddPayload = (
	position: { readonly x: number; readonly y: number },
	label = 'Preview',
): EditorAddNodeRequestedPayload => {
	return {
		type: 'common-preview',
		position,
		...(label !== undefined ? { label } : {}),
	};
};

export const stringNode = (
	id: string,
	value: string,
	position: { readonly x: number; readonly y: number },
	label = 'String',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-string',
		params: {},
		inputs: { value },
		ui: ui(position.x, position.y, label),
	};
};

export const previewNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Preview',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-preview',
		params: {},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const finishNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Finish',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-finish',
		params: {},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const delayNode = (
	id: string,
	delayMs: number,
	position: { readonly x: number; readonly y: number },
	label = 'Delay',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-delay',
		params: {},
		inputs: { delay: delayMs },
		ui: ui(position.x, position.y, label),
	};
};

export const checkpointNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Checkpoint',
	checkpointLabel?: string,
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-checkpoint',
		params: {},
		inputs: {
			...(checkpointLabel !== undefined
				? { label: checkpointLabel }
				: {}),
		},
		ui: ui(position.x, position.y, label),
	};
};

export const booleanNode = (
	id: string,
	value: boolean,
	position: { readonly x: number; readonly y: number },
	label = 'Boolean',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-boolean',
		params: {},
		inputs: { value },
		ui: ui(position.x, position.y, label),
	};
};

export const numberNode = (
	id: string,
	value: number,
	position: { readonly x: number; readonly y: number },
	label = 'Number',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-number',
		params: {},
		inputs: { value },
		ui: ui(position.x, position.y, label),
	};
};

export const compareNode = (
	id: string,
	op: string,
	position: { readonly x: number; readonly y: number },
	label = 'Compare',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-compare',
		params: { op },
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const assertNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	message = 'Assertion failed',
	label = 'Assert',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-assert',
		params: {},
		inputs: { message },
		ui: ui(position.x, position.y, label),
	};
};

export const ifNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'IF',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-if',
		params: {},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const loopNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Loop',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-loop',
		params: {},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const subAgentNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Sub-Agent',
	params: {
		readonly name?: string;
		readonly description?: string;
		readonly skillIds?: readonly string[];
		readonly rolePreset?: string;
		readonly providerId?: string;
		readonly model?: string;
		readonly maxIterations?: number;
		readonly scriptedToolTurns?: readonly unknown[];
	} = {},
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-sub-agent',
		params: {
			...(params.name !== undefined ? { name: params.name } : {}),
			...(params.description !== undefined
				? { description: params.description }
				: {}),
			...(params.skillIds !== undefined
				? { skillIds: [...params.skillIds] }
				: {}),
			...(params.rolePreset !== undefined
				? { rolePreset: params.rolePreset }
				: {}),
			...(params.providerId !== undefined
				? { providerId: params.providerId }
				: {}),
			...(params.model !== undefined ? { model: params.model } : {}),
			...(params.maxIterations !== undefined
				? { maxIterations: params.maxIterations }
				: {}),
			...(params.scriptedToolTurns !== undefined
				? { scriptedToolTurns: params.scriptedToolTurns }
				: {}),
		},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const concatNode = (
	id: string,
	separator: string,
	position: { readonly x: number; readonly y: number },
	label = 'Concat',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-concat',
		params: {},
		inputs: { separator },
		ui: ui(position.x, position.y, label),
	};
};

export const mergeNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Merge',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-merge',
		params: {},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const fakeLlmNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	params: {
		readonly tokenDelayMs?: number;
		readonly rolePreset?: string;
		readonly enabledToolIds?: readonly string[];
		readonly maxIterations?: number;
		readonly maxFeedbackTurns?: number;
		readonly scriptedToolTurns?: readonly unknown[];
		readonly providerId?: string;
		readonly model?: string;
	} = {},
	label = 'Fake LLM',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-fake-llm',
		params: {
			tokenDelayMs: params.tokenDelayMs ?? 0,
			...(params.rolePreset !== undefined
				? { rolePreset: params.rolePreset }
				: {}),
			...(params.enabledToolIds !== undefined
				? { enabledToolIds: [...params.enabledToolIds] }
				: {}),
			...(params.maxIterations !== undefined
				? { maxIterations: params.maxIterations }
				: {}),
			...(params.maxFeedbackTurns !== undefined
				? { maxFeedbackTurns: params.maxFeedbackTurns }
				: {}),
			...(params.scriptedToolTurns !== undefined
				? { scriptedToolTurns: params.scriptedToolTurns }
				: {}),
			...(params.providerId !== undefined
				? { providerId: params.providerId }
				: {}),
			...(params.model !== undefined ? { model: params.model } : {}),
		},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const memoryToolsNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Memory Tools',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-memory-tools',
		params: {},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const chatInputNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Chat Input',
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-chat-input',
		params: {},
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

export const hitlReviewGateNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Review',
	params: Readonly<Record<string, unknown>> = {},
): WorkflowNodePersisted => {
	return {
		id,
		type: 'common-hitl-review-gate',
		params,
		inputs: {},
		ui: ui(position.x, position.y, label),
	};
};

/** Splits an ergonomic `base` or `base@slot` handle into a `[portId, slotIndex]` tuple. */
function splitHandle(handle: string): [string, number] {
	const at = handle.lastIndexOf('@');
	const slot = at > 0 ? Number(handle.slice(at + 1)) : 0;

	return at > 0 && Number.isInteger(slot)
		? [handle.slice(0, at), slot]
		: [handle, 0];
}

export const edge = (
	id: string,
	source: string,
	sourceHandle: string,
	target: string,
	targetHandle: string,
): RuntimeEdge => {
	return {
		edgeId: id,
		fromNodeId: source,
		fromPort: splitHandle(sourceHandle),
		toNodeId: target,
		toPort: splitHandle(targetHandle),
	};
};

const EMPTY_VIEWPORT = {
	x: 0,
	y: 0,
	scale: 1,
} as const;

export const savePayload = (
	workflowId: string,
	metadata: WorkflowMetadata,
	nodes: readonly WorkflowNodePersisted[],
	edges: readonly RuntimeEdge[],
): WorkflowSavePayload => {
	return {
		workflowId,
		metadata,
		graph: { viewport: EMPTY_VIEWPORT, nodes, edges },
	};
};
