import type { EdgeId, NodeId } from '@langflower/runtime';
import {
	clampDividerPositionsSanity,
	type CanvasViewport,
	type DividerPositions,
	type EditorAddEdgeRequestedPayload,
	type EditorAddNodeRequestedPayload,
	type EditorPasteRequestedPayload,
	type EditorSelectNodeRequestedPayload,
	type EditorSettingsRequestedPayload,
	type EditorSettingsSnapshotPayload,
	type EditorUpdateNodeRequestedPayload,
	type LangflowerConfigScope,
} from '@langflower/shared/langflower.js';
import { Subscription } from 'rxjs';
import type { ServerContext } from '../server-context.js';
import { buildSelectedNodePayload } from '../session/build-selected-node-payload.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import {
	applyEditorAddEdge,
	applyEditorAddNode,
	applyEditorPaste,
	applyEditorRemoveEdge,
	applyEditorRemoveNode,
	applyEditorUpdateNode,
	normalizeEditorUpdateNodePayload,
} from '../workflow/apply-editor-mutation.js';
import { bridgeEmit } from './bridge-outbound.js';
import { findClientById } from './client-index.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';
import { sameCanvasViewport } from './same-canvas-viewport.js';
import type { SettingsDraftController } from './settings-draft-controller.js';

const isValidCanvasViewport = (value: unknown): value is CanvasViewport => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const viewport = value as Record<string, unknown>;

	return (
		typeof viewport.x === 'number' &&
		Number.isFinite(viewport.x) &&
		typeof viewport.y === 'number' &&
		Number.isFinite(viewport.y) &&
		typeof viewport.scale === 'number' &&
		Number.isFinite(viewport.scale) &&
		viewport.scale > 0
	);
};

export const wireEditorHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
	draftController?: SettingsDraftController,
): Subscription => {
	const subscription = new Subscription();

	subscription.add(
		bridge['editor.addNode.requested'].subscribe((raw) => {
			if (!isInboundEvent<EditorAddNodeRequestedPayload>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const delta = applyEditorAddNode(
				session,
				context.projectDir,
				raw.payload,
				context.resolveDefinition,
			);

			bridgeEmit(bridge, 'editor.addNodes', delta);

			if (delta.length > 0) {
				bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
					status: session.currentStatus,
				});
			}
		}),
	);

	subscription.add(
		bridge['editor.updateNode.requested'].subscribe((raw) => {
			if (!isInboundEvent<EditorUpdateNodeRequestedPayload>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const normalizedPayload = normalizeEditorUpdateNodePayload(
				raw.payload,
				session.activeWorkflow?.graph.nodes.find(
					(node) => node.id === raw.payload.nodeId,
				) ?? { type: '', params: {} },
				context.resolveDefinition,
			);

			const delta = applyEditorUpdateNode(
				session,
				context.projectDir,
				normalizedPayload,
				context.resolveDefinition,
			);

			bridgeEmit(bridge, 'editor.updateNodes', delta);

			if (delta.length > 0) {
				bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
					status: session.currentStatus,
				});
			}

			if (
				session.selectedNodeId !== null &&
				delta.some((node) => node.id === session.selectedNodeId)
			) {
				bridgeEmit(
					bridge,
					'editor.nodeSelected',
					buildSelectedNodePayload(
						session,
						context.resolveDefinition,
					),
				);
			}
		}),
	);

	subscription.add(
		bridge['editor.addEdge.requested'].subscribe((raw) => {
			if (!isInboundEvent<EditorAddEdgeRequestedPayload>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const { removed, added } = applyEditorAddEdge(session, raw.payload);

			if (removed.length > 0) {
				bridgeEmit(bridge, 'editor.deleteEdges', removed);
			}

			if (added.length > 0) {
				bridgeEmit(bridge, 'editor.addEdges', added);
			}

			if (removed.length > 0 || added.length > 0) {
				bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
					status: session.currentStatus,
				});
			}
		}),
	);

	subscription.add(
		bridge['editor.paste.requested'].subscribe((raw) => {
			if (!isInboundEvent<EditorPasteRequestedPayload>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const { nodes, edges } = applyEditorPaste(
				session,
				context.projectDir,
				raw.payload,
				context.resolveDefinition,
			);

			if (nodes.length > 0) {
				bridgeEmit(bridge, 'editor.addNodes', nodes);
			}

			if (edges.length > 0) {
				bridgeEmit(bridge, 'editor.addEdges', edges);
			}

			if (nodes.length > 0 || edges.length > 0) {
				bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
					status: session.currentStatus,
				});
			}
		}),
	);

	subscription.add(
		bridge['editor.removeEdge.requested'].subscribe((raw) => {
			if (!isInboundEvent<string>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const delta = applyEditorRemoveEdge(session, raw.payload as EdgeId);

			bridgeEmit(bridge, 'editor.deleteEdges', delta);

			if (delta.length > 0) {
				bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
					status: session.currentStatus,
				});
			}
		}),
	);

	subscription.add(
		bridge['editor.removeNode.requested'].subscribe((raw) => {
			if (!isInboundEvent<string>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const delta = applyEditorRemoveNode(session, raw.payload as NodeId);

			bridgeEmit(bridge, 'editor.deleteNodes', delta);

			if (delta.length > 0) {
				bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
					status: session.currentStatus,
				});
			}

			if (
				session.selectedNodeId !== null &&
				delta.some((node) => node.id === session.selectedNodeId)
			) {
				session.selectedNodeId = null;
				bridgeEmit(bridge, 'editor.nodeSelected', { node: null });
			}
		}),
	);

	subscription.add(
		bridge['editor.viewport.requested'].subscribe((raw) => {
			if (!isInboundEvent<CanvasViewport>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			if (!isValidCanvasViewport(raw.payload)) {
				return;
			}

			if (session.activeWorkflow !== null) {
				const currentViewport = session.activeWorkflow.graph.viewport;

				if (sameCanvasViewport(currentViewport, raw.payload)) {
					return;
				}

				session.activeWorkflow = {
					...session.activeWorkflow,
					graph: {
						...session.activeWorkflow.graph,
						viewport: raw.payload,
					},
				};
				session.markDirty();
			}

			bridgeEmit(bridge, 'editor.viewport.delta', raw.payload);
			bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
				status: session.currentStatus,
			});
		}),
	);

	subscription.add(
		bridge['editor.dividers.requested'].subscribe((raw) => {
			if (!isInboundEvent<DividerPositions>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const positions = raw.payload;

			// Validate and clamp
			if (
				typeof positions.leftWidth !== 'number' ||
				!Number.isFinite(positions.leftWidth) ||
				typeof positions.rightWidth !== 'number' ||
				!Number.isFinite(positions.rightWidth) ||
				typeof positions.composerHeight !== 'number' ||
				!Number.isFinite(positions.composerHeight)
			) {
				return;
			}

			const clamped = clampDividerPositionsSanity(positions);

			session.dividerPositions = clamped;
			bridgeEmit(bridge, 'editor.dividers.snapshot', clamped);

			void context.langflowerConfigService.setDividerPositions(clamped);
		}),
	);

	subscription.add(
		bridge['editor.settings.requested'].subscribe((raw) => {
			if (!isInboundEvent<EditorSettingsRequestedPayload>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const next = applySettingsRequested(session.settings, raw.payload);
			if (next === null) {
				return;
			}

			session.settings = next;
			bridgeEmit(bridge, 'editor.settings.snapshot', next);
			if (next.open && draftController !== undefined) {
				void draftController.broadcast(next.scope);
			}
		}),
	);

	subscription.add(
		bridge['editor.selectNode.requested'].subscribe((raw) => {
			if (!isInboundEvent<EditorSelectNodeRequestedPayload>(raw)) {
				return;
			}

			if (findClientById(bridge, raw.clientId) === undefined) {
				return;
			}

			const { nodeId } = raw.payload;

			if (
				nodeId !== null &&
				!session.activeWorkflow?.graph.nodes.some(
					(node) => node.id === nodeId,
				)
			) {
				return;
			}

			if (nodeId !== null && session.settings.open) {
				const closed: EditorSettingsSnapshotPayload = {
					open: false,
					scope: session.settings.scope,
				};
				session.settings = closed;
				bridgeEmit(bridge, 'editor.settings.snapshot', closed);
			}

			session.selectedNodeId = nodeId;
			bridgeEmit(
				bridge,
				'editor.nodeSelected',
				buildSelectedNodePayload(session, context.resolveDefinition),
			);
		}),
	);

	return subscription;
};

const isConfigScope = (value: unknown): value is LangflowerConfigScope =>
	value === 'project' || value === 'global';

/**
 * Apply a Settings aside intent. Returns `null` when the payload is invalid
 * (`open: true` without a valid `scope`).
 */
export const applySettingsRequested = (
	current: EditorSettingsSnapshotPayload,
	payload: EditorSettingsRequestedPayload,
): EditorSettingsSnapshotPayload | null => {
	if (payload.open) {
		if (!isConfigScope(payload.scope)) {
			return null;
		}
		return { open: true, scope: payload.scope };
	}

	return { open: false, scope: current.scope };
};
