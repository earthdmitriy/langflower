// ingest.ts
import {
	defineReactiveNode,
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
} from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';
import {
	filter,
	from,
	map,
	switchMap,
} from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/rxjs/dist/cjs/index.js';

// lib/ingest.ts
import fs2 from 'node:fs/promises';
import path3 from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// lib/paths.ts
import path from 'node:path';
var DEFAULT_SQLITE_PATH = '.langflower/.cache/hello-embed/kb.sqlite';
var MAX_FILE_BYTES = 512 * 1024;
var MAX_CHUNKS_PER_FILE = 200;
var SKIP_DIR_NAMES = /* @__PURE__ */ new Set(['node_modules', '.git']);
var CACHE_PREFIX = '.langflower/.cache';
var toPosix = (value) => value.replaceAll('\\', '/');
var asPosixRelative = (value) => toPosix(value);
var resolveUnderProject = (projectDir, relativeOrEmpty) => {
	const root = path.resolve(projectDir);
	const trimmed = relativeOrEmpty.trim();
	const resolved =
		trimmed.length === 0
			? root
			: path.isAbsolute(trimmed)
				? path.resolve(trimmed)
				: path.resolve(root, trimmed);
	const rel = path.relative(root, resolved);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		throw new Error(`Path escapes projectDir: ${trimmed}`);
	}
	return resolved;
};
var resolveSqlitePath = (projectDir, override) => {
	const raw =
		typeof override === 'string' && override.trim().length > 0
			? override.trim()
			: DEFAULT_SQLITE_PATH;
	return resolveUnderProject(projectDir, raw);
};
var isCacheRelative = (relPosix) =>
	relPosix === CACHE_PREFIX || relPosix.startsWith(`${CACHE_PREFIX}/`);

// lib/chunk-markdown.ts
var HEADING_RE = /^(#{1,6})\s+(.*)$/;
var slugHeading = (heading) => {
	const slug = heading
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug.length > 0 ? slug : 'intro';
};
var displayHeading = (heading) => (heading.length > 0 ? heading : '(intro)');
var breadcrumbOf = (stack) => stack.map((section) => section.title).join(' > ');
var flushBody = (relPath, heading, body, ordinal, out) => {
	const text = body.trim();
	if (text.length === 0) {
		return ordinal;
	}
	const id = `${relPath}#${slugHeading(heading)}#${String(ordinal)}`;
	out.push({
		id,
		path: relPath,
		heading,
		text,
		embedText: `${relPath}
${displayHeading(heading)}

${text}`,
	});
	return ordinal + 1;
};
var chunkMarkdown = (relPath, source) => {
	const lines = source.replaceAll('\r\n', '\n').split('\n');
	const out = [];
	const stack = [];
	let currentHeading = '';
	let body = [];
	let ordinal = 0;
	let truncated;
	const flush = () => {
		if (out.length >= MAX_CHUNKS_PER_FILE) {
			if (truncated === void 0) {
				truncated = `capped ${relPath} at ${String(MAX_CHUNKS_PER_FILE)} chunks`;
			}
			body = [];
			return;
		}
		ordinal = flushBody(
			relPath,
			currentHeading,
			body.join('\n'),
			ordinal,
			out,
		);
		body = [];
	};
	for (const line of lines) {
		const match = HEADING_RE.exec(line);
		if (match === null) {
			body.push(line);
			continue;
		}
		flush();
		if (out.length >= MAX_CHUNKS_PER_FILE) {
			break;
		}
		const marks = match[1] ?? '#';
		const title = (match[2] ?? '').trim();
		const depth = marks.length;
		while (
			stack.length > 0 &&
			(stack[stack.length - 1]?.depth ?? 0) >= depth
		) {
			stack.pop();
		}
		stack.push({ depth, title });
		currentHeading = breadcrumbOf(stack);
	}
	if (out.length < MAX_CHUNKS_PER_FILE) {
		flush();
	}
	if (truncated !== void 0 && out[0] !== void 0) {
		const last = out[out.length - 1];
		if (last !== void 0) {
			out[out.length - 1] = { ...last, truncated };
		}
	}
	return out;
};

// lib/schema.ts
var SCHEMA_SQL = `
CREATE TABLE chunk (
	id TEXT PRIMARY KEY,
	path TEXT NOT NULL,
	heading TEXT NOT NULL,
	text TEXT NOT NULL,
	embed_text TEXT NOT NULL
);

CREATE TABLE chunk_vec (
	id TEXT PRIMARY KEY REFERENCES chunk(id),
	dim INTEGER NOT NULL,
	vector BLOB NOT NULL
);

CREATE VIRTUAL TABLE chunk_fts USING fts5(
	id UNINDEXED,
	heading,
	text
);
`.trim();

// lib/walk-markdown.ts
import fs from 'node:fs/promises';
import path2 from 'node:path';
var isMarkdownName = (name) => name.toLowerCase().endsWith('.md');
var walkMarkdown = async (rootDir) => {
	const files = [];
	const visit = async (absDir, relPosix) => {
		const entries = await fs.readdir(absDir, { withFileTypes: true });
		for (const entry of entries) {
			const childRel =
				relPosix.length === 0
					? entry.name
					: `${relPosix}/${entry.name}`;
			const childAbs = path2.join(absDir, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIR_NAMES.has(entry.name)) {
					continue;
				}
				if (isCacheRelative(asPosixRelative(childRel))) {
					continue;
				}
				await visit(childAbs, asPosixRelative(childRel));
				continue;
			}
			if (!entry.isFile() || !isMarkdownName(entry.name)) {
				continue;
			}
			if (isCacheRelative(asPosixRelative(childRel))) {
				continue;
			}
			const stat = await fs.stat(childAbs);
			const relPath = asPosixRelative(childRel);
			if (stat.size > MAX_FILE_BYTES) {
				files.push({
					absPath: childAbs,
					relPath,
					text: '',
					skipped: `skipped ${relPath} (${String(stat.size)} bytes > ${String(MAX_FILE_BYTES)})`,
				});
				continue;
			}
			const text = await fs.readFile(childAbs, 'utf8');
			files.push({ absPath: childAbs, relPath, text });
		}
	};
	await visit(rootDir, '');
	return files;
};

// lib/vectors.ts
var l2Normalize = (values) => {
	const out = new Float32Array(values.length);
	let sumSq = 0;
	for (let i = 0; i < values.length; i += 1) {
		const n = values[i] ?? 0;
		out[i] = n;
		sumSq += n * n;
	}
	const norm = Math.sqrt(sumSq);
	if (norm === 0) {
		return out;
	}
	const scale = 1 / norm;
	for (let i = 0; i < out.length; i += 1) {
		out[i] = (out[i] ?? 0) * scale;
	}
	return out;
};
var float32ToBlob = (values) => {
	const bytes = new Uint8Array(values.byteLength);
	bytes.set(
		new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
	);
	return bytes;
};
var vecCache = /* @__PURE__ */ new Map();
var clearVecCache = () => {
	vecCache.clear();
};

// lib/ingest.ts
var dimMismatchMessage = (got, stored) =>
	`Embedding dim ${String(got)} does not match stored dim ${String(stored)}. Re-run ingest after switching models.`;
var padCount = (value, width) => String(value).padStart(width, '0');
var runIngest = async function* (options) {
	const { sqlitePath, sourceDir, embedder } = options;
	await fs2.mkdir(path3.dirname(sqlitePath), { recursive: true });
	try {
		await fs2.unlink(sqlitePath);
	} catch (error) {
		const code =
			error !== null && typeof error === 'object' && 'code' in error
				? String(error.code)
				: '';
		if (code !== 'ENOENT') {
			throw error;
		}
	}
	const db = new DatabaseSync(sqlitePath);
	try {
		db.exec('PRAGMA journal_mode = WAL');
		db.exec('PRAGMA foreign_keys = ON');
		db.exec(SCHEMA_SQL);
		clearVecCache();
		const files = await walkMarkdown(sourceDir);
		const readable = files.filter((file) => file.skipped === void 0);
		for (const file of files) {
			if (file.skipped !== void 0) {
				yield { kind: 'progress', text: file.skipped };
			}
		}
		if (readable.length === 0) {
			yield { kind: 'progress', text: 'no markdown files' };
			yield { kind: 'finish', chunkCount: 0, fileCount: 0 };
			return;
		}
		const chunks = readable.flatMap((file) =>
			chunkMarkdown(file.relPath, file.text),
		);
		const insertChunk = db.prepare(
			'INSERT INTO chunk (id, path, heading, text, embed_text) VALUES (?, ?, ?, ?, ?)',
		);
		const insertVec = db.prepare(
			'INSERT INTO chunk_vec (id, dim, vector) VALUES (?, ?, ?)',
		);
		const insertFts = db.prepare(
			'INSERT INTO chunk_fts (id, heading, text) VALUES (?, ?, ?)',
		);
		let expectedDim = embedder.expectedDim;
		let embedded = 0;
		const width = String(chunks.length).length;
		for (const chunk of chunks) {
			if (chunk.truncated !== void 0) {
				yield { kind: 'progress', text: chunk.truncated };
			}
			const [raw] = await embedder.embedTexts([chunk.embedText]);
			if (raw === void 0) {
				throw new Error('Embedding returned no vector');
			}
			const vector = l2Normalize([...raw]);
			if (expectedDim === void 0) {
				expectedDim = vector.length;
			} else if (vector.length !== expectedDim) {
				throw new Error(dimMismatchMessage(vector.length, expectedDim));
			}
			insertChunk.run(
				chunk.id,
				chunk.path,
				chunk.heading,
				chunk.text,
				chunk.embedText,
			);
			insertVec.run(chunk.id, expectedDim, float32ToBlob(vector));
			insertFts.run(chunk.id, chunk.heading, chunk.text);
			embedded += 1;
			const label = chunk.heading.length > 0 ? chunk.heading : '(intro)';
			yield {
				kind: 'progress',
				text: `(${padCount(embedded, width)}/${padCount(chunks.length, width)}) ${chunk.path} \u2014 ${label}`,
			};
		}
		yield {
			kind: 'finish',
			chunkCount: embedded,
			fileCount: readable.length,
		};
	} finally {
		db.close();
	}
};

// lib/text-embedder.ts
var textEmbedderFromHandle = (handle, role) => ({
	expectedDim: handle.dim,
	embedTexts: (texts) => handle.embedTexts(texts, { role }),
});

// ingest.ts
var asString = (value, fallback) => {
	if (typeof value === 'string') {
		return value;
	}
	return fallback;
};
var ingestEvents = (bundle) => {
	if (!isEmbedHandle(bundle.embedInput)) {
		throw new Error(
			'hello-embed-ingest requires a wired embed input from common-embed-provider.',
		);
	}
	if (bundle.projectDir.length === 0) {
		throw new Error('hello-embed-ingest requires ctx.projectDir.');
	}
	return runIngest({
		sqlitePath: resolveSqlitePath(bundle.projectDir, bundle.sqlitePath),
		sourceDir: resolveUnderProject(bundle.projectDir, bundle.sourceDir),
		embedder: textEmbedderFromHandle(bundle.embedInput, 'document'),
	});
};
var ingest_default = defineReactiveNode({
	type: 'hello-embed-ingest',
	displayName: 'Hello Embed Ingest',
	category: 'Hello Embed',
	description: `
Index project markdown into a local SQLite vector store.

Walks \`**/*.md\` (skips node_modules, .git, .langflower/.cache), splits on headings, and embeds one chunk at a time. Progress is a technical stream (\`feed.role: 'progress'\`, \`streaming: true\` \u2014 same growing layout as reasoning, caption PROGRESS, not result bubbles). Wire **embed** from common-embed-provider. **finish** fires when the index is written.
`.trim(),
	uiSchema: [
		{
			field: 'sqlitePath',
			type: 'string',
			label: 'SQLite path',
			default: DEFAULT_SQLITE_PATH,
		},
		{
			field: 'sourceDir',
			type: 'string',
			label: 'Source folder',
			default: '',
		},
	],
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
			description: 'Emit to run ingest.',
		});
		const embed = makeInput('embed', {
			name: 'embed',
			wireType: EMBED_HANDLE_WIRE_TYPE,
			required: true,
			description: 'Wire from common-embed-provider (fan-out OK).',
		});
		const session$ = combineInputs(
			[trigger, embed, ctx],
			([_trigger, embedInput, ec]) => ({
				embedInput,
				projectDir: String(ec.projectDir ?? ''),
				sqlitePath: asString(ec.params.sqlitePath, DEFAULT_SQLITE_PATH),
				sourceDir: asString(ec.params.sourceDir, ''),
			}),
		).pipeValue(switchMap((bundle) => from(ingestEvents(bundle))));
		const progress$ = session$.pipeValue(
			filter((event) => event.kind === 'progress'),
			map((event) =>
				event.text.endsWith('\n')
					? event.text
					: `${event.text}
`,
			),
		);
		const finish$ = session$.pipeValue(
			filter((event) => event.kind === 'finish'),
			map(() => true),
		);
		return {
			inputs: [trigger, embed],
			outputs: [
				configureOutput('progress', progress$, {
					wireType: 'string',
					feed: { role: 'progress', streaming: true },
				}),
				configureOutput('finish', finish$, {
					wireType: 'boolean',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
export { ingest_default as default };
