import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import { defineNode } from '@langflower/node-sdk';
import type { EdgeId, NodeId, RuntimeEdge } from '@langflower/runtime';
import type {
	EditorAddEdgeRequestedPayload,
	EditorUpdateNodeRequestedPayload,
	WorkflowLoadedPayload,
	WorkflowNodePersisted,
} from '@langflower/shared/langflower.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import {
	applyEditorAddEdge,
	applyEditorAddNode,
	applyEditorPaste,
	applyEditorRemoveEdge,
	applyEditorRemoveNode,
	applyEditorUpdateNode,
	bindWorkflowToSessionEditor,
	normalizeEditorUpdateNodePayload,
	swapCustomNodesInEditor,
} from './apply-editor-mutation.js';
import type { ResolveNodeDefinition } from './workflow-document.js';

const resolveDefinition: ResolveNodeDefinition = (node) => {
	const definition = resolveWorkflowNodeDefinition({
		type: node.type,
	});

	if (definition === undefined) {
		return undefined;
	}

	return definition;
};

const stringNode = (id: string, value = 'hello'): WorkflowNodePersisted => ({
	id,
	type: 'common-string',
	params: {},
	inputs: { value },
	ui: { position: { x: 0, y: 0 } },
});

const previewNode = (id: string): WorkflowNodePersisted => ({
	id,
	type: 'common-preview',
	params: {},
	inputs: {},
	ui: { position: { x: 240, y: 0 } },
});

const numberNode = (id: string): WorkflowNodePersisted => ({
	id,
	type: 'common-number',
	params: {},
	inputs: { value: 0 },
	ui: { position: { x: 480, y: 0 } },
});

const delayNode = (id: string): WorkflowNodePersisted => ({
	id,
	type: 'common-delay',
	params: {},
	inputs: { delay: 0 },
	ui: { position: { x: 480, y: 0 } },
});

const seedActiveWorkflow = (
	session: LangflowerSession,
	nodes: readonly WorkflowNodePersisted[],
	edges: readonly RuntimeEdge[] = [],
	resolve: ResolveNodeDefinition = resolveDefinition,
): void => {
	const document: WorkflowLoadedPayload = {
		workflowId: 'test',
		metadata: {
			name: 'test',
			createdAt: '2026-06-25T00:00:00.000Z',
			updatedAt: '2026-06-25T00:00:00.000Z',
		},
		graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes, edges },
	};

	session.activeWorkflow = document;
	session.activeWorkflowId = document.workflowId;

	const bindResult = bindWorkflowToSessionEditor(
		session.runtime.editor,
		projectDir,
		document,
		resolve,
	);

	if (!bindResult.ok) {
		throw new Error(bindResult.message);
	}
};

/** Invariant: session document topology ids match RuntimeEditor after mutations. */
const expectEditorSessionTopologyMatch = (session: LangflowerSession): void => {
	const editorNodeIds = [
		...session.runtime.editor.getNodes().map((node) => node.nodeId),
	].sort();
	const sessionNodeIds = [
		...(session.activeWorkflow?.graph.nodes.map((node) => node.id) ?? []),
	].sort();
	expect(sessionNodeIds).toEqual(editorNodeIds);

	const editorEdgeIds = [
		...session.runtime.editor.getEdges().map((edge) => edge.edgeId),
	].sort();
	const sessionEdgeIds = [
		...(session.activeWorkflow?.graph.edges.map((edge) => edge.edgeId) ??
			[]),
	].sort();
	expect(sessionEdgeIds).toEqual(editorEdgeIds);
};

let projectDir: string;

describe('applyEditorAddNode', () => {
	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-editor-add-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns added node on success', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);

		const result = applyEditorAddNode(
			session,
			projectDir,
			{
				type: 'common-string',
				position: { x: 0, y: 0 },
				inputs: { value: 'hello' },
			},
			resolveDefinition,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.type).toBe('common-string');
		expect(result[0]?.inputs).toEqual({ value: 'hello' });
		expect(
			session.runtime.editor.getNode(result[0]!.id as NodeId),
		).not.toBe(false);
	});

	it('persists empty inputs when omitted (defaults come from definition on load)', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);

		const result = applyEditorAddNode(
			session,
			projectDir,
			{
				type: 'common-string',
				position: { x: 0, y: 0 },
			},
			resolveDefinition,
		);

		expect(result[0]?.inputs).toEqual({});
	});

	it('does not persist input values that match definition defaults', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);

		const result = applyEditorAddNode(
			session,
			projectDir,
			{
				type: 'common-string',
				position: { x: 0, y: 0 },
				inputs: { value: '' },
			},
			resolveDefinition,
		);

		expect(result[0]?.inputs).toEqual({});
	});

	it('returns empty array when graph is locked', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);
		session.runnerStatus = 'running';

		const result = applyEditorAddNode(
			session,
			projectDir,
			{
				type: 'common-string',
				position: { x: 0, y: 0 },
			},
			resolveDefinition,
		);

		expect(result).toEqual([]);
	});

	it('returns empty array for unknown node type', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);

		const result = applyEditorAddNode(
			session,
			projectDir,
			{
				type: 'unknown-type',
				position: { x: 0, y: 0 },
			},
			resolveDefinition,
		);

		expect(result).toEqual([]);
	});
});

describe('applyEditorPaste', () => {
	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-editor-paste-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('remaps clientIds and pastes nodes with edges and size', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);

		const result = applyEditorPaste(
			session,
			projectDir,
			{
				nodes: [
					{
						clientId: 'tmp-src',
						type: 'common-string',
						position: { x: 10, y: 20, width: 200, height: 80 },
						inputs: { value: 'pasted' },
						label: 'Src',
					},
					{
						clientId: 'tmp-sink',
						type: 'common-preview',
						position: { x: 240, y: 20 },
					},
				],
				edges: [
					{
						fromClientId: 'tmp-src',
						fromPort: ['value', 0],
						toClientId: 'tmp-sink',
						toPort: ['text', 0],
					},
				],
			},
			resolveDefinition,
		);

		expect(result.nodes).toHaveLength(2);
		expect(result.edges).toHaveLength(1);
		expect(result.nodes[0]?.ui.position).toEqual({
			x: 10,
			y: 20,
			width: 200,
			height: 80,
		});
		expect(result.nodes[0]?.ui.label).toBe('Src');
		expect(result.edges[0]?.fromNodeId).toBe(result.nodes[0]?.id);
		expect(result.edges[0]?.toNodeId).toBe(result.nodes[1]?.id);
		expect(session.currentStatus).toBe('dirty');
	});

	it('returns empty when graph is locked', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);
		session.runnerStatus = 'running';

		const result = applyEditorPaste(
			session,
			projectDir,
			{
				nodes: [
					{
						clientId: 'tmp',
						type: 'common-string',
						position: { x: 0, y: 0 },
					},
				],
				edges: [],
			},
			resolveDefinition,
		);

		expect(result).toEqual({ nodes: [], edges: [] });
	});
});

describe('applyEditorAddEdge', () => {
	let session: LangflowerSession;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-editor-edge-'),
		);
		session = new LangflowerSession();
		seedActiveWorkflow(session, [
			stringNode('string-1'),
			previewNode('preview-1'),
		]);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns persisted edge on success', () => {
		const payload: EditorAddEdgeRequestedPayload = {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		};

		const result = applyEditorAddEdge(session, payload);

		expect(result.added).toHaveLength(1);
		expect(result.removed).toEqual([]);
		expect(result.added[0]?.fromNodeId).toBe('string-1');
		expect(result.added[0]?.toNodeId).toBe('preview-1');
	});

	it('returns empty result when graph is locked', () => {
		session.runnerStatus = 'running';

		const result = applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});

		expect(result).toEqual({ removed: [], added: [] });
	});

	it('replaces edge on occupied target port', () => {
		seedActiveWorkflow(session, [
			stringNode('string-1'),
			stringNode('string-2'),
			previewNode('preview-1'),
		]);

		const first = applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});

		const result = applyEditorAddEdge(session, {
			fromNodeId: 'string-2' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});

		expect(result.removed).toEqual([first.added[0]]);
		expect(result.added).toHaveLength(1);
		expect(result.added[0]?.fromNodeId).toBe('string-2');
		expect(session.runtime.editor.getEdges()).toHaveLength(1);
		expect(session.runtime.editor.getEdges()[0]?.fromNodeId).toBe(
			'string-2',
		);
	});

	it('replaces incoming edge without removing downstream passthrough wire', () => {
		seedActiveWorkflow(session, [
			stringNode('string-1'),
			stringNode('string-2'),
			previewNode('preview-1'),
			delayNode('delay-1'),
		]);

		const incoming = applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});
		const downstream = applyEditorAddEdge(session, {
			fromNodeId: 'preview-1' as NodeId,
			fromPort: ['text', 0],
			toNodeId: 'delay-1' as NodeId,
			toPort: ['value', 0],
		});

		expect(downstream.added).toHaveLength(1);

		const result = applyEditorAddEdge(session, {
			fromNodeId: 'string-2' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});

		expect(result.removed).toEqual([incoming.added[0]]);
		expect(result.added).toHaveLength(1);
		expect(result.added[0]?.fromNodeId).toBe('string-2');
		expect(session.runtime.editor.getEdges()).toHaveLength(2);
		expect(
			session.runtime.editor
				.getEdges()
				.some((edge) => edge.edgeId === downstream.added[0]?.edgeId),
		).toBe(true);
		expect(session.activeWorkflow?.graph.edges).toHaveLength(2);
		expect(
			session.activeWorkflow?.graph.edges.filter(
				(edge) =>
					edge.toNodeId === ('preview-1' as NodeId) &&
					edge.toPort[0] === 'text',
			),
		).toHaveLength(1);
	});

	it('returns empty result for duplicate edge request', () => {
		applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});

		const result = applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});

		expect(result).toEqual({ removed: [], added: [] });
	});
});

describe('applyEditorRemoveNode', () => {
	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-editor-rm-node-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns removed node snapshot', () => {
		const session = new LangflowerSession();
		const node = stringNode('string-1');
		seedActiveWorkflow(session, [node, previewNode('preview-1')]);

		const result = applyEditorRemoveNode(session, 'string-1' as NodeId);

		expect(result).toEqual([node]);
		expect(session.runtime.editor.getNode('string-1' as NodeId)).toBe(
			false,
		);
	});

	it('returns empty array for unknown node id', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [stringNode('string-1')]);

		expect(applyEditorRemoveNode(session, 'missing' as NodeId)).toEqual([]);
	});
});

describe('applyEditorRemoveEdge', () => {
	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-editor-rm-edge-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns removed edge snapshots', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [
			stringNode('string-1'),
			previewNode('preview-1'),
		]);
		const { added } = applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});
		const edge = added[0]!;

		const result = applyEditorRemoveEdge(session, edge.edgeId);

		expect(result).toEqual([edge]);
		expect(session.runtime.editor.getEdges()).toEqual([]);
	});

	it('returns empty array when edge id is missing', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [stringNode('string-1')]);

		expect(
			applyEditorRemoveEdge(session, 'missing-edge' as EdgeId),
		).toEqual([]);
	});
});

describe('applyEditorUpdateNode', () => {
	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-editor-update-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('updates position and ui without runtime rebind', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [stringNode('string-1')]);

		const payload: EditorUpdateNodeRequestedPayload = {
			nodeId: 'string-1' as NodeId,
			position: { x: 120, y: 48 },
			ui: { width: 200, height: 96, label: 'Moved' },
		};

		const result = applyEditorUpdateNode(
			session,
			projectDir,
			payload,
			resolveDefinition,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.ui.position).toEqual({
			x: 120,
			y: 48,
			width: 200,
			height: 96,
		});
		expect(result[0]?.ui.label).toBe('Moved');
	});

	it('coerces numeric inline inputs on the server before persisting', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [numberNode('number-1')]);

		const result = applyEditorUpdateNode(
			session,
			projectDir,
			{
				nodeId: 'number-1' as NodeId,
				inputs: { value: '1000' },
			},
			resolveDefinition,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.inputs).toEqual({ value: 1000 });
	});

	it('normalizes incoming update payloads before they are applied', () => {
		const normalized = normalizeEditorUpdateNodePayload(
			{
				nodeId: 'number-1' as NodeId,
				inputs: { value: '1000' },
			},
			numberNode('number-1'),
			resolveDefinition,
		);

		expect(normalized.inputs).toEqual({ value: 1000 });
	});

	it('returns empty array when no update fields are present', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [stringNode('string-1')]);

		expect(
			applyEditorUpdateNode(
				session,
				projectDir,
				{ nodeId: 'string-1' as NodeId },
				resolveDefinition,
			),
		).toEqual([]);
	});

	it('returns empty array for position while graph is locked', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [stringNode('string-1')]);
		session.runnerStatus = 'running';

		expect(
			applyEditorUpdateNode(
				session,
				projectDir,
				{
					nodeId: 'string-1' as NodeId,
					position: { x: 10, y: 10 },
				},
				resolveDefinition,
			),
		).toEqual([]);
	});

	it('applies params-only while graph is locked without rebind', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [
			{
				id: 'llm-1',
				type: 'common-fake-llm',
				params: {
					rolePreset: 'custom',
					maxIterations: 8,
					maxFeedbackTurns: 0,
				},
				inputs: {},
				ui: { position: { x: 0, y: 0 } },
			},
		]);
		session.runnerStatus = 'running';
		session.runtime.editor.setLocked(true);

		const result = applyEditorUpdateNode(
			session,
			projectDir,
			{
				nodeId: 'llm-1' as NodeId,
				params: {
					rolePreset: 'custom',
					maxIterations: 7,
					maxFeedbackTurns: 3,
				},
			},
			resolveDefinition,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.params).toEqual({
			rolePreset: 'custom',
			maxIterations: 7,
			maxFeedbackTurns: 3,
		});
		expect(
			session.activeWorkflow?.graph.nodes.find(
				(node) => node.id === 'llm-1',
			)?.params,
		).toEqual({
			rolePreset: 'custom',
			maxIterations: 7,
			maxFeedbackTurns: 3,
		});
		expect(session.currentStatus).toBe('dirty');
	});

	it('rejects inputs while graph is locked', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [numberNode('number-1')]);
		session.runnerStatus = 'running';

		expect(
			applyEditorUpdateNode(
				session,
				projectDir,
				{
					nodeId: 'number-1' as NodeId,
					inputs: { value: 42 },
				},
				resolveDefinition,
			),
		).toEqual([]);
		expect(
			session.activeWorkflow?.graph.nodes.find(
				(node) => node.id === 'number-1',
			)?.inputs,
		).toEqual({ value: 0 });
	});

	it('persists idle params-only without requiring inputs rebind', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [
			{
				id: 'llm-1',
				type: 'common-fake-llm',
				params: {
					rolePreset: 'custom',
					maxIterations: 8,
					maxFeedbackTurns: 0,
				},
				inputs: {},
				ui: { position: { x: 0, y: 0 } },
			},
		]);

		const result = applyEditorUpdateNode(
			session,
			projectDir,
			{
				nodeId: 'llm-1' as NodeId,
				params: {
					rolePreset: 'custom',
					maxIterations: 12,
					maxFeedbackTurns: 2,
				},
			},
			resolveDefinition,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.params.maxIterations).toBe(12);
		expect(result[0]?.params.maxFeedbackTurns).toBe(2);
		expect(session.currentStatus).toBe('dirty');
	});

	it('applies idle params when RuntimeEditor is locked (session still idle)', () => {
		// OLD path: isGraphLocked() false → params forced bindWorkflowToSessionEditor
		// → removeNode/addNode fail while editor.locked → silent [].
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [
			{
				id: 'proposer',
				type: 'common-openai-llm',
				params: {
					rolePreset: 'custom',
					providerId: 'lmstudio',
					model: 'test-model',
					enabledToolIds: ['read', 'glob', 'grep'],
					maxIterations: 6,
					maxFeedbackTurns: 3,
				},
				inputs: {},
				ui: { position: { x: 0, y: 0 } },
			},
		]);
		expect(session.isGraphLocked()).toBe(false);
		session.runtime.editor.setLocked(true);

		const bindWhileLocked = bindWorkflowToSessionEditor(
			session.runtime.editor,
			projectDir,
			session.activeWorkflow!,
			resolveDefinition,
		);
		expect(bindWhileLocked.ok).toBe(false);

		const result = applyEditorUpdateNode(
			session,
			projectDir,
			{
				nodeId: 'proposer' as NodeId,
				params: {
					rolePreset: 'custom',
					providerId: 'lmstudio',
					model: 'test-model',
					enabledToolIds: ['read', 'glob', 'grep'],
					maxIterations: 7,
					maxFeedbackTurns: 3,
				},
			},
			resolveDefinition,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.params.maxIterations).toBe(7);
		expect(result[0]?.params.maxFeedbackTurns).toBe(3);
		expect(
			session.activeWorkflow?.graph.nodes.find(
				(node) => node.id === 'proposer',
			)?.params.maxIterations,
		).toBe(7);
	});
});

describe('editor ↔ session topology single-writer', () => {
	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-editor-topology-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('keeps node/edge ids aligned after add/update/remove mutations', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, []);
		expectEditorSessionTopologyMatch(session);

		const [added] = applyEditorAddNode(
			session,
			projectDir,
			{
				type: 'common-string',
				position: { x: 0, y: 0 },
				inputs: { value: 'hello' },
			},
			resolveDefinition,
		);
		const [preview] = applyEditorAddNode(
			session,
			projectDir,
			{
				type: 'common-preview',
				position: { x: 240, y: 0 },
			},
			resolveDefinition,
		);

		expect(added).toBeDefined();
		expect(preview).toBeDefined();
		expectEditorSessionTopologyMatch(session);

		const { added: edges } = applyEditorAddEdge(session, {
			fromNodeId: added!.id as NodeId,
			fromPort: ['value', 0],
			toNodeId: preview!.id as NodeId,
			toPort: ['text', 0],
		});
		expect(edges).toHaveLength(1);
		expectEditorSessionTopologyMatch(session);

		applyEditorUpdateNode(
			session,
			projectDir,
			{
				nodeId: added!.id as NodeId,
				position: { x: 40, y: 40 },
				inputs: { value: 'updated' },
			},
			resolveDefinition,
		);
		expectEditorSessionTopologyMatch(session);

		applyEditorRemoveEdge(session, edges[0]!.edgeId);
		expectEditorSessionTopologyMatch(session);

		applyEditorRemoveNode(session, preview!.id as NodeId);
		expectEditorSessionTopologyMatch(session);
	});

	it('keeps topology aligned after paste and edge replace', () => {
		const session = new LangflowerSession();
		seedActiveWorkflow(session, [
			stringNode('string-1'),
			stringNode('string-2'),
			previewNode('preview-1'),
		]);
		expectEditorSessionTopologyMatch(session);

		applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});
		expectEditorSessionTopologyMatch(session);

		applyEditorAddEdge(session, {
			fromNodeId: 'string-2' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});
		expectEditorSessionTopologyMatch(session);

		applyEditorPaste(
			session,
			projectDir,
			{
				nodes: [
					{
						clientId: 'tmp-a',
						type: 'common-string',
						position: { x: 10, y: 10 },
						inputs: { value: 'paste' },
					},
					{
						clientId: 'tmp-b',
						type: 'common-preview',
						position: { x: 200, y: 10 },
					},
				],
				edges: [
					{
						fromClientId: 'tmp-a',
						fromPort: ['value', 0],
						toClientId: 'tmp-b',
						toPort: ['text', 0],
					},
				],
			},
			resolveDefinition,
		);
		expectEditorSessionTopologyMatch(session);
	});
});

const swapFixture = (outputs: {
	readonly extra?: boolean;
}): ReturnType<typeof defineNode> =>
	defineNode({
		type: 'swap-fixture',
		displayName: 'Swap Fixture',
		uiSchema: [] as const,
		inputs: {
			trigger: { wireType: 'any', required: true, dynamic: true },
		},
		outputs: {
			out: { wireType: 'string' },
			...(outputs.extra === true
				? { extra: { wireType: 'string' } }
				: {}),
		},
		execute() {
			return outputs.extra === true
				? { out: 'v1', extra: 'x' }
				: { out: 'v2' };
		},
	});

const resolveSwapFixture = (
	fixture: ReturnType<typeof defineNode>,
): ResolveNodeDefinition => {
	return (node) => {
		if (node.type === 'swap-fixture') {
			return fixture;
		}

		return resolveDefinition(node);
	};
};

describe('swapCustomNodesInEditor', () => {
	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-editor-swap-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('drops vanished-port edges, keeps other nodes, works while locked', () => {
		const session = new LangflowerSession();
		const v1 = swapFixture({ extra: true });
		seedActiveWorkflow(
			session,
			[
				stringNode('string-1'),
				{
					id: 'swap-1',
					type: 'swap-fixture',
					params: {},
					inputs: {},
					ui: { position: { x: 240, y: 0 } },
				},
				previewNode('preview-1'),
			],
			[],
			resolveSwapFixture(v1),
		);

		const trigger = applyEditorAddEdge(session, {
			fromNodeId: 'string-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'swap-1' as NodeId,
			toPort: ['trigger', 0],
		});
		const extra = applyEditorAddEdge(session, {
			fromNodeId: 'swap-1' as NodeId,
			fromPort: ['extra', 0],
			toNodeId: 'preview-1' as NodeId,
			toPort: ['text', 0],
		});

		expect(trigger.added).toHaveLength(1);
		expect(extra.added).toHaveLength(1);

		const stringRuntime = session.runtime.editor.getNode(
			'string-1' as NodeId,
		);
		session.currentStatus = 'pristine';
		session.runnerStatus = 'running';
		session.runtime.editor.setLocked(true);

		const dropped = swapCustomNodesInEditor(
			session,
			projectDir,
			resolveSwapFixture(swapFixture({})),
			new Set(['swap-fixture']),
		);

		expect(dropped.map((edge) => edge.edgeId)).toEqual(
			extra.added.map((edge) => edge.edgeId),
		);
		expect(session.runtime.editor.getNode('string-1' as NodeId)).toBe(
			stringRuntime,
		);
		expect(
			session.activeWorkflow?.graph.edges.map((edge) => edge.edgeId),
		).toEqual(trigger.added.map((edge) => edge.edgeId));
		expect(session.currentStatus).toBe('dirty');
		expectEditorSessionTopologyMatch(session);
	});

	it('skips vanished types and does not dirty a compatible swap', () => {
		const session = new LangflowerSession();
		const v1 = swapFixture({ extra: true });
		seedActiveWorkflow(
			session,
			[
				{
					id: 'swap-1',
					type: 'swap-fixture',
					params: {},
					inputs: {},
					ui: { position: { x: 0, y: 0 } },
				},
				stringNode('string-1'),
			],
			[],
			resolveSwapFixture(v1),
		);
		const before = session.runtime.editor.getNode('swap-1' as NodeId);
		session.currentStatus = 'pristine';

		const skipped = swapCustomNodesInEditor(
			session,
			projectDir,
			resolveSwapFixture(v1),
			new Set(),
		);

		expect(skipped).toEqual([]);
		expect(session.runtime.editor.getNode('swap-1' as NodeId)).toBe(before);
		expect(session.currentStatus).toBe('pristine');

		const sameShape = swapCustomNodesInEditor(
			session,
			projectDir,
			resolveSwapFixture(v1),
			new Set(['swap-fixture']),
		);

		expect(sameShape).toEqual([]);
		expect(session.runtime.editor.getNode('swap-1' as NodeId)).not.toBe(
			before,
		);
		expect(session.currentStatus).toBe('pristine');
	});
});
