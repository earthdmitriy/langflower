import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CustomPaletteSnapshotPayload } from '@langflower/shared/langflower.js';
import { filter, firstValueFrom, take, timeout } from 'rxjs';
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
	createLangflowerWsClient,
	waitViewportSnapshot,
} from './langflower-ws-client.js';

const VALID_NODE = `import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-custom-echo',
	displayName: 'Fixture Custom Echo',
	category: 'Text',
	uiSchema: [] as const,
	inputs: {
		trigger: { wireType: 'any', required: true, dynamic: true },
	},
	outputs: {
		out: { wireType: 'string' },
	},
	execute() {
		return { out: 'custom-ok' };
	},
});
`;

const writePack = async (
	projectDir: string,
	packName: string,
	source: string,
): Promise<string> => {
	const packDir = path.join(projectDir, '.langflower', 'nodes', packName);
	await fs.mkdir(packDir, { recursive: true });
	await fs.writeFile(
		path.join(packDir, 'package.json'),
		`${JSON.stringify(
			{
				name: packName,
				version: '0.0.0',
				private: true,
				type: 'module',
			},
			null,
			'\t',
		)}\n`,
		'utf8',
	);
	await fs.writeFile(path.join(packDir, 'echo.ts'), source, 'utf8');
	return packDir;
};

const waitCustomStatus = (
	client: ReturnType<typeof createLangflowerWsClient>,
	status: CustomPaletteSnapshotPayload['status'],
): Promise<CustomPaletteSnapshotPayload> =>
	firstValueFrom(
		client['customPalette.snapshot'].pipe(
			filter((snapshot) => snapshot.status === status),
			take(1),
			timeout(15_000),
		),
	);

describe('customPalette WS', () => {
	let projectDir: string | undefined;
	let urls: TestServerHandle | undefined;
	let client: ReturnType<typeof createLangflowerWsClient> | undefined;

	afterEach(async () => {
		client?.close();
		client = undefined;
		await stopTestServer(urls);
		urls = undefined;

		if (projectDir !== undefined) {
			await removeTempProject(projectDir);
			projectDir = undefined;
		}
	});

	it('bootstraps broken pack with error snapshot and COMPILATION_ERRORS.md', async () => {
		projectDir = await createTempProject();
		const packDir = await writePack(
			projectDir,
			'broken-pack',
			'export default 42;\n',
		);

		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const customPromise = waitCustomStatus(client, 'error');
		const systemPromise = firstValueFrom(
			client['palette.snapshot'].pipe(take(1), timeout(15_000)),
		);
		await waitViewportSnapshot(client);
		const custom = await customPromise;
		const system = await systemPromise;
		expect(custom.nodes).toEqual([]);
		expect(custom.errors.length).toBeGreaterThan(0);
		expect(custom.errors[0]?.packageName).toBe('broken-pack');

		const markdown = await fs.readFile(
			path.join(packDir, 'COMPILATION_ERRORS.md'),
			'utf8',
		);
		for (const diagnostic of custom.errors[0]?.diagnostics ?? []) {
			expect(markdown).toContain(diagnostic.message);
		}
		expect(system.nodes.some((node) => node.source === 'system')).toBe(
			true,
		);
		expect(system.nodes.every((node) => node.source === 'system')).toBe(
			true,
		);
	});

	it('keeps a good custom node when Update breaks a sibling entry', async () => {
		projectDir = await createTempProject();
		const packDir = path.join(
			projectDir,
			'.langflower',
			'nodes',
			'mixed-pack',
		);
		await fs.mkdir(packDir, { recursive: true });
		await fs.writeFile(
			path.join(packDir, 'package.json'),
			`${JSON.stringify({ name: 'mixed-pack', version: '0.0.0', private: true, type: 'module' }, null, '\t')}\n`,
			'utf8',
		);
		await fs.writeFile(
			path.join(packDir, 'tsconfig.json'),
			`{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true,
		"types": ["node"]
	},
	"include": ["./**/*.ts"],
	"exclude": ["./**/*.test.ts", "node_modules"]
}
`,
			'utf8',
		);
		await fs.writeFile(path.join(packDir, 'good.ts'), VALID_NODE, 'utf8');
		await fs.writeFile(
			path.join(packDir, 'bad.ts'),
			`import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-bad',
	displayName: 'Bad',
	uiSchema: [] as const,
	inputs: { trigger: { wireType: 'any', required: true, dynamic: true } },
	outputs: { out: { wireType: 'string' } },
	execute() {
		return { out: 'x' };
	},
});
`,
			'utf8',
		);

		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const okPromise = waitCustomStatus(client, 'ok');
		await waitViewportSnapshot(client);
		await okPromise;

		await fs.writeFile(
			path.join(packDir, 'bad.ts'),
			`import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-bad',
	displayName: 'Bad',
	uiSchema: [] as const,
	inputs: { trigger: { wireType: 'any', required: true, dynamic: true } },
	outputs: { out: { wireType: 'string' } },
	execute() {
		return { out: codee };
	},
});
`,
			'utf8',
		);

		const partialPromise = waitCustomStatus(client, 'partial');
		client['customPalette.update.requested'].next({});
		const partial = await partialPromise;
		expect(
			partial.nodes.some((node) => node.type === 'fixture-custom-echo'),
		).toBe(true);
		expect(partial.errors.length).toBeGreaterThan(0);
		await expect(
			fs.access(path.join(packDir, 'COMPILATION_ERRORS.md')),
		).resolves.toBeUndefined();
	});
});
