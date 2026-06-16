import fs from 'node:fs/promises';
import path from 'node:path';
import type {
	WorkflowListEntry,
	WorkflowLoadPayload,
	WorkflowLoadedPayload,
	WorkflowSavePayload,
} from '@langflower/shared/langflower.js';
import {
	parseWorkflowDocument,
	validateWorkflowStructure,
	type ResolveNodeDefinition,
} from './workflow-document.js';
import { normalizeWorkflowDocumentInputs } from './workflow-persisted-inputs.js';
import { repairWorkflowGraph } from './repair-workflow-graph.js';

const workflowIdFromFileName = (fileName: string): string =>
	path.basename(fileName, '.json');

/** Preserve IDE `$schema` across rewrite (not part of runtime document). */
const readWorkflowSchemaRef = async (
	filePath: string,
): Promise<string | undefined> => {
	try {
		const raw: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));

		if (
			raw !== null &&
			typeof raw === 'object' &&
			!Array.isArray(raw) &&
			typeof (raw as { readonly $schema?: unknown }).$schema === 'string'
		) {
			const schema = (raw as { readonly $schema: string }).$schema.trim();
			return schema.length > 0 ? schema : undefined;
		}
	} catch {
		// missing or invalid file — first save has no schema yet
	}

	return undefined;
};

export class WorkflowService {
	constructor(
		private readonly projectDir: string,
		private readonly resolveDefinition: ResolveNodeDefinition,
	) {}

	private workflowsDir(): string {
		return path.join(this.projectDir, '.langflower', 'workflows');
	}

	private workflowPath(workflowId: string): string {
		return path.join(this.workflowsDir(), `${workflowId}.json`);
	}

	async exists(workflowId: string): Promise<boolean> {
		try {
			await fs.access(this.workflowPath(workflowId));
			return true;
		} catch {
			return false;
		}
	}

	async list(): Promise<readonly WorkflowListEntry[]> {
		try {
			const files = await fs.readdir(this.workflowsDir());
			const entries = (
				await Promise.all(
					files
						.filter((file) => file.endsWith('.json'))
						.map(async (file) => {
							try {
								const workflowId = workflowIdFromFileName(file);
								const raw = await fs.readFile(
									path.join(this.workflowsDir(), file),
									'utf8',
								);
								const { metadata } = parseWorkflowDocument(
									JSON.parse(raw),
								);

								return {
									workflowId,
									name: metadata.name,
									...(metadata.description !== undefined
										? { description: metadata.description }
										: {}),
									createdAt: metadata.createdAt,
									updatedAt: metadata.updatedAt,
								} satisfies WorkflowListEntry;
							} catch {
								return undefined;
							}
						}),
				)
			).filter(
				(entry): entry is WorkflowListEntry => entry !== undefined,
			);

			return entries.sort((left, right) =>
				left.name.localeCompare(right.name),
			);
		} catch {
			return [];
		}
	}

	async load(payload: WorkflowLoadPayload): Promise<
		| {
				readonly ok: true;
				readonly document: WorkflowLoadedPayload;
				readonly repaired: boolean;
				readonly droppedNodeIds: readonly string[];
				readonly droppedEdgeIds: readonly string[];
		  }
		| {
				readonly ok: false;
				readonly code: string;
				readonly message: string;
		  }
	> {
		try {
			const raw = await fs.readFile(
				this.workflowPath(payload.workflowId),
				'utf8',
			);
			const disk = parseWorkflowDocument(JSON.parse(raw));
			const normalized = normalizeWorkflowDocumentInputs(
				{
					workflowId: payload.workflowId,
					metadata: disk.metadata,
					graph: disk.graph,
				},
				this.resolveDefinition,
			);
			const repair = repairWorkflowGraph(
				normalized.graph,
				this.resolveDefinition,
			);
			const document: WorkflowLoadedPayload = {
				...normalized,
				graph: repair.graph,
			};
			const validation = validateWorkflowStructure(
				document,
				this.resolveDefinition,
			);

			if (!validation.ok) {
				return {
					ok: false,
					code: 'INVALID_GRAPH',
					message: validation.message,
				};
			}

			const repaired =
				repair.droppedNodeIds.length > 0 ||
				repair.droppedEdgeIds.length > 0;

			return {
				ok: true,
				document,
				repaired,
				droppedNodeIds: repair.droppedNodeIds,
				droppedEdgeIds: repair.droppedEdgeIds,
			};
		} catch {
			return {
				ok: false,
				code: 'NOT_FOUND',
				message: `Workflow ${payload.workflowId} not found`,
			};
		}
	}

	async save(payload: WorkflowSavePayload): Promise<
		| { readonly ok: true; readonly document: WorkflowLoadedPayload }
		| {
				readonly ok: false;
				readonly code: string;
				readonly message: string;
		  }
	> {
		const document = normalizeWorkflowDocumentInputs(
			{
				workflowId: payload.workflowId,
				metadata: payload.metadata,
				graph: payload.graph,
			},
			this.resolveDefinition,
		);
		const validation = validateWorkflowStructure(
			document,
			this.resolveDefinition,
		);

		if (!validation.ok) {
			return {
				ok: false,
				code: 'INVALID_GRAPH',
				message: validation.message,
			};
		}

		await fs.mkdir(this.workflowsDir(), { recursive: true });

		const schemaRef = await readWorkflowSchemaRef(
			this.workflowPath(payload.workflowId),
		);

		if (
			payload.previousWorkflowId !== undefined &&
			payload.previousWorkflowId !== payload.workflowId
		) {
			try {
				await fs.unlink(this.workflowPath(payload.previousWorkflowId));
			} catch {
				// previous file may already be absent
			}
		}

		await fs.writeFile(
			this.workflowPath(payload.workflowId),
			`${JSON.stringify(
				{
					...(schemaRef !== undefined ? { $schema: schemaRef } : {}),
					metadata: document.metadata,
					graph: document.graph,
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		return { ok: true, document };
	}

	async delete(workflowId: string): Promise<
		| { readonly ok: true }
		| {
				readonly ok: false;
				readonly code: string;
				readonly message: string;
		  }
	> {
		try {
			await fs.unlink(this.workflowPath(workflowId));
			return { ok: true };
		} catch {
			return {
				ok: false,
				code: 'NOT_FOUND',
				message: `Workflow ${workflowId} not found`,
			};
		}
	}
}
