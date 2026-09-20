import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

type PackageJson = {
	readonly peerDependencies?: Readonly<Record<string, string>>;
	readonly version?: string;
};

const readJson = (filePath: string): PackageJson =>
	JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageJson;

const SKELETON_NODES = path.join(
	ROOT,
	'packages',
	'server',
	'skeleton',
	'nodes',
);

const packManifests = (): readonly string[] =>
	fs
		.readdirSync(SKELETON_NODES, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(SKELETON_NODES, entry.name, 'package.json'))
		.filter((manifest) => fs.existsSync(manifest));

describe('skeleton pack SDK pin', () => {
	it('seeds the current @langflower/node-sdk version', () => {
		const sdkVersion = readJson(
			path.join(ROOT, 'packages', 'node-sdk', 'package.json'),
		).version;
		expect(sdkVersion).toBeTypeOf('string');

		const manifests = packManifests();
		expect(manifests.length).toBeGreaterThan(0);

		const offenders = manifests
			.map((manifest) => ({
				manifest: path.relative(ROOT, manifest),
				pinned: readJson(manifest).peerDependencies?.[
					'@langflower/node-sdk'
				],
			}))
			.filter((entry) => entry.pinned !== sdkVersion);

		expect(offenders).toEqual([]);
	});
});
