import { isSessionUploadMime } from '@langflower/node-sdk';
import {
	isSteerControlContinue,
	isSteerControlPause,
} from '@langflower/node-sdk/llm';
import type { CustomPaletteSnapshotPayload } from '@langflower/shared/types/langflower-custom-palette';
import type {
	PaletteConfigPayload,
	PaletteNodeDefinition,
} from '@langflower/shared/types/langflower-palette';
import type {
	WorkflowCurrentSnapshotPayload,
	WorkflowPersistedGraph,
} from '@langflower/shared/types/langflower-workflow';
import { combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const paletteByType = (
	nodes: readonly PaletteNodeDefinition[],
): ReadonlyMap<string, PaletteNodeDefinition> =>
	new Map(nodes.map((node) => [node.type, node]));

export const emptyCustomPaletteSnapshot: CustomPaletteSnapshotPayload = {
	nodes: [],
	errors: [],
	status: 'not_compiled',
};

/** Merged catalog for canvas / execution lookups (system + custom nodes). */
export const mergePaletteCatalogs = (
	system: PaletteConfigPayload,
	custom: CustomPaletteSnapshotPayload,
): PaletteConfigPayload => ({
	nodes: [
		...system.nodes.map((node) => ({ ...node, source: 'system' as const })),
		...custom.nodes.map((node) => ({ ...node, source: 'custom' as const })),
	],
});

/**
 * Wait for real system + custom snapshots. No empty custom `startWith` —
 * unknown custom `chatEntry` types must not classify until both facts exist.
 */
export const mergedPaletteFromSnapshots$ = (
	system$: Observable<PaletteConfigPayload>,
	custom$: Observable<CustomPaletteSnapshotPayload>,
): Observable<PaletteConfigPayload> =>
	combineLatest([system$, custom$]).pipe(
		map(([system, custom]) => mergePaletteCatalogs(system, custom)),
	);

export const nodeTypeByIdFromGraph = (
	graph: WorkflowPersistedGraph | null,
): ReadonlyMap<string, string> =>
	new Map((graph?.nodes ?? []).map((node) => [node.id, node.type]));

export const nodeTypeByIdFromWorkflow = (
	snap: WorkflowCurrentSnapshotPayload,
): ReadonlyMap<string, string> =>
	nodeTypeByIdFromGraph(snap.activeWorkflow?.graph ?? null);

export const nodeLabelsFromWorkflow = (
	snap: WorkflowCurrentSnapshotPayload,
	palette: ReadonlyMap<string, PaletteNodeDefinition>,
): ReadonlyMap<string, string> => {
	const next = new Map<string, string>();
	for (const node of snap.activeWorkflow?.graph.nodes ?? []) {
		const title =
			node.ui.label?.trim() ||
			palette.get(node.type)?.displayName ||
			node.type;
		next.set(node.id, title);
	}
	return next;
};

export type FeedCatalog = {
	readonly labels: ReadonlyMap<string, string>;
	readonly paletteByType: ReadonlyMap<string, PaletteNodeDefinition>;
	readonly nodeTypeById: ReadonlyMap<string, string>;
	readonly workflowId?: string | null;
};

export const feedCatalogFromSnaps = (
	workflow: WorkflowCurrentSnapshotPayload,
	palette: PaletteConfigPayload,
): FeedCatalog => {
	const catalog = paletteByType(palette.nodes);
	const nodeTypeById = nodeTypeByIdFromWorkflow(workflow);
	return {
		labels: nodeLabelsFromWorkflow(workflow, catalog),
		paletteByType: catalog,
		nodeTypeById,
		workflowId: workflow.activeWorkflow?.workflowId ?? null,
	};
};

export type WorkflowDocumentKey = {
	readonly workflowId?: string | null;
	readonly nodeIdsKey: string;
};

export const workflowNodeIdsKey = (
	nodeTypeById: ReadonlyMap<string, string>,
): string => [...nodeTypeById.keys()].sort().join('\0');

/** True when the catalog belongs to a different workflow document (not rename). */
export const catalogSwitchedDocument = (
	previous: WorkflowDocumentKey | null,
	next: WorkflowDocumentKey,
): boolean => {
	if (previous === null) {
		return false;
	}
	const previousId = previous.workflowId ?? null;
	const nextId = next.workflowId ?? null;
	if (previousId === null || nextId === null || previousId === nextId) {
		return false;
	}
	return previous.nodeIdsKey !== next.nodeIdsKey;
};

export const definitionForNode = (
	paletteByType: ReadonlyMap<string, PaletteNodeDefinition>,
	nodeTypeById: ReadonlyMap<string, string>,
	nodeId: string,
): PaletteNodeDefinition | undefined => {
	const type = nodeTypeById.get(nodeId);
	return type === undefined ? undefined : paletteByType.get(type);
};

/** File citation on a user bubble. Bytes and base64 stay off the feed. */
export type HitlUserFileRef = {
	readonly fileId: string;
	readonly name: string;
	readonly mimeType: string;
};

export type HitlUserProjection = {
	readonly text: string;
	readonly files: readonly HitlUserFileRef[];
};

const isHitlUserFileRef = (value: unknown): value is HitlUserFileRef => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	if (!('fileId' in value) || !('name' in value) || !('mimeType' in value)) {
		return false;
	}
	const { fileId, name, mimeType } = value;
	return (
		typeof fileId === 'string' &&
		fileId.length > 0 &&
		typeof name === 'string' &&
		name.length > 0 &&
		typeof mimeType === 'string' &&
		isSessionUploadMime(mimeType)
	);
};

const readUserTurn = (
	payload: unknown,
):
	| { readonly text: string; readonly files: readonly HitlUserFileRef[] }
	| undefined => {
	if (typeof payload !== 'object' || payload === null) {
		return undefined;
	}
	if (!('text' in payload) || !('files' in payload)) {
		return undefined;
	}
	const { text, files } = payload;
	if (typeof text !== 'string' || !Array.isArray(files)) {
		return undefined;
	}
	return {
		text: text.trim(),
		files: files.flatMap((file) => {
			if (!isHitlUserFileRef(file)) {
				return [];
			}
			return [
				{
					fileId: file.fileId,
					name: file.name,
					mimeType: file.mimeType,
				},
			];
		}),
	};
};

/** User-bubble text and file refs for a HITL submit / input-received payload. */
export const projectHitlUser = (
	definition: PaletteNodeDefinition,
	portId: string,
	payload: unknown,
): HitlUserProjection => {
	if (isSteerControlPause(payload)) {
		return { text: '', files: [] };
	}
	if (isSteerControlContinue(payload)) {
		if (payload.kind !== 'steer') {
			return { text: '', files: [] };
		}
		const turn = readUserTurn(payload);
		return {
			text: payload.text.trim(),
			files: turn?.files ?? [],
		};
	}
	const input = definition.inputsConfigs.find(
		(entry) => entry.portId === portId,
	);
	const hitl = input?.hitl;
	if (hitl === undefined) {
		return {
			text: typeof payload === 'string' ? payload.trim() : '',
			files: [],
		};
	}
	if (hitl.kind === 'button') {
		return { text: hitl.label.trim(), files: [] };
	}
	if (typeof payload === 'string') {
		return { text: payload.trim(), files: [] };
	}
	const turn = readUserTurn(payload);
	if (turn !== undefined) {
		return turn;
	}
	if (payload === null || payload === undefined) {
		return { text: '', files: [] };
	}
	return { text: String(payload), files: [] };
};

/** User-bubble copy for a HITL submit / input-received payload. */
export const formatHitlUserText = (
	definition: PaletteNodeDefinition,
	portId: string,
	payload: unknown,
): string => projectHitlUser(definition, portId, payload).text;
