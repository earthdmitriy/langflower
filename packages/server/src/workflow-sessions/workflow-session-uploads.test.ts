import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import type { HitlUploadedFile } from '@langflower/node-sdk';
import type { WorkflowSessionFile } from '@langflower/shared/types/workflow-session.js';
import express, { type Express } from 'express';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mountSessionUploadRoutes } from '../api/session-upload-routes.js';
import { LangflowerSession } from '../session/langflower-session.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { resetWorkflowSessionConversation } from './workflow-session-actions.js';
import { WorkflowSessionAutosave } from './workflow-session-autosave.js';
import { applyPointToSessionHead } from './workflow-session-run.js';
import {
	createSessionUploadRawOptions,
	isSessionUploadFileId,
	isSessionUploadMime,
	SESSION_UPLOAD_MAX_BYTES,
	SESSION_UPLOAD_MIME_TYPES,
	SESSION_UPLOAD_NAME_HEADER,
	SESSION_UPLOAD_ROUTE,
	sessionUploadByteLengthAllowed,
} from './session-upload.js';
import { WorkflowSessionStore } from './workflow-session-store.js';

const resolveDefinition: ResolveNodeDefinition = resolveWorkflowNodeDefinition;

const WORKFLOW_ID = 'demo';
const SESSION_ID = 'session-1';
const LABEL = '2026-10-14 #1';

const ALLOWED_FILES = [
	{ mimeType: 'image/png', name: 'pixel.png' },
	{ mimeType: 'image/jpeg', name: 'pixel.jpg' },
	{ mimeType: 'image/gif', name: 'pixel.gif' },
	{ mimeType: 'image/webp', name: 'pixel.webp' },
	{ mimeType: 'audio/wav', name: 'clip.wav' },
	{ mimeType: 'audio/mpeg', name: 'clip.mpeg' },
	{ mimeType: 'audio/mp3', name: 'clip.mp3' },
	{ mimeType: 'application/pdf', name: 'note.pdf' },
] as const;

const sessionFile = (): WorkflowSessionFile => ({
	schemaVersion: 1,
	sessionId: SESSION_ID,
	workflowId: WORKFLOW_ID,
	label: LABEL,
	localDay: '2026-10-14',
	ordinal: 1,
	createdAt: '2026-10-14T00:00:00.000Z',
	updatedAt: '2026-10-14T00:00:00.000Z',
	workflowSnapshot: {
		workflowId: WORKFLOW_ID,
		metadata: {
			name: 'Demo',
			createdAt: '2026-10-14T00:00:00.000Z',
			updatedAt: '2026-10-14T00:00:00.000Z',
		},
		graph: {
			viewport: { x: 0, y: 0, scale: 1 },
			nodes: [],
			edges: [],
		},
	},
	nodeStates: { helper: { history: ['head'] } },
	headOffset: null,
	points: [
		{
			pointId: 'point-1',
			runId: 'run-1',
			createdAt: '2026-10-14T01:00:00.000Z',
			workflowFingerprint: 'v1::: ',
			completedNodeIds: [],
			outputSnapshots: {},
			nodeStates: { helper: { history: ['kept'] } },
			runOffset: 0,
			feedOffset: 0,
		},
	],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isHitlUploadedFile = (value: unknown): value is HitlUploadedFile =>
	isRecord(value) &&
	typeof value.fileId === 'string' &&
	isSessionUploadFileId(value.fileId) &&
	typeof value.name === 'string' &&
	typeof value.mimeType === 'string' &&
	typeof value.size === 'number' &&
	Number.isInteger(value.size);

const exists = async (target: string): Promise<boolean> => {
	try {
		await fs.stat(target);
		return true;
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return false;
		}
		throw error;
	}
};

const uploadsDirectory = (root: string): string =>
	path.join(root, '.langflower', 'sessions', WORKFLOW_ID, LABEL, 'uploads');

type HttpResult = {
	readonly status: number;
	readonly contentType: string;
	readonly body: Buffer;
};

const request = (
	port: number,
	method: 'GET' | 'POST',
	urlPath: string,
	headers: Readonly<Record<string, string>>,
	body?: Buffer,
): Promise<HttpResult> =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port,
				path: urlPath,
				method,
				headers,
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer | string) => {
					chunks.push(
						typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
					);
				});
				res.on('end', () => {
					resolve({
						status: res.statusCode ?? 0,
						contentType: String(res.headers['content-type'] ?? ''),
						body: Buffer.concat(chunks),
					});
				});
			},
		);
		req.on('error', reject);
		if (body !== undefined) {
			req.end(body);
			return;
		}
		req.end();
	});

const postFile = (
	port: number,
	mimeType: string | undefined,
	name: string,
	body: Buffer,
): Promise<HttpResult> =>
	request(
		port,
		'POST',
		SESSION_UPLOAD_ROUTE,
		{
			...(mimeType !== undefined ? { 'content-type': mimeType } : {}),
			[SESSION_UPLOAD_NAME_HEADER]: name,
		},
		body,
	);

describe('session upload ceiling', () => {
	it('keeps the provider per-file ceiling at 50 MB', () => {
		expect(SESSION_UPLOAD_MAX_BYTES).toBe(50 * 1024 * 1024);
		expect(createSessionUploadRawOptions().limit).toBe(
			SESSION_UPLOAD_MAX_BYTES,
		);
		expect(sessionUploadByteLengthAllowed(SESSION_UPLOAD_MAX_BYTES)).toBe(
			false,
		);
		expect(
			sessionUploadByteLengthAllowed(SESSION_UPLOAD_MAX_BYTES - 1),
		).toBe(true);
		expect(isSessionUploadMime('')).toBe(false);
		expect(isSessionUploadMime('video/mp4')).toBe(false);
		expect(SESSION_UPLOAD_MIME_TYPES).toEqual(
			ALLOWED_FILES.map((file) => file.mimeType),
		);
	});
});

describe('session upload routes', () => {
	let projectDir: string | undefined;
	let session: LangflowerSession | undefined;
	let closer: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (closer !== undefined) {
			await closer();
			closer = undefined;
		}
		session?.dispose();
		session = undefined;
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
			projectDir = undefined;
		}
	});

	const start = async (options?: {
		readonly bound?: boolean;
		readonly seed?: boolean;
		readonly maxBytes?: number;
	}): Promise<{
		readonly port: number;
		readonly store: WorkflowSessionStore;
	}> => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-upload-'));
		const store = new WorkflowSessionStore(projectDir);
		session = new LangflowerSession();
		const bound = options?.bound !== false;
		const seed = options?.seed !== false;

		if (seed) {
			const file = sessionFile();
			await store.write(file);
			session.activeWorkflow = file.workflowSnapshot;
		}

		session.activeWorkflowId = WORKFLOW_ID;
		session.binding = bound
			? { kind: 'workflowSession', sessionId: SESSION_ID }
			: { kind: 'workflow' };

		const app: Express = express();
		if (options?.maxBytes !== undefined) {
			mountSessionUploadRoutes(
				app,
				{ session, store },
				{ maxBytes: options.maxBytes },
			);
		} else {
			mountSessionUploadRoutes(app, { session, store });
		}

		const server = http.createServer(app);
		const port = await new Promise<number>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				const address = server.address();
				if (address === null || typeof address === 'string') {
					reject(new Error('expected a TCP port'));
					return;
				}
				resolve(address.port);
			});
		});

		closer = async () => {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		};

		return { port, store };
	};

	it('stores an allowlisted MIME and GET returns the same bytes', async () => {
		const { port } = await start();
		const root = projectDir;
		if (root === undefined) {
			throw new Error('expected a project directory');
		}

		for (const file of ALLOWED_FILES) {
			const payload = Buffer.from(`bytes-${file.mimeType}`);
			const posted = await postFile(
				port,
				file.mimeType,
				file.name,
				payload,
			);
			expect(posted.status).toBe(200);
			const uploaded: unknown = JSON.parse(posted.body.toString('utf8'));
			expect(isHitlUploadedFile(uploaded)).toBe(true);
			if (!isHitlUploadedFile(uploaded)) {
				return;
			}
			expect(uploaded).toEqual({
				fileId: uploaded.fileId,
				name: file.name,
				mimeType: file.mimeType,
				size: payload.length,
			});

			const directory = uploadsDirectory(root);
			const names = await fs.readdir(directory);
			expect(names).toContain(uploaded.fileId);
			expect(names).not.toContain(file.name);
			expect(
				await fs.readFile(path.join(directory, uploaded.fileId)),
			).toEqual(payload);

			const got = await request(
				port,
				'GET',
				`${SESSION_UPLOAD_ROUTE}/${uploaded.fileId}`,
				{},
			);
			expect(got.status).toBe(200);
			expect(got.contentType).toBe(file.mimeType);
			expect(got.body).toEqual(payload);
		}
	});

	it('does not store a foreign MIME or an empty MIME', async () => {
		const { port } = await start();
		const root = projectDir;
		if (root === undefined) {
			throw new Error('expected a project directory');
		}
		const payload = Buffer.from('nope');
		const foreign = [
			'video/mp4',
			'text/plain',
			'application/octet-stream',
			'Image/PNG',
			'image/png; charset=utf-8',
			' ',
		];

		for (const mimeType of foreign) {
			const posted = await postFile(port, mimeType, 'clip.mp4', payload);
			expect(posted.status).toBe(415);
		}

		const omitted = await postFile(port, undefined, 'clip.mp4', payload);
		expect(omitted.status).toBe(415);
		expect(await exists(uploadsDirectory(root))).toBe(false);
	});

	it('refuses a body at a stand-in ceiling and does not write it', async () => {
		const { port } = await start({ maxBytes: 8 });
		const root = projectDir;
		if (root === undefined) {
			throw new Error('expected a project directory');
		}

		const atCeiling = await postFile(
			port,
			'image/png',
			'exact.png',
			Buffer.alloc(8, 1),
		);
		expect(atCeiling.status).toBe(413);
		expect(await exists(uploadsDirectory(root))).toBe(false);

		const under = await postFile(
			port,
			'image/png',
			'under.png',
			Buffer.alloc(7, 1),
		);
		expect(under.status).toBe(200);
	});

	it('refuses a Content-Length over 50 MB and does not write it', async () => {
		const { port } = await start();
		const root = projectDir;
		if (root === undefined) {
			throw new Error('expected a project directory');
		}
		const head = [
			`POST ${SESSION_UPLOAD_ROUTE} HTTP/1.1`,
			'Host: 127.0.0.1',
			'Content-Type: image/png',
			`${SESSION_UPLOAD_NAME_HEADER}: big.png`,
			`Content-Length: ${String(SESSION_UPLOAD_MAX_BYTES + 1)}`,
			'',
			'',
		].join('\r\n');

		const raw = await new Promise<string>((resolve, reject) => {
			const chunks: Buffer[] = [];
			const socket = net.connect({ host: '127.0.0.1', port }, () => {
				socket.write(head);
			});
			const timer = setTimeout(() => {
				socket.destroy();
				reject(new Error('timed out waiting for the 50 MB refusal'));
			}, 1500);
			socket.on('data', (chunk: Buffer) => {
				chunks.push(chunk);
				const text = Buffer.concat(chunks).toString('utf8');
				if (text.includes('\r\n\r\n')) {
					clearTimeout(timer);
					socket.destroy();
					resolve(text);
				}
			});
			socket.on('error', (error) => {
				clearTimeout(timer);
				reject(error);
			});
		});

		const status = Number(/^HTTP\/1\.[01] (\d+)/.exec(raw)?.[1] ?? '0');
		expect(status).toBe(413);
		expect(await exists(uploadsDirectory(root))).toBe(false);
	});

	it('writes nothing when no workflow session is bound', async () => {
		const { port } = await start({ bound: false });
		const root = projectDir;
		if (root === undefined) {
			throw new Error('expected a project directory');
		}

		const posted = await postFile(
			port,
			'image/png',
			'pixel.png',
			Buffer.from('png'),
		);
		expect(posted.status).toBe(409);
		expect(
			await exists(
				path.join(
					root,
					'.langflower',
					'sessions',
					WORKFLOW_ID,
					`${LABEL}.json`,
				),
			),
		).toBe(true);
		expect(await exists(uploadsDirectory(root))).toBe(false);
	});

	it('writes nothing when the bound session file is missing', async () => {
		const { port } = await start({ seed: false });
		const root = projectDir;
		if (root === undefined) {
			throw new Error('expected a project directory');
		}

		const posted = await postFile(
			port,
			'image/png',
			'pixel.png',
			Buffer.from('png'),
		);
		expect(posted.status).toBe(404);
		expect(await exists(path.join(root, '.langflower', 'sessions'))).toBe(
			false,
		);
	});

	it('reset removes the uploads directory and continue from a point keeps it', async () => {
		const { port, store } = await start();
		const root = projectDir;
		const bound = session;
		if (root === undefined || bound === undefined) {
			throw new Error('expected a bound session');
		}
		const payload = Buffer.from('kept-bytes');
		const posted = await postFile(port, 'image/png', 'pixel.png', payload);
		const uploaded: unknown = JSON.parse(posted.body.toString('utf8'));
		if (!isHitlUploadedFile(uploaded)) {
			throw new Error('expected HitlUploadedFile');
		}
		const bytesPath = path.join(uploadsDirectory(root), uploaded.fileId);
		expect(await fs.readFile(bytesPath)).toEqual(payload);

		const saved = await store.read(WORKFLOW_ID, SESSION_ID);
		if (!saved.ok) {
			throw new Error('expected a session file');
		}
		const point = saved.value.points[0];
		if (point === undefined) {
			throw new Error('expected a point');
		}
		bound.headNodeStates = { helper: { history: ['later'] } };
		await applyPointToSessionHead(bound, store, point);

		expect(await fs.readFile(bytesPath)).toEqual(payload);
		const kept = await request(
			port,
			'GET',
			`${SESSION_UPLOAD_ROUTE}/${uploaded.fileId}`,
			{},
		);
		expect(kept.status).toBe(200);
		expect(kept.body).toEqual(payload);
		const afterContinue = await store.read(WORKFLOW_ID, SESSION_ID);
		expect(afterContinue.ok).toBe(true);
		if (afterContinue.ok) {
			expect(
				afterContinue.value.points.map((entry) => entry.pointId),
			).toEqual(['point-1']);
			expect(afterContinue.value.nodeStates).toEqual(point.nodeStates);
		}

		const workflowService = new WorkflowService(root, resolveDefinition);
		const autosave = new WorkflowSessionAutosave(bound, store);
		bound.attachWorkflowSessionAutosave(autosave);
		const deps = {
			session: bound,
			store,
			workflowService,
			resolveDefinition,
			autosave,
		};

		bound.runnerStatus = 'running';
		const refused = await resetWorkflowSessionConversation(
			deps,
			SESSION_ID,
		);
		expect(refused.ok).toBe(false);
		if (!refused.ok) {
			expect(refused.code).toBe('RUN_ACTIVE');
		}
		expect(await exists(bytesPath)).toBe(true);

		bound.runnerStatus = 'idle';
		const reset = await resetWorkflowSessionConversation(deps, SESSION_ID);
		expect(reset).toEqual({
			ok: true,
			canvasChanged: false,
			feedChanged: true,
		});
		expect(await exists(uploadsDirectory(root))).toBe(false);
		const afterReset = await store.read(WORKFLOW_ID, SESSION_ID);
		expect(afterReset.ok).toBe(true);
		if (afterReset.ok) {
			expect(afterReset.value.nodeStates).toEqual({});
			expect(afterReset.value.points).toEqual([]);
			expect(afterReset.value.label).toBe(LABEL);
		}
		const gone = await request(
			port,
			'GET',
			`${SESSION_UPLOAD_ROUTE}/${uploaded.fileId}`,
			{},
		);
		expect(gone.status).toBe(404);
	});

	it('deletes uploads when the session file is deleted', async () => {
		const { port, store } = await start();
		const root = projectDir;
		if (root === undefined) {
			throw new Error('expected a project directory');
		}
		const posted = await postFile(
			port,
			'image/png',
			'pixel.png',
			Buffer.from('gone'),
		);
		expect(posted.status).toBe(200);
		expect(await exists(uploadsDirectory(root))).toBe(true);

		const removed = await store.delete(WORKFLOW_ID, SESSION_ID);
		expect(removed).toEqual({ ok: true, value: true });
		expect(await exists(uploadsDirectory(root))).toBe(false);
		expect(
			await exists(
				path.join(
					root,
					'.langflower',
					'sessions',
					WORKFLOW_ID,
					`${LABEL}.json`,
				),
			),
		).toBe(false);
	});
});
