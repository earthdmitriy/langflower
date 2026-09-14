import {
	defineReactiveNode,
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
} from '@langflower/node-sdk';
import { filter, from, map, switchMap } from 'rxjs';
import { runIngest, type IngestEvent } from './lib/ingest.ts';
import {
	DEFAULT_SQLITE_PATH,
	resolveSqlitePath,
	resolveUnderProject,
} from './lib/paths.ts';
import { textEmbedderFromHandle } from './lib/text-embedder.ts';

const asString = (value: unknown, fallback: string): string => {
	if (typeof value === 'string') {
		return value;
	}
	return fallback;
};

type IngestBundle = {
	readonly embedInput: unknown;
	readonly projectDir: string;
	readonly sqlitePath: string;
	readonly sourceDir: string;
};

const ingestEvents = (bundle: IngestBundle): AsyncIterable<IngestEvent> => {
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

/**
 * Walk project markdown, embed heading chunks, write sqlite vectors.
 */
export default defineReactiveNode({
	type: 'hello-embed-ingest',
	displayName: 'Hello Embed Ingest',
	category: 'Hello Embed',
	description: `
Index project markdown into a local SQLite vector store.

Walks \`**/*.md\` (skips node_modules, .git, .langflower/.cache), splits on headings, and embeds one chunk at a time. Progress is a technical stream (\`feed.role: 'progress'\`, \`streaming: true\` — same growing layout as reasoning, caption PROGRESS, not result bubbles). Wire **embed** from common-embed-provider. **finish** fires when the index is written.
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
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput<unknown>('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
			description: 'Emit to run ingest.',
		});
		const embed = makeInput<unknown>('embed', {
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
			filter(
				(event): event is Extract<IngestEvent, { kind: 'progress' }> =>
					event.kind === 'progress',
			),
			map((event) =>
				event.text.endsWith('\n') ? event.text : `${event.text}\n`,
			),
		);
		const finish$ = session$.pipeValue(
			filter(
				(event): event is Extract<IngestEvent, { kind: 'finish' }> =>
					event.kind === 'finish',
			),
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
