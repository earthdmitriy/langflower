import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
	WorkflowCheckpoint,
	WorkflowCheckpointSummary,
} from '@langflower/shared/langflower.js';

const CHECKPOINT_FILE = 'checkpoint.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isErrnoCode = (error: unknown, code: string): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	(error as { code: unknown }).code === code;

const isCheckpointStatus = (
	value: unknown,
): value is WorkflowCheckpoint['status'] =>
	value === 'running' ||
	value === 'stopped' ||
	value === 'completed' ||
	value === 'failed';

const parseCheckpoint = (
	raw: unknown,
):
	| WorkflowCheckpoint
	| { readonly corrupt: true; readonly message: string } => {
	if (!isRecord(raw)) {
		return { corrupt: true, message: 'Checkpoint root must be an object' };
	}

	if (raw.schemaVersion !== 1) {
		return {
			corrupt: true,
			message: `Unsupported checkpoint schemaVersion: ${String(raw.schemaVersion)}`,
		};
	}

	if (
		typeof raw.runId !== 'string' ||
		typeof raw.workflowId !== 'string' ||
		typeof raw.workflowFingerprint !== 'string' ||
		typeof raw.updatedAt !== 'string' ||
		!isCheckpointStatus(raw.status) ||
		!Array.isArray(raw.completedNodeIds) ||
		!isRecord(raw.outputSnapshots)
	) {
		return { corrupt: true, message: 'Checkpoint fields are incomplete' };
	}

	if (!raw.completedNodeIds.every((id) => typeof id === 'string')) {
		return { corrupt: true, message: 'completedNodeIds must be strings' };
	}

	const label =
		typeof raw.label === 'string' && raw.label.trim().length > 0
			? raw.label.trim()
			: undefined;

	return {
		schemaVersion: 1,
		runId: raw.runId,
		workflowId: raw.workflowId,
		workflowFingerprint: raw.workflowFingerprint,
		updatedAt: raw.updatedAt,
		status: raw.status,
		completedNodeIds: raw.completedNodeIds,
		outputSnapshots:
			raw.outputSnapshots as WorkflowCheckpoint['outputSnapshots'],
		...(label !== undefined ? { label } : {}),
	};
};

const toSummary = (
	checkpoint: WorkflowCheckpoint,
	options?: { readonly stale?: boolean },
): WorkflowCheckpointSummary => ({
	runId: checkpoint.runId,
	workflowId: checkpoint.workflowId,
	status: checkpoint.status,
	updatedAt: checkpoint.updatedAt,
	completedNodeIds: checkpoint.completedNodeIds,
	...(checkpoint.label !== undefined ? { label: checkpoint.label } : {}),
	...(options?.stale === true ? { stale: true } : {}),
});

const atomicWriteJson = async (
	filePath: string,
	value: unknown,
): Promise<void> => {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
	const body = `${JSON.stringify(value, null, '\t')}\n`;
	await fs.writeFile(tempPath, body, 'utf8');

	try {
		await fs.rename(tempPath, filePath);
	} catch (error) {
		// Windows: replace existing file via unlink + rename when needed.
		if (!isErrnoCode(error, 'EEXIST') && !isErrnoCode(error, 'EPERM')) {
			await fs.unlink(tempPath).catch(() => undefined);
			throw error;
		}

		await fs.unlink(filePath).catch(() => undefined);
		await fs.rename(tempPath, filePath);
	}
};

type CheckpointLoadResult =
	| { readonly ok: true; readonly checkpoint: WorkflowCheckpoint }
	| {
			readonly ok: false;
			readonly code: 'NOT_FOUND' | 'CORRUPT';
			readonly message: string;
	  };

export class WorkflowCheckpointStore {
	constructor(private readonly projectDir: string) {}

	private runsRoot(): string {
		return path.join(this.projectDir, '.langflower', 'runs');
	}

	private checkpointPath(workflowId: string, runId: string): string {
		return path.join(this.runsRoot(), workflowId, runId, CHECKPOINT_FILE);
	}

	async save(checkpoint: WorkflowCheckpoint): Promise<void> {
		await atomicWriteJson(
			this.checkpointPath(checkpoint.workflowId, checkpoint.runId),
			checkpoint,
		);
	}

	async load(
		workflowId: string,
		runId: string,
	): Promise<CheckpointLoadResult> {
		const filePath = this.checkpointPath(workflowId, runId);

		let text: string;
		try {
			text = await fs.readFile(filePath, 'utf8');
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return {
					ok: false,
					code: 'NOT_FOUND',
					message: `No checkpoint for ${workflowId}/${runId}`,
				};
			}

			throw error;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(text) as unknown;
		} catch {
			return {
				ok: false,
				code: 'CORRUPT',
				message: 'Checkpoint JSON is not parseable',
			};
		}

		const checkpoint = parseCheckpoint(parsed);
		if ('corrupt' in checkpoint) {
			return {
				ok: false,
				code: 'CORRUPT',
				message: checkpoint.message,
			};
		}

		if (
			checkpoint.workflowId !== workflowId ||
			checkpoint.runId !== runId
		) {
			return {
				ok: false,
				code: 'CORRUPT',
				message: 'Checkpoint identity does not match path',
			};
		}

		return { ok: true, checkpoint };
	}

	async discard(workflowId: string, runId: string): Promise<void> {
		const dir = path.join(this.runsRoot(), workflowId, runId);
		await fs.rm(dir, { recursive: true, force: true });
	}

	async listResumable(
		workflowId: string,
		currentFingerprint?: string,
	): Promise<readonly WorkflowCheckpointSummary[]> {
		const workflowDir = path.join(this.runsRoot(), workflowId);

		let entries: string[];
		try {
			entries = await fs.readdir(workflowDir);
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return [];
			}

			throw error;
		}

		const summaries = await Promise.all(
			entries.map(async (runId) => {
				const loaded = await this.load(workflowId, runId);
				if (!loaded.ok) {
					return {
						runId,
						workflowId,
						status: 'failed' as const,
						updatedAt: new Date(0).toISOString(),
						completedNodeIds: [] as const,
						corrupt: true,
					} satisfies WorkflowCheckpointSummary;
				}

				if (loaded.checkpoint.status === 'completed') {
					return undefined;
				}

				const stale =
					currentFingerprint !== undefined &&
					loaded.checkpoint.workflowFingerprint !==
						currentFingerprint;

				return toSummary(loaded.checkpoint, { stale });
			}),
		);

		return summaries
			.filter(
				(entry): entry is WorkflowCheckpointSummary =>
					entry !== undefined,
			)
			.sort((left, right) =>
				right.updatedAt.localeCompare(left.updatedAt),
			);
	}
}

export const summarizeCheckpoint = (
	checkpoint: WorkflowCheckpoint,
	options?: { readonly stale?: boolean },
): WorkflowCheckpointSummary => toSummary(checkpoint, options);
