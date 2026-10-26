import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { HitlUploadedFile, NodeStateJson } from '@langflower/node-sdk';
import { toCheckpointJsonValue } from '@langflower/shared/checkpoint/json-value.js';
import { deriveExecutionProgressStatus } from '@langflower/shared/execution/derive-run-settle-outcome.js';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap.js';
import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type {
	WorkflowSessionFile,
	WorkflowSessionOutputSnapshots,
	WorkflowSessionPoint,
	WorkflowSessionSummary,
} from '@langflower/shared/types/workflow-session.js';
import { parseWorkflowDocument } from '../workflow/workflow-document.js';
import {
	isSessionUploadFileId,
	isSessionUploadMime,
	sessionUploadByteLengthAllowed,
	sessionUploadFileName,
	uploadedFileFromMeta,
} from './session-upload.js';

/**
 * `WorkflowService.workflowPath` joins `${workflowId}.json` with no
 * segment guard. This store validates `workflowId`, `sessionId`, and
 * `pointId` itself. Do not "fix" that workflow path here.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isErrnoCode = (error: unknown, code: string): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	(error as { code: unknown }).code === code;

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Non-empty, and no `/`, `\`, `..`, `:`, or NUL. Drive letters (`C:`)
 * and parent segments fail this check.
 */
export const isSafeWorkflowSessionId = (id: string): boolean =>
	id.length > 0 &&
	!id.includes('/') &&
	!id.includes('\\') &&
	!id.includes('..') &&
	!id.includes(':') &&
	!id.includes('\0');

type WorkflowSessionStoreFailureCode =
	| 'NOT_FOUND'
	| 'CORRUPT'
	| 'INVALID_ID'
	| 'WRITE_FAILED'
	| 'MIME'
	| 'TOO_LARGE'
	| 'INVALID_NAME';

export type WorkflowSessionStoreResult<T> =
	| { readonly ok: true; readonly value: T }
	| {
			readonly ok: false;
			readonly code: WorkflowSessionStoreFailureCode;
			readonly message: string;
			readonly corrupt?: true;
	  };

const failure = (
	code: WorkflowSessionStoreFailureCode,
	message: string,
	corrupt?: true,
): WorkflowSessionStoreResult<never> => ({
	ok: false,
	code,
	message,
	...(corrupt === true ? { corrupt: true as const } : {}),
});

const parseNodeStates = (
	raw: unknown,
): Readonly<Record<string, NodeStateJson>> | undefined => {
	if (!isRecord(raw)) {
		return undefined;
	}

	const states: Record<string, NodeStateJson> = {};

	for (const [nodeId, value] of Object.entries(raw)) {
		const json = toCheckpointJsonValue(value);

		if (json === undefined || nodeId.length === 0) {
			return undefined;
		}

		states[nodeId] = json;
	}

	return states;
};

const isViewport = (value: unknown): boolean => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.x === 'number' &&
		Number.isFinite(value.x) &&
		typeof value.y === 'number' &&
		Number.isFinite(value.y) &&
		typeof value.scale === 'number' &&
		Number.isFinite(value.scale)
	);
};

const parseWorkflowSnapshot = (
	raw: unknown,
): WorkflowLoadedPayload | undefined => {
	if (!isRecord(raw) || typeof raw.workflowId !== 'string') {
		return undefined;
	}

	if (!isSafeWorkflowSessionId(raw.workflowId)) {
		return undefined;
	}

	const parsed = parseWorkflowDocument(raw);

	if (!parsed.ok) {
		return undefined;
	}

	const { graph } = parsed.document;

	if (
		!Array.isArray(graph.nodes) ||
		!Array.isArray(graph.edges) ||
		!isViewport(graph.viewport)
	) {
		return undefined;
	}

	return {
		workflowId: raw.workflowId,
		metadata: parsed.document.metadata,
		graph,
	};
};

const byteOffset = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0
		? value
		: undefined;

const parsePoint = (raw: unknown): WorkflowSessionPoint | undefined => {
	if (!isRecord(raw)) {
		return undefined;
	}

	if (
		typeof raw.pointId !== 'string' ||
		!isSafeWorkflowSessionId(raw.pointId) ||
		typeof raw.runId !== 'string' ||
		raw.runId.length === 0 ||
		typeof raw.createdAt !== 'string' ||
		typeof raw.workflowFingerprint !== 'string' ||
		!Array.isArray(raw.completedNodeIds) ||
		!raw.completedNodeIds.every((id) => typeof id === 'string') ||
		!isRecord(raw.outputSnapshots)
	) {
		return undefined;
	}

	const nodeStates = parseNodeStates(raw.nodeStates);
	const runOffset = byteOffset(raw.runOffset);
	const feedOffset = byteOffset(raw.feedOffset);

	if (
		nodeStates === undefined ||
		runOffset === undefined ||
		feedOffset === undefined ||
		feedOffset < runOffset
	) {
		return undefined;
	}

	const label =
		typeof raw.label === 'string' && raw.label.trim().length > 0
			? raw.label.trim()
			: undefined;
	const unsupported =
		typeof raw.unsupported === 'string' && raw.unsupported.length > 0
			? raw.unsupported
			: undefined;

	return {
		pointId: raw.pointId,
		runId: raw.runId,
		createdAt: raw.createdAt,
		workflowFingerprint: raw.workflowFingerprint,
		completedNodeIds: raw.completedNodeIds,
		// Port snapshots share the checkpoint JSON shape; validated on use.
		outputSnapshots: raw.outputSnapshots as WorkflowSessionOutputSnapshots,
		nodeStates,
		runOffset,
		feedOffset,
		...(label !== undefined ? { label } : {}),
		...(unsupported !== undefined ? { unsupported } : {}),
	};
};

const parseSession = (
	raw: unknown,
):
	| WorkflowSessionFile
	| { readonly corrupt: true; readonly message: string } => {
	if (!isRecord(raw)) {
		return { corrupt: true, message: 'Session root must be an object' };
	}

	if (raw.schemaVersion !== 1) {
		return {
			corrupt: true,
			message: `Unsupported session schemaVersion: ${String(raw.schemaVersion)}`,
		};
	}

	if (
		typeof raw.sessionId !== 'string' ||
		typeof raw.workflowId !== 'string' ||
		typeof raw.label !== 'string' ||
		raw.label.length === 0 ||
		typeof raw.localDay !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}$/.test(raw.localDay) ||
		typeof raw.ordinal !== 'number' ||
		!Number.isInteger(raw.ordinal) ||
		raw.ordinal < 1 ||
		typeof raw.createdAt !== 'string' ||
		typeof raw.updatedAt !== 'string' ||
		!Array.isArray(raw.points) ||
		!isSafeWorkflowSessionId(raw.label)
	) {
		return { corrupt: true, message: 'Session fields are incomplete' };
	}

	const workflowSnapshot = parseWorkflowSnapshot(raw.workflowSnapshot);
	const nodeStates = parseNodeStates(raw.nodeStates);
	const headOffset =
		raw.headOffset === null ? null : byteOffset(raw.headOffset);

	if (
		workflowSnapshot === undefined ||
		nodeStates === undefined ||
		headOffset === undefined
	) {
		return { corrupt: true, message: 'Session fields are incomplete' };
	}

	const points: WorkflowSessionPoint[] = [];

	for (const point of raw.points) {
		const parsed = parsePoint(point);

		if (parsed === undefined) {
			return { corrupt: true, message: 'Session point is incomplete' };
		}

		points.push(parsed);
	}

	return {
		schemaVersion: 1,
		sessionId: raw.sessionId,
		workflowId: raw.workflowId,
		label: raw.label,
		localDay: raw.localDay,
		ordinal: raw.ordinal,
		createdAt: raw.createdAt,
		updatedAt: raw.updatedAt,
		workflowSnapshot,
		nodeStates,
		headOffset,
		points,
	};
};

const ORDINAL_READ_ATTEMPTS = 4;
const ORDINAL_READ_DELAY_MS = 15;

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

/**
 * Write beside the destination, then copy over it. Unlinking the `.json`
 * first makes the next ordinal miss that session and mint `#1` again.
 */
const atomicWriteJson = async (
	filePath: string,
	value: unknown,
): Promise<void> => {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
	const body = `${JSON.stringify(value, null, '\t')}\n`;
	await fs.writeFile(tempPath, body, 'utf8');

	try {
		await fs.copyFile(tempPath, filePath);
	} finally {
		await fs.unlink(tempPath).catch(() => undefined);
	}
};

const isRunMarker = (
	value: unknown,
): value is {
	readonly kind: 'run';
	readonly runId: string;
	readonly workflowId: string;
} =>
	isRecord(value) &&
	value.kind === 'run' &&
	typeof value.runId === 'string' &&
	value.runId.length > 0 &&
	typeof value.workflowId === 'string';

const parseFeedLog = (
	text: string,
	limit: number,
): {
	readonly snapshot: ExecutionFeedSnapshotPayload | null;
	readonly runOffset: number;
} => {
	if (text.length === 0 || limit <= 0) {
		return { snapshot: null, runOffset: 0 };
	}

	const lines = text.split('\n');
	let offset = 0;
	let runOffset = 0;
	let runId: string | undefined;
	let workflowId: string | undefined;
	const events: RuntimeRunnerEvent[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const isLast = index === lines.length - 1;
		const newline = !isLast || text.endsWith('\n');
		const bytes = Buffer.byteLength(line) + (newline ? 1 : 0);

		if (line.length === 0) {
			offset += bytes;
			continue;
		}

		if (offset >= limit) {
			break;
		}

		let value: unknown;

		try {
			value = JSON.parse(line) as unknown;
		} catch {
			offset += bytes;
			continue;
		}

		if (isRunMarker(value)) {
			runOffset = offset;
			runId = value.runId;
			workflowId = value.workflowId;
			events.length = 0;
		} else if (Array.isArray(value) && runId !== undefined) {
			events.push(value as unknown as RuntimeRunnerEvent);
		}

		offset += bytes;
	}

	if (runId === undefined || workflowId === undefined) {
		return { snapshot: null, runOffset: 0 };
	}

	return {
		runOffset,
		snapshot: {
			runId: runId as RunId,
			workflowId,
			status: deriveExecutionProgressStatus('idle', events),
			events,
		},
	};
};

const chainKey = (workflowId: string, sessionId: string): string =>
	`${workflowId}\0${sessionId}`;

/**
 * One JSON record per workflow session under
 * `.langflower/sessions/<workflowId>/<label>.json`, plus
 * `<label>.feed.jsonl` and `<label>/uploads/<fileId>`.
 * `write`, `update`, and `delete` share a
 * per-session promise chain so Windows renames cannot overlap.
 * `exclusiveDirectory` serializes the first write of a new tab: the
 * per-session chain does not, because two new sessions have different ids
 * and the same label path until that write lands.
 */
export class WorkflowSessionStore {
	private readonly chains = new Map<string, Promise<unknown>>();
	/** One chain per workflow directory for ordinal allocation + first write. */
	private readonly directoryChains = new Map<string, Promise<unknown>>();
	/** `workflowId\\0sessionId` → tab label (the filename stem). */
	private readonly labels = new Map<string, string>();

	constructor(private readonly projectDir: string) {}

	private sessionsRoot(): string {
		return path.join(this.projectDir, '.langflower', 'sessions');
	}

	private workflowDir(workflowId: string): string {
		return path.join(this.sessionsRoot(), workflowId);
	}

	private sessionPath(workflowId: string, label: string): string {
		return path.join(this.workflowDir(workflowId), `${label}.json`);
	}

	private feedPath(workflowId: string, label: string): string {
		return path.join(this.workflowDir(workflowId), `${label}.feed.jsonl`);
	}

	private uploadsDir(workflowId: string, label: string): string {
		return path.join(this.workflowDir(workflowId), label, 'uploads');
	}

	private isUnderSessions(target: string): boolean {
		const relative = path.relative(
			path.resolve(this.sessionsRoot()),
			path.resolve(target),
		);
		const segments = relative.split(path.sep);
		return (
			segments.length > 0 &&
			segments.every((segment) => segment !== '' && segment !== '..')
		);
	}

	private uploadLocation(
		workflowId: string,
		label: string,
		fileId: string,
	): { readonly bytesPath: string; readonly metaPath: string } | undefined {
		if (!isSessionUploadFileId(fileId) || !isSafeWorkflowSessionId(label)) {
			return undefined;
		}

		const bytesPath = path.join(this.uploadsDir(workflowId, label), fileId);
		const metaPath = `${bytesPath}.meta.json`;

		if (
			!this.isUnderSessions(bytesPath) ||
			!this.isUnderSessions(metaPath)
		) {
			return undefined;
		}

		return { bytesPath, metaPath };
	}

	private async removeUploadsDir(
		workflowId: string,
		label: string,
	): Promise<void> {
		if (!isSafeWorkflowSessionId(label)) {
			return;
		}

		await fs.rm(this.uploadsDir(workflowId, label), {
			recursive: true,
			force: true,
		});
	}

	private remember(workflowId: string, session: WorkflowSessionFile): void {
		this.labels.set(chainKey(workflowId, session.sessionId), session.label);
	}

	private forget(workflowId: string, sessionId: string): void {
		this.labels.delete(chainKey(workflowId, sessionId));
	}

	private invalidId(
		id: string,
		label: string,
	): WorkflowSessionStoreResult<never> | undefined {
		if (isSafeWorkflowSessionId(id)) {
			return undefined;
		}

		return failure('INVALID_ID', `${label} must be a single path segment`);
	}

	private exclusive<T>(
		workflowId: string,
		sessionId: string,
		task: () => Promise<T>,
	): Promise<T> {
		const key = chainKey(workflowId, sessionId);
		const previous = this.chains.get(key) ?? Promise.resolve();
		const result = previous.then(task, task);
		this.chains.set(
			key,
			result.then(
				() => undefined,
				() => undefined,
			),
		);
		return result;
	}

	/**
	 * Hold the workflow directory while `task` allocates an ordinal and
	 * writes the new session file. Do not call this again from `task`.
	 */
	exclusiveDirectory<T>(
		workflowId: string,
		task: () => Promise<T>,
	): Promise<T> {
		const previous =
			this.directoryChains.get(workflowId) ?? Promise.resolve();
		const result = previous.then(task, task);
		this.directoryChains.set(
			workflowId,
			result.then(
				() => undefined,
				() => undefined,
			),
		);
		return result;
	}

	async list(
		workflowId: string,
		options?: { readonly allowIdentityMismatch?: boolean },
	): Promise<WorkflowSessionStoreResult<readonly WorkflowSessionSummary[]>> {
		const invalid = this.invalidId(workflowId, 'workflowId');

		if (invalid !== undefined) {
			return invalid;
		}

		let entries: string[];

		try {
			entries = await fs.readdir(this.workflowDir(workflowId));
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return { ok: true, value: [] };
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}

		const summaries = await Promise.all(
			entries
				.filter((entry) => entry.endsWith('.json'))
				.map(
					async (
						entry,
					): Promise<WorkflowSessionSummary | undefined> => {
						const stem = path.basename(entry, '.json');

						if (!isSafeWorkflowSessionId(stem)) {
							return undefined;
						}

						const loaded = await this.readByStem(
							workflowId,
							stem,
							options,
						);

						if (!loaded.ok) {
							if (loaded.code !== 'CORRUPT') {
								return undefined;
							}

							const epoch = new Date(0).toISOString();

							return {
								sessionId: stem,
								label: stem,
								createdAt: epoch,
								updatedAt: epoch,
								corrupt: true as const,
							} satisfies WorkflowSessionSummary;
						}

						this.remember(workflowId, loaded.value);

						return {
							sessionId: loaded.value.sessionId,
							label: loaded.value.label,
							createdAt: loaded.value.createdAt,
							updatedAt: loaded.value.updatedAt,
						} satisfies WorkflowSessionSummary;
					},
				),
		);

		return {
			ok: true,
			value: summaries
				.filter(
					(entry): entry is WorkflowSessionSummary =>
						entry !== undefined,
				)
				.sort((left, right) => {
					const byTime = (
						left.createdAt ?? left.updatedAt
					).localeCompare(right.createdAt ?? right.updatedAt);

					return byTime !== 0
						? byTime
						: left.sessionId.localeCompare(right.sessionId);
				}),
		};
	}

	async read(
		workflowId: string,
		sessionId: string,
		options?: { readonly allowIdentityMismatch?: boolean },
	): Promise<WorkflowSessionStoreResult<WorkflowSessionFile>> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		let last: WorkflowSessionStoreResult<WorkflowSessionFile> | undefined;

		for (let attempt = 0; attempt < ORDINAL_READ_ATTEMPTS; attempt += 1) {
			last = await this.readUnlocked(workflowId, sessionId, options);

			if (
				last.ok ||
				last.code !== 'CORRUPT' ||
				last.message !== 'Session JSON is not parseable'
			) {
				return last;
			}

			await delay(ORDINAL_READ_DELAY_MS);
		}

		return (
			last ?? failure('CORRUPT', 'Session JSON is not parseable', true)
		);
	}

	/**
	 * Read one `<label>.json`. `copyFile` over the live file can be seen
	 * mid-replace.
	 */
	private async readByStem(
		workflowId: string,
		stem: string,
		options?: { readonly allowIdentityMismatch?: boolean },
	): Promise<WorkflowSessionStoreResult<WorkflowSessionFile>> {
		let text: string;

		try {
			text = await fs.readFile(
				this.sessionPath(workflowId, stem),
				'utf8',
			);
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return failure(
					'NOT_FOUND',
					`No workflow session ${workflowId}/${stem}`,
				);
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}

		let parsed: unknown;

		try {
			parsed = JSON.parse(text) as unknown;
		} catch {
			return failure('CORRUPT', 'Session JSON is not parseable', true);
		}

		const session = parseSession(parsed);

		if ('corrupt' in session) {
			return failure('CORRUPT', session.message, true);
		}

		if (session.label !== stem) {
			return failure(
				'CORRUPT',
				'Session label does not match path',
				true,
			);
		}

		if (
			options?.allowIdentityMismatch !== true &&
			session.workflowId !== workflowId
		) {
			return failure(
				'CORRUPT',
				'Session identity does not match path',
				true,
			);
		}

		return { ok: true, value: session };
	}

	/**
	 * One read. `copyFile` over the live file can be seen mid-replace.
	 * `read` retries that parse failure. This stays off the write chain so
	 * an `update` mutator can read the file it already holds.
	 */
	private async readUnlocked(
		workflowId: string,
		sessionId: string,
		options?: { readonly allowIdentityMismatch?: boolean },
	): Promise<WorkflowSessionStoreResult<WorkflowSessionFile>> {
		const cached = this.labels.get(chainKey(workflowId, sessionId));

		if (cached !== undefined) {
			const loaded = await this.readByStem(workflowId, cached, options);

			if (loaded.ok && loaded.value.sessionId === sessionId) {
				return loaded;
			}

			this.forget(workflowId, sessionId);
		}

		let entries: string[];

		try {
			entries = await fs.readdir(this.workflowDir(workflowId));
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return failure(
					'NOT_FOUND',
					`No workflow session ${workflowId}/${sessionId}`,
				);
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}

		for (const entry of entries) {
			if (!entry.endsWith('.json')) {
				continue;
			}

			const stem = path.basename(entry, '.json');

			if (!isSafeWorkflowSessionId(stem)) {
				continue;
			}

			const loaded = await this.readByStem(workflowId, stem, options);

			if (!loaded.ok) {
				continue;
			}

			this.remember(workflowId, loaded.value);

			if (loaded.value.sessionId === sessionId) {
				return loaded;
			}
		}

		if (isSafeWorkflowSessionId(sessionId)) {
			const byStem = await this.readByStem(
				workflowId,
				sessionId,
				options,
			);

			if (!byStem.ok && byStem.code === 'CORRUPT') {
				return byStem;
			}
		}

		return failure(
			'NOT_FOUND',
			`No workflow session ${workflowId}/${sessionId}`,
		);
	}

	private async writeFile(
		session: WorkflowSessionFile,
	): Promise<WorkflowSessionStoreResult<WorkflowSessionFile>> {
		const invalid =
			this.invalidId(session.workflowId, 'workflowId') ??
			this.invalidId(session.sessionId, 'sessionId') ??
			this.invalidId(session.label, 'label');

		if (invalid !== undefined) {
			return invalid;
		}

		try {
			await atomicWriteJson(
				this.sessionPath(session.workflowId, session.label),
				session,
			);
			this.remember(session.workflowId, session);
			return { ok: true, value: session };
		} catch (error) {
			return failure('WRITE_FAILED', errorMessage(error));
		}
	}

	async write(
		session: WorkflowSessionFile,
	): Promise<WorkflowSessionStoreResult<WorkflowSessionFile>> {
		const invalid =
			this.invalidId(session.workflowId, 'workflowId') ??
			this.invalidId(session.sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		return this.exclusive(session.workflowId, session.sessionId, () =>
			this.writeFile(session),
		);
	}

	/**
	 * Read-modify-write on the session chain. The mutator must not call
	 * `write` or `delete` for the same file (that waits on this chain).
	 */
	async update(
		workflowId: string,
		sessionId: string,
		mutate: (
			current: WorkflowSessionFile,
		) => WorkflowSessionFile | Promise<WorkflowSessionFile>,
	): Promise<WorkflowSessionStoreResult<WorkflowSessionFile>> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		return this.exclusive(workflowId, sessionId, async () => {
			const current = await this.read(workflowId, sessionId);

			if (!current.ok) {
				return current;
			}

			const next = await mutate(current.value);
			return this.writeFile(next);
		});
	}

	async delete(
		workflowId: string,
		sessionId: string,
	): Promise<WorkflowSessionStoreResult<true>> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		return this.exclusive(workflowId, sessionId, async () => {
			const label =
				this.labels.get(chainKey(workflowId, sessionId)) ?? sessionId;
			const jsonPath = this.sessionPath(workflowId, label);
			const feed = this.feedPath(workflowId, label);

			try {
				await fs.unlink(jsonPath);
			} catch (error) {
				if (!isErrnoCode(error, 'ENOENT')) {
					return failure('WRITE_FAILED', errorMessage(error));
				}

				const resolved = await this.read(workflowId, sessionId);

				if (!resolved.ok) {
					return failure(
						'NOT_FOUND',
						`No workflow session ${workflowId}/${sessionId}`,
					);
				}

				await fs.unlink(
					this.sessionPath(workflowId, resolved.value.label),
				);
				await fs
					.unlink(this.feedPath(workflowId, resolved.value.label))
					.catch(() => undefined);

				try {
					await this.removeUploadsDir(
						workflowId,
						resolved.value.label,
					);
				} catch (removeError) {
					return failure('WRITE_FAILED', errorMessage(removeError));
				}

				this.forget(workflowId, sessionId);
				return { ok: true as const, value: true as const };
			}

			await fs.unlink(feed).catch(() => undefined);

			try {
				await this.removeUploadsDir(workflowId, label);
			} catch (removeError) {
				return failure('WRITE_FAILED', errorMessage(removeError));
			}

			this.forget(workflowId, sessionId);
			return { ok: true as const, value: true as const };
		});
	}

	/**
	 * Stage one allowlisted file under the session's uploads directory.
	 * The disk name is a new `fileId`. Nothing is written when the session
	 * file is missing, the MIME is foreign, or the body is not under 50 MB.
	 */
	async writeUpload(
		workflowId: string,
		sessionId: string,
		input: {
			readonly name: string;
			readonly mimeType: string;
			readonly bytes: Buffer;
		},
	): Promise<WorkflowSessionStoreResult<HitlUploadedFile>> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		if (!isSessionUploadMime(input.mimeType)) {
			return failure('MIME', 'MIME type is not allowed');
		}

		const name = sessionUploadFileName(input.name);

		if (name === undefined) {
			return failure('INVALID_NAME', 'File name is required');
		}

		if (!sessionUploadByteLengthAllowed(input.bytes.length)) {
			return failure('TOO_LARGE', 'File must be under 50 MB');
		}

		return this.exclusive(workflowId, sessionId, async () => {
			const loaded = await this.read(workflowId, sessionId);

			if (!loaded.ok) {
				return loaded;
			}

			const fileId = crypto.randomUUID();
			const location = this.uploadLocation(
				workflowId,
				loaded.value.label,
				fileId,
			);

			if (location === undefined) {
				return failure(
					'INVALID_ID',
					'Upload path escapes the session directory',
				);
			}

			const uploaded: HitlUploadedFile = {
				fileId,
				name,
				mimeType: input.mimeType,
				size: input.bytes.length,
			};
			const tempPath = path.join(
				path.dirname(location.bytesPath),
				`.${fileId}.${crypto.randomUUID()}.tmp`,
			);

			try {
				await fs.mkdir(path.dirname(location.bytesPath), {
					recursive: true,
				});
				await fs.writeFile(tempPath, input.bytes);
				await fs.copyFile(tempPath, location.bytesPath);
				await atomicWriteJson(location.metaPath, uploaded);
			} catch (error) {
				await fs.unlink(location.bytesPath).catch(() => undefined);
				await fs.unlink(location.metaPath).catch(() => undefined);
				return failure('WRITE_FAILED', errorMessage(error));
			} finally {
				await fs.unlink(tempPath).catch(() => undefined);
			}

			return { ok: true as const, value: uploaded };
		});
	}

	/** Bytes and metadata for one upload on an existing session. */
	async readUpload(
		workflowId: string,
		sessionId: string,
		fileId: string,
	): Promise<
		WorkflowSessionStoreResult<{
			readonly file: HitlUploadedFile;
			readonly bytes: Buffer;
		}>
	> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		if (!isSessionUploadFileId(fileId)) {
			return failure('INVALID_ID', 'fileId is not valid');
		}

		const loaded = await this.read(workflowId, sessionId);

		if (!loaded.ok) {
			return loaded;
		}

		const location = this.uploadLocation(
			workflowId,
			loaded.value.label,
			fileId,
		);

		if (location === undefined) {
			return failure(
				'INVALID_ID',
				'Upload path escapes the session directory',
			);
		}

		let bytes: Buffer;

		try {
			bytes = await fs.readFile(location.bytesPath);
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return failure('NOT_FOUND', 'Upload was not found');
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}

		let text: string;

		try {
			text = await fs.readFile(location.metaPath, 'utf8');
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return failure('NOT_FOUND', 'Upload was not found');
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}

		let parsed: unknown;

		try {
			parsed = JSON.parse(text) as unknown;
		} catch {
			return failure('NOT_FOUND', 'Upload was not found');
		}

		const file = uploadedFileFromMeta(parsed, fileId, bytes.length);

		if (file === undefined) {
			return failure('NOT_FOUND', 'Upload was not found');
		}

		return { ok: true, value: { file, bytes } };
	}

	/**
	 * Remove `<label>/uploads` for one session. The session JSON stays.
	 * Reset calls this. Continue-from does not.
	 */
	async deleteUploads(
		workflowId: string,
		sessionId: string,
	): Promise<WorkflowSessionStoreResult<true>> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		return this.exclusive(workflowId, sessionId, async () => {
			const loaded = await this.read(workflowId, sessionId);

			if (!loaded.ok) {
				return loaded;
			}

			try {
				await this.removeUploadsDir(workflowId, loaded.value.label);
			} catch (error) {
				return failure('WRITE_FAILED', errorMessage(error));
			}

			return { ok: true as const, value: true as const };
		});
	}

	async deleteAll(
		workflowId: string,
	): Promise<WorkflowSessionStoreResult<true>> {
		const invalid = this.invalidId(workflowId, 'workflowId');

		if (invalid !== undefined) {
			return invalid;
		}

		try {
			await fs.rm(this.workflowDir(workflowId), {
				recursive: true,
				force: true,
			});
			this.labels.clear();
			return { ok: true, value: true };
		} catch (error) {
			return failure('WRITE_FAILED', errorMessage(error));
		}
	}

	async moveAll(
		fromWorkflowId: string,
		toWorkflowId: string,
	): Promise<WorkflowSessionStoreResult<boolean>> {
		const invalid =
			this.invalidId(fromWorkflowId, 'workflowId') ??
			this.invalidId(toWorkflowId, 'workflowId');

		if (invalid !== undefined) {
			return invalid;
		}

		if (fromWorkflowId === toWorkflowId) {
			return { ok: true, value: false };
		}

		const fromDir = this.workflowDir(fromWorkflowId);
		const toDir = this.workflowDir(toWorkflowId);

		try {
			await fs.access(fromDir);
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return { ok: true, value: false };
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}

		try {
			await fs.access(toDir);
			return failure(
				'WRITE_FAILED',
				'Destination session directory already exists',
			);
		} catch (error) {
			if (!isErrnoCode(error, 'ENOENT')) {
				return failure('WRITE_FAILED', errorMessage(error));
			}
		}

		try {
			await fs.mkdir(path.dirname(toDir), { recursive: true });
			await fs.rename(fromDir, toDir);
			this.labels.clear();
			return { ok: true, value: true };
		} catch (error) {
			return failure('WRITE_FAILED', errorMessage(error));
		}
	}

	async nextOrdinal(
		workflowId: string,
		localDay: string,
	): Promise<WorkflowSessionStoreResult<number>> {
		const invalid = this.invalidId(workflowId, 'workflowId');

		if (invalid !== undefined) {
			return invalid;
		}

		let entries: string[];

		try {
			entries = await fs.readdir(this.workflowDir(workflowId));
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return { ok: true, value: 1 };
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}

		const stems = entries
			.filter((entry) => entry.endsWith('.json'))
			.map((entry) => path.basename(entry, '.json'))
			.filter((stem) => isSafeWorkflowSessionId(stem));

		let max = 0;

		for (const stem of stems) {
			const loaded = await this.readStemForOrdinal(workflowId, stem);

			if (!loaded.ok) {
				return loaded;
			}

			if (
				loaded.value === undefined ||
				loaded.value.localDay !== localDay
			) {
				continue;
			}

			max = Math.max(max, loaded.value.ordinal);
		}

		return { ok: true, value: max + 1 };
	}

	/**
	 * A replace can be read mid-copy. Retry a torn or missing file.
	 * A file that stays corrupt is not a session. A file that stays
	 * unreadable must not be treated as absent, or the next tab is `#1`.
	 */
	/**
	 * Latest run in the feed log. `snapshot` is null before the first marker.
	 */
	async readFeedHead(
		workflowId: string,
		sessionId: string,
	): Promise<
		WorkflowSessionStoreResult<{
			readonly snapshot: ExecutionFeedSnapshotPayload | null;
			readonly runOffset: number;
			readonly size: number;
		}>
	> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		const loaded = await this.read(workflowId, sessionId);

		if (!loaded.ok) {
			return loaded;
		}

		return this.readFeedFile(
			loaded.value.label,
			workflowId,
			loaded.value.headOffset,
		);
	}

	/** Feed slice `[runOffset, feedOffset)` for one point. */
	async readFeedSlice(
		workflowId: string,
		sessionId: string,
		runOffset: number,
		feedOffset: number,
	): Promise<
		WorkflowSessionStoreResult<ExecutionFeedSnapshotPayload | null>
	> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		const loaded = await this.read(workflowId, sessionId);

		if (!loaded.ok) {
			return loaded;
		}

		const file = await this.readFeedText(workflowId, loaded.value.label);

		if (!file.ok) {
			return file;
		}

		const end = Math.min(feedOffset, Buffer.byteLength(file.value));
		const start = Math.min(runOffset, end);
		const slice = Buffer.from(file.value)
			.subarray(start, end)
			.toString('utf8');
		const parsed = parseFeedLog(slice, Buffer.byteLength(slice));

		return { ok: true, value: parsed.snapshot };
	}

	async appendFeed(
		workflowId: string,
		sessionId: string,
		chunk: string,
	): Promise<
		WorkflowSessionStoreResult<{
			readonly sizeBefore: number;
			readonly sizeAfter: number;
		}>
	> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		return this.exclusive(workflowId, sessionId, async () => {
			const loaded = await this.read(workflowId, sessionId);

			if (!loaded.ok) {
				return loaded;
			}

			const filePath = this.feedPath(workflowId, loaded.value.label);
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			let sizeBefore = 0;

			try {
				sizeBefore = (await fs.stat(filePath)).size;
			} catch (error) {
				if (!isErrnoCode(error, 'ENOENT')) {
					return failure('WRITE_FAILED', errorMessage(error));
				}
			}

			try {
				await fs.appendFile(filePath, chunk, 'utf8');
			} catch (error) {
				return failure('WRITE_FAILED', errorMessage(error));
			}

			return {
				ok: true as const,
				value: {
					sizeBefore,
					sizeAfter: sizeBefore + Buffer.byteLength(chunk),
				},
			};
		});
	}

	async truncateFeed(
		workflowId: string,
		sessionId: string,
		byteLength: number,
	): Promise<WorkflowSessionStoreResult<true>> {
		const invalid =
			this.invalidId(workflowId, 'workflowId') ??
			this.invalidId(sessionId, 'sessionId');

		if (invalid !== undefined) {
			return invalid;
		}

		return this.exclusive(workflowId, sessionId, async () => {
			const loaded = await this.read(workflowId, sessionId);

			if (!loaded.ok) {
				return loaded;
			}

			const filePath = this.feedPath(workflowId, loaded.value.label);

			try {
				await fs.truncate(filePath, byteLength);
			} catch (error) {
				if (!isErrnoCode(error, 'ENOENT')) {
					return failure('WRITE_FAILED', errorMessage(error));
				}

				if (byteLength === 0) {
					return { ok: true as const, value: true as const };
				}

				return failure('WRITE_FAILED', errorMessage(error));
			}

			return { ok: true as const, value: true as const };
		});
	}

	private async readFeedFile(
		label: string,
		workflowId: string,
		headOffset: number | null,
	): Promise<
		WorkflowSessionStoreResult<{
			readonly snapshot: ExecutionFeedSnapshotPayload | null;
			readonly runOffset: number;
			readonly size: number;
		}>
	> {
		const file = await this.readFeedText(workflowId, label);

		if (!file.ok) {
			return file;
		}

		const size = Buffer.byteLength(file.value);
		const limit = headOffset === null ? size : Math.min(headOffset, size);
		const parsed = parseFeedLog(file.value, limit);

		return {
			ok: true,
			value: {
				snapshot: parsed.snapshot,
				runOffset: parsed.runOffset,
				size,
			},
		};
	}

	private async readFeedText(
		workflowId: string,
		label: string,
	): Promise<WorkflowSessionStoreResult<string>> {
		try {
			return {
				ok: true,
				value: await fs.readFile(
					this.feedPath(workflowId, label),
					'utf8',
				),
			};
		} catch (error) {
			if (isErrnoCode(error, 'ENOENT')) {
				return { ok: true, value: '' };
			}

			return failure('WRITE_FAILED', errorMessage(error));
		}
	}

	private async readStemForOrdinal(
		workflowId: string,
		stem: string,
	): Promise<WorkflowSessionStoreResult<WorkflowSessionFile | undefined>> {
		let last: WorkflowSessionStoreResult<WorkflowSessionFile> | undefined;

		for (let attempt = 0; attempt < ORDINAL_READ_ATTEMPTS; attempt += 1) {
			const loaded = await this.readByStem(workflowId, stem);

			if (loaded.ok) {
				this.remember(workflowId, loaded.value);
				return loaded;
			}

			last = loaded;
			const retryable =
				loaded.code === 'NOT_FOUND' ||
				loaded.code === 'CORRUPT' ||
				loaded.code === 'WRITE_FAILED';

			if (!retryable || attempt === ORDINAL_READ_ATTEMPTS - 1) {
				break;
			}

			await delay(ORDINAL_READ_DELAY_MS);
		}

		if (last?.ok === false && last.code === 'CORRUPT') {
			return { ok: true, value: undefined };
		}

		return (
			last ?? failure('WRITE_FAILED', 'Session file could not be read')
		);
	}
}
