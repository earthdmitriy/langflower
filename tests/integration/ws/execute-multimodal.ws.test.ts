import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { filter, firstValueFrom, take } from 'rxjs';
import type { WorkflowSavePayload } from '@langflower/shared/types/langflower-workflow.js';
import {
	interruptRunner,
	waitForRunnerOutput,
	waitSessionReady,
	type LangflowerWsClient,
} from '@langflower/shared/langflower-ws-waits';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';
import {
	chatInputNode,
	edge,
	hitlReviewGateNode,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
	toolPermissionsFromEnabledIds,
} from '../helpers/workflow-scenario-builders.js';
import {
	createLangflowerWsClient,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';

const WORKFLOW_ID = 'multimodal-turn';
const PROVIDER_ID = 'scripted';

type ScriptedReply = {
	/** Hold the HTTP answer until this settles (a turn that is still streaming). */
	readonly gate?: Promise<void>;
} & (
	| { readonly text: string }
	| {
			readonly toolCalls: readonly {
				readonly id: string;
				readonly name: string;
				readonly arguments: Readonly<Record<string, unknown>>;
			}[];
	  }
);

type RecordedMessage = {
	readonly role: string;
	readonly content: unknown;
	readonly tool_call_id?: string;
};

type ScriptedProvider = {
	readonly baseURL: string;
	readonly requests: readonly { readonly messages: RecordedMessage[] }[];
	readonly script: (replies: readonly ScriptedReply[]) => void;
	readonly close: () => Promise<void>;
};

const chunk = (delta: object, finishReason: string | null): string =>
	`data: ${JSON.stringify({
		id: 'chatcmpl-scripted',
		object: 'chat.completion.chunk',
		created: 0,
		model: 'scripted-model',
		choices: [{ index: 0, delta, finish_reason: finishReason }],
	})}\n\n`;

const streamReply = (reply: ScriptedReply): string => {
	if ('text' in reply) {
		return [
			chunk({ role: 'assistant', content: reply.text }, null),
			chunk({}, 'stop'),
			'data: [DONE]\n\n',
		].join('');
	}

	return [
		chunk(
			{
				role: 'assistant',
				tool_calls: reply.toolCalls.map((call, index) => ({
					index,
					id: call.id,
					type: 'function',
					function: {
						name: call.name,
						arguments: JSON.stringify(call.arguments),
					},
				})),
			},
			null,
		),
		chunk({}, 'tool_calls'),
		'data: [DONE]\n\n',
	].join('');
};

/**
 * Local OpenAI-compatible endpoint. Records every outbound
 * `/chat/completions` body and answers from a queue of scripted replies.
 */
const startScriptedProvider = async (): Promise<ScriptedProvider> => {
	const requests: { messages: RecordedMessage[] }[] = [];
	let queue: readonly ScriptedReply[] = [];

	const server = http.createServer((request, response) => {
		const parts: Buffer[] = [];
		request.on('data', (part: Buffer) => parts.push(part));
		request.on('end', () => {
			if (!request.url?.endsWith('/chat/completions')) {
				response.writeHead(404).end();
				return;
			}

			const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as {
				messages: RecordedMessage[];
			};
			requests.push({ messages: body.messages });

			const [reply, ...rest] = queue;
			queue = rest;
			const answer = reply ?? { text: 'no scripted reply' };
			void (answer.gate ?? Promise.resolve()).then(() => {
				response.writeHead(200, {
					'Content-Type': 'text/event-stream',
				});
				response.end(streamReply(answer));
			});
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const { port } = server.address() as AddressInfo;

	return {
		baseURL: `http://127.0.0.1:${port}/v1`,
		requests,
		script: (replies) => {
			queue = replies;
		},
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	};
};

const writeProviderConfig = async (
	projectDir: string,
	baseURL: string,
): Promise<void> => {
	const configPath = path.join(projectDir, '.langflower', 'langflower.jsonc');
	const current = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<
		string,
		unknown
	>;
	await fs.writeFile(
		configPath,
		`${JSON.stringify(
			{
				...current,
				provider: {
					[PROVIDER_ID]: {
						name: 'Scripted',
						options: { baseURL, apiKey: 'sk-test' },
					},
				},
			},
			null,
			'\t',
		)}\n`,
		'utf8',
	);
};

const llmNode = (id: string, tools: readonly string[] = ['read']) => ({
	id,
	type: 'common-openai-llm',
	params: {
		providerId: PROVIDER_ID,
		model: 'scripted-model',
		maxIterations: 4,
		toolPermissions: toolPermissionsFromEnabledIds(tools),
	},
	inputs: {},
	ui: { position: { x: 300, y: 200 }, label: 'Agent' },
});

const multimodalWorkflow = (): WorkflowSavePayload =>
	savePayload(
		WORKFLOW_ID,
		scenarioMetadata(
			'Multimodal turn',
			'Chat Input → OpenAI LLM → Preview (scripted provider)',
		),
		[
			chatInputNode('chat', { x: 40, y: 200 }, 'Chat Input'),
			llmNode('llm'),
			previewNode('preview', { x: 560, y: 200 }, 'Preview'),
		],
		[
			edge('e-chat-llm', 'chat', 'message', 'llm', 'userPrompt'),
			edge('e-llm-preview', 'llm', 'response', 'preview', 'input'),
		],
	);

const reviewGateWorkflow = (): WorkflowSavePayload =>
	savePayload(
		'multimodal-review-gate',
		scenarioMetadata('Review gate', 'Request changes with an image'),
		[
			chatInputNode('chat', { x: 40, y: 200 }, 'Chat Input'),
			llmNode('llm'),
			hitlReviewGateNode('ask', { x: 560, y: 200 }, 'Review'),
		],
		[
			edge('e-chat-llm', 'chat', 'message', 'llm', 'userPrompt'),
			edge('e-llm-ask', 'llm', 'response', 'ask', 'result'),
			edge('e-ask-feedback', 'ask', 'feedback', 'llm', 'feedback'),
		],
	);

const askUserWorkflow = (): WorkflowSavePayload =>
	savePayload(
		'multimodal-ask-user',
		scenarioMetadata('Ask user', 'ask_user reply with an image'),
		[
			chatInputNode('chat', { x: 40, y: 200 }, 'Chat Input'),
			llmNode('llm', ['ask_user']),
			previewNode('preview', { x: 560, y: 200 }, 'Preview'),
		],
		[
			edge('e-chat-llm', 'chat', 'message', 'llm', 'userPrompt'),
			edge('e-llm-preview', 'llm', 'response', 'preview', 'input'),
		],
	);

const stringPromptWorkflow = (): WorkflowSavePayload =>
	savePayload(
		'multimodal-string-prompt',
		scenarioMetadata('String prompt', 'A plain string on the same port'),
		[
			stringNode('prompt', 'plain prompt', { x: 40, y: 200 }, 'Prompt'),
			llmNode('llm'),
			previewNode('preview', { x: 560, y: 200 }, 'Preview'),
		],
		[
			edge('e-prompt-llm', 'prompt', 'value', 'llm', 'userPrompt'),
			edge('e-llm-preview', 'llm', 'response', 'preview', 'input'),
		],
	);

// 1x1 transparent png.
const PNG_BYTES = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64',
);
const WAV_BYTES = Buffer.from('RIFF....WAVEfmt scripted-wav-bytes');
const PDF_BYTES = Buffer.from('%PDF-1.4 scripted-pdf-bytes');

const uploadBytes = async (
	baseUrl: string,
	name: string,
	mimeType: string,
	bytes: Buffer,
): Promise<Response> =>
	fetch(`${baseUrl}/api/session-uploads`, {
		method: 'POST',
		headers: {
			'Content-Type': mimeType,
			'X-Langflower-File-Name': name,
		},
		body: new Uint8Array(bytes),
	});

type UploadedFile = {
	readonly fileId: string;
	readonly name: string;
	readonly mimeType: string;
	readonly size: number;
};

/** Sessions this suite already bound, so a replayed snapshot is not mistaken for the new one. */
const boundSessionIds = new Set<string>();

const bindSession = async (client: LangflowerWsClient): Promise<string> => {
	const bound$ = firstValueFrom(
		client['workflowSession.current.snapshot'].pipe(
			filter(
				(snapshot) =>
					snapshot.sessionId !== null &&
					!boundSessionIds.has(snapshot.sessionId),
			),
			take(1),
		),
	);
	client['workflowSession.create.requested'].next({});
	const snapshot = await bound$;

	if (snapshot.sessionId === null) {
		throw new Error('expected a bound session');
	}

	boundSessionIds.add(snapshot.sessionId);
	return snapshot.sessionId;
};

const listFilesRecursive = async (dir: string): Promise<string[]> => {
	const entries = await fs
		.readdir(dir, { withFileTypes: true })
		.catch(() => []);
	const nested = await Promise.all(
		entries.map((entry) =>
			entry.isDirectory()
				? listFilesRecursive(path.join(dir, entry.name))
				: [path.join(dir, entry.name)],
		),
	);
	return nested.flat();
};

describe('execute multimodal user turns (WS bridge)', () => {
	let projectDir: string;
	let provider: ScriptedProvider;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		provider = await startScriptedProvider();
		projectDir = await createTempProject();
		await writeProviderConfig(projectDir, provider.baseURL);
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	});

	afterEach(async () => {
		try {
			await interruptRunner(client);
		} catch {
			// run may already be idle
		}
	});

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await provider.close();
		await removeTempProject(projectDir);
	});

	it('sends an attached png as image_url, keeps fileId in history, and reset deletes the uploads', async () => {
		await seedWorkflowFromDisk(client, projectDir, multimodalWorkflow());
		const sessionId = await bindSession(client);
		const requestsBefore = provider.requests.length;

		const foreign = await uploadBytes(
			urls.httpBaseUrl,
			'clip.mp4',
			'video/mp4',
			Buffer.from('video'),
		);
		expect(foreign.status).toBe(415);

		const uploaded = await uploadBytes(
			urls.httpBaseUrl,
			'1.png',
			'image/png',
			PNG_BYTES,
		);
		expect(uploaded.status).toBe(200);
		const file = (await uploaded.json()) as UploadedFile;
		expect(file).toMatchObject({
			name: '1.png',
			mimeType: 'image/png',
			size: PNG_BYTES.length,
		});

		const got = await fetch(
			`${urls.httpBaseUrl}/api/session-uploads/${file.fileId}`,
		);
		expect(Buffer.from(await got.arrayBuffer())).toEqual(PNG_BYTES);

		provider.script([{ text: 'a single pixel' }]);
		const reply$ = waitForRunnerOutput(client, {
			nodeId: 'preview',
			portId: 'text',
			predicate: (value) =>
				typeof value === 'string' && value.includes('a single pixel'),
		});
		client['runner.hitl.event'].next({
			nodeId: 'chat',
			portId: 'message',
			payload: { text: 'what is in this picture?', files: [file] },
		});
		await reply$;

		const request = provider.requests[requestsBefore];
		const user = request?.messages.find((m) => m.role === 'user');
		expect(user?.content).toEqual([
			{ type: 'text', text: 'what is in this picture?' },
			{
				type: 'image_url',
				image_url: {
					url: `data:image/png;base64,${PNG_BYTES.toString('base64')}`,
				},
			},
		]);

		await interruptRunner(client);

		const sessionsRoot = path.join(projectDir, '.langflower', 'sessions');
		const onDisk = await listFilesRecursive(
			path.join(sessionsRoot, WORKFLOW_ID),
		);
		const base64 = PNG_BYTES.toString('base64');
		const persisted = await Promise.all(
			onDisk
				.filter(
					(name) => !name.includes(`${path.sep}uploads${path.sep}`),
				)
				.map((name) => fs.readFile(name, 'utf8')),
		);
		expect(persisted.some((text) => text.includes(file.fileId))).toBe(true);
		expect(persisted.some((text) => text.includes(base64))).toBe(false);
		expect(
			onDisk.some((name) =>
				name.endsWith(`${path.sep}uploads${path.sep}${file.fileId}`),
			),
		).toBe(true);

		const reset$ = firstValueFrom(
			client['workflowSession.current.snapshot'].pipe(
				filter((snapshot) => snapshot.sessionId === sessionId),
				take(1),
			),
		);
		client['workflowSession.resetConversation.requested'].next({
			sessionId,
		});
		await reset$;

		await expect
			.poll(
				async () =>
					(
						await listFilesRecursive(
							path.join(sessionsRoot, WORKFLOW_ID),
						)
					).filter((name) =>
						name.includes(`${path.sep}uploads${path.sep}`),
					).length,
			)
			.toBe(0);
	});

	it('hoists media read in a tool round onto one following user message', async () => {
		await seedWorkflowFromDisk(client, projectDir, multimodalWorkflow());
		await bindSession(client);

		await Promise.all([
			fs.writeFile(path.join(projectDir, '1.png'), PNG_BYTES),
			fs.writeFile(path.join(projectDir, 'tone.wav'), WAV_BYTES),
			fs.writeFile(path.join(projectDir, 'spec.pdf'), PDF_BYTES),
			fs.writeFile(path.join(projectDir, 'notes.txt'), 'plain notes'),
			fs.writeFile(path.join(projectDir, 'clip.mp4'), 'not really video'),
		]);

		const requestsBefore = provider.requests.length;
		provider.script([
			{
				toolCalls: [
					'1.png',
					'tone.wav',
					'spec.pdf',
					'notes.txt',
					'clip.mp4',
				].map((name, index) => ({
					id: `call-${index}`,
					name: 'read',
					arguments: { path: name },
				})),
			},
			{ text: 'I looked at everything' },
		]);

		const reply$ = waitForRunnerOutput(client, {
			nodeId: 'preview',
			portId: 'text',
			predicate: (value) =>
				typeof value === 'string' &&
				value.includes('I looked at everything'),
		});
		client['runner.hitl.event'].next({
			nodeId: 'chat',
			portId: 'message',
			payload: { text: 'what is in these files?', files: [] },
		});
		await reply$;

		const second = provider.requests[requestsBefore + 1];
		expect(second).toBeDefined();
		const messages = second!.messages;
		const lastAssistant = messages.findLastIndex(
			(m) => m.role === 'assistant',
		);
		const afterAssistant = messages.slice(lastAssistant + 1);

		expect(afterAssistant.map((m) => m.role)).toEqual([
			'tool',
			'tool',
			'tool',
			'tool',
			'tool',
			'user',
		]);
		for (const tool of afterAssistant.slice(0, 5)) {
			expect(JSON.stringify(tool.content)).not.toContain('data:');
			expect(JSON.stringify(tool.content)).not.toContain(
				PNG_BYTES.toString('base64'),
			);
		}
		expect(JSON.stringify(afterAssistant[3]?.content)).toContain(
			'plain notes',
		);

		const parts = afterAssistant[5]?.content as readonly {
			readonly type: string;
		}[];
		expect(parts.map((part) => part.type)).toEqual([
			'image_url',
			'input_audio',
			'file',
		]);
		expect(parts[1]).toEqual({
			type: 'input_audio',
			input_audio: { data: WAV_BYTES.toString('base64'), format: 'wav' },
		});
		expect(parts[2]).toEqual({
			type: 'file',
			file: {
				filename: 'spec.pdf',
				file_data: `data:application/pdf;base64,${PDF_BYTES.toString('base64')}`,
			},
		});
	});

	it('runs a plain string wire on the same userPrompt port', async () => {
		await seedWorkflowFromDisk(client, projectDir, stringPromptWorkflow());

		const requestsBefore = provider.requests.length;
		provider.script([{ text: 'string prompt answered' }]);
		const reply$ = waitForRunnerOutput(client, {
			nodeId: 'preview',
			portId: 'text',
			predicate: (value) =>
				typeof value === 'string' &&
				value.includes('string prompt answered'),
		});
		client['runner.start.requested'].next([]);
		await reply$;

		const user = provider.requests[requestsBefore]?.messages.find(
			(m) => m.role === 'user',
		);
		expect(user?.content).toBe('plain prompt');
	});

	const uploadPng = async (): Promise<UploadedFile> => {
		const response = await uploadBytes(
			urls.httpBaseUrl,
			'1.png',
			'image/png',
			PNG_BYTES,
		);
		expect(response.status).toBe(200);
		return (await response.json()) as UploadedFile;
	};

	const pngPart = {
		type: 'image_url',
		image_url: {
			url: `data:image/png;base64,${PNG_BYTES.toString('base64')}`,
		},
	};

	const startRun = async (): Promise<string> => {
		const started$ = firstValueFrom(client['runner.started'].pipe(take(1)));
		client['runner.hitl.event'].next({
			nodeId: 'chat',
			portId: 'message',
			payload: { text: 'draft something', files: [] },
		});
		return started$;
	};

	it('Review Gate request-changes carries an image to the agent feedback port', async () => {
		await seedWorkflowFromDisk(client, projectDir, reviewGateWorkflow());
		await bindSession(client);
		const file = await uploadPng();
		const requestsBefore = provider.requests.length;
		provider.script([{ text: 'first draft' }, { text: 'second draft' }]);

		const gate$ = waitForRunnerOutput(client, {
			nodeId: 'llm',
			portId: 'response',
			predicate: (value) =>
				typeof value === 'string' && value.includes('first draft'),
		});
		const runId = await startRun();
		await gate$;

		client['runner.hitl.event'].next({
			nodeId: 'ask',
			portId: 'requestChanges',
			runId,
			payload: { text: 'match this picture', files: [file] },
		} as never);

		await expect
			.poll(() => provider.requests.length, { timeout: 5000 })
			.toBe(requestsBefore + 2);
		const messages = provider.requests[requestsBefore + 1]!.messages;
		const feedback = messages.filter((m) => m.role === 'user').at(-1);
		expect(feedback?.content).toEqual([
			{ type: 'text', text: 'match this picture' },
			pngPart,
		]);
	});

	it('Review Gate request-changes without files stays a plain string', async () => {
		await seedWorkflowFromDisk(client, projectDir, reviewGateWorkflow());
		await bindSession(client);
		const requestsBefore = provider.requests.length;
		provider.script([{ text: 'first draft' }, { text: 'second draft' }]);

		const gate$ = waitForRunnerOutput(client, {
			nodeId: 'llm',
			portId: 'response',
			predicate: (value) =>
				typeof value === 'string' && value.includes('first draft'),
		});
		const runId = await startRun();
		await gate$;

		client['runner.hitl.event'].next({
			nodeId: 'ask',
			portId: 'requestChanges',
			runId,
			payload: { text: 'shorter please', files: [] },
		} as never);

		await expect
			.poll(() => provider.requests.length, { timeout: 5000 })
			.toBe(requestsBefore + 2);
		const messages = provider.requests[requestsBefore + 1]!.messages;
		expect(messages.filter((m) => m.role === 'user').at(-1)?.content).toBe(
			'shorter please',
		);
	});

	it('Steer after Pause carries an image into the next request', async () => {
		await seedWorkflowFromDisk(client, projectDir, multimodalWorkflow());
		await bindSession(client);
		const file = await uploadPng();
		const requestsBefore = provider.requests.length;
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		provider.script([
			{ text: 'slow answer', gate },
			{ text: 'steered answer' },
		]);

		const steered$ = waitForRunnerOutput(client, {
			nodeId: 'preview',
			portId: 'text',
			predicate: (value) =>
				typeof value === 'string' && value.includes('steered answer'),
		});
		const runId = await startRun();
		await expect
			.poll(() => provider.requests.length, { timeout: 5000 })
			.toBe(requestsBefore + 1);

		client['runner.hitl.event'].next({
			nodeId: 'llm',
			portId: 'steerControl',
			runId,
			payload: { kind: 'pause' },
		} as never);
		await new Promise((resolve) => setTimeout(resolve, 100));
		client['runner.hitl.event'].next({
			nodeId: 'llm',
			portId: 'steerControl',
			runId,
			payload: { kind: 'steer', text: 'look at this', files: [file] },
		} as never);
		release();
		await steered$;

		const second = provider.requests[requestsBefore + 1]!.messages;
		const steer = second.filter((m) => m.role === 'user').at(-1);
		expect(steer?.content).toEqual([
			{ type: 'text', text: 'look at this' },
			pngPart,
		]);
	});

	it('ask_user reply with an image reaches the agent on a following user message', async () => {
		await seedWorkflowFromDisk(client, projectDir, askUserWorkflow());
		await bindSession(client);
		const file = await uploadPng();
		const requestsBefore = provider.requests.length;
		provider.script([
			{
				toolCalls: [
					{
						id: 'ask-1',
						name: 'ask_user',
						arguments: { question: 'Which picture?' },
					},
				],
			},
			{ text: 'thanks, I see it' },
		]);

		const ask$ = firstValueFrom(client['runner.askUser.ask'].pipe(take(1)));
		const done$ = waitForRunnerOutput(client, {
			nodeId: 'preview',
			portId: 'text',
			predicate: (value) =>
				typeof value === 'string' && value.includes('I see it'),
		});
		const runId = await startRun();
		const ask = await ask$;
		expect(ask.runId).toBe(runId);

		client['runner.askUser.reply'].next({
			runId: ask.runId,
			askId: ask.askId,
			text: 'this one',
			files: [file],
		} as never);
		await done$;

		const second = provider.requests[requestsBefore + 1]!.messages;
		const afterAssistant = second.slice(
			second.findLastIndex((m) => m.role === 'assistant') + 1,
		);
		expect(afterAssistant.map((m) => m.role)).toEqual(['tool', 'user']);
		expect(JSON.stringify(afterAssistant[0]?.content)).toContain(
			'this one',
		);
		expect(JSON.stringify(afterAssistant[0]?.content)).not.toContain(
			'data:',
		);
		expect(afterAssistant[1]?.content).toEqual([pngPart]);
	});

	/** Park a run at the Review Gate, then restart the server on the same project. */
	const restartWithParkedGate = async (): Promise<{
		readonly file: UploadedFile;
		readonly runId: string;
		readonly sessionFeed: () => Promise<string>;
	}> => {
		await seedWorkflowFromDisk(client, projectDir, reviewGateWorkflow());
		await bindSession(client);
		const file = await uploadPng();
		provider.script([
			{ text: 'first draft' },
			{ text: 'second draft' },
			{ text: 'third draft' },
		]);
		const gate$ = waitForRunnerOutput(client, {
			nodeId: 'llm',
			portId: 'response',
			predicate: (value) =>
				typeof value === 'string' && value.includes('first draft'),
		});
		const runId = await startRun();
		await gate$;
		await interruptRunner(client);

		client.close();
		await stopTestServer(urls);
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);

		const sessionDir = path.join(
			projectDir,
			'.langflower',
			'sessions',
			'multimodal-review-gate',
		);
		return {
			file,
			runId,
			sessionFeed: async () => {
				const names = await fs.readdir(sessionDir);
				const feed = names.find((name) => name.endsWith('.feed.jsonl'));
				return fs.readFile(path.join(sessionDir, feed ?? ''), 'utf8');
			},
		};
	};

	it('a reply to a restored Review Gate continues the same run: log kept, no replayed turn, loop goes on', async () => {
		const requestsBefore = provider.requests.length;
		const { file, runId, sessionFeed } = await restartWithParkedGate();

		const started: string[] = [];
		client['runner.started'].subscribe((id) => {
			started.push(id);
		});
		const second$ = waitForRunnerOutput(client, {
			nodeId: 'llm',
			portId: 'response',
			predicate: (value) =>
				typeof value === 'string' && value.includes('second draft'),
		});
		client['runner.hitl.event'].next({
			nodeId: 'ask',
			portId: 'requestChanges',
			payload: { text: 'read next image', files: [file] },
		} as never);
		await second$;

		// Same run id, so the UI keeps the work log instead of replacing it.
		expect(started).toEqual([runId]);

		// One model call for the feedback turn. The opening turn is not replayed.
		expect(provider.requests.length).toBe(requestsBefore + 2);
		const messages = provider.requests.at(-1)!.messages;
		expect(
			messages.filter((m) => m.role !== 'system').map((m) => m.role),
		).toEqual(['user', 'assistant', 'user']);
		expect(messages.at(-1)?.content).toEqual([
			{ type: 'text', text: 'read next image' },
			pngPart,
		]);

		// A client that connects now sees the whole log of that run: the old
		// frames the restart restored and the new ones.
		const late = createLangflowerWsClient(urls.wsUrl);
		const lateSnapshot = await firstValueFrom(
			late['executionFeed.snapshot'].pipe(
				filter((snapshot) => snapshot !== null),
				take(1),
			),
		);
		late.close();
		expect(lateSnapshot?.runId).toBe(runId);
		const shown = JSON.stringify(lateSnapshot?.events);
		expect(shown).toContain('first draft');
		expect(shown).toContain('second draft');

		// The saved work log is one run: one marker, old and new frames in it.
		await expect
			.poll(async () => (await sessionFeed()).includes('second draft'), {
				timeout: 5000,
			})
			.toBe(true);
		const feed = await sessionFeed();
		const markers = feed
			.split('\n')
			.filter((line) => line.startsWith('{"kind":"run"'));
		expect(markers).toHaveLength(1);
		expect(feed).toContain('first draft');

		// The gate is a loop again: the next reply reaches the agent too.
		const third$ = waitForRunnerOutput(client, {
			nodeId: 'llm',
			portId: 'response',
			predicate: (value) =>
				typeof value === 'string' && value.includes('third draft'),
		});
		client['runner.hitl.event'].next({
			nodeId: 'ask',
			portId: 'requestChanges',
			payload: { text: 'once more', files: [] },
		} as never);
		await third$;
		expect(provider.requests.at(-1)!.messages.at(-1)?.content).toBe(
			'once more',
		);
	});

	it('Approve on a restored gate passes the reviewed result on', async () => {
		const { runId } = await restartWithParkedGate();

		const started: string[] = [];
		client['runner.started'].subscribe((id) => {
			started.push(id);
		});
		const response$ = waitForRunnerOutput(client, {
			nodeId: 'ask',
			portId: 'response',
			predicate: (value) => value === 'first draft',
		});
		client['runner.hitl.event'].next({
			nodeId: 'ask',
			portId: 'approve',
			payload: true,
		} as never);
		await response$;
		expect(started).toEqual([runId]);
	});
});
