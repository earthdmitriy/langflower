import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	hostPathMappings,
	isHostPeerSpecifier,
	resolveHostPackageEntry,
	resolveHostPackageTypes,
	resolveHostTypeRoots,
} from './resolve-host-types.js';

const toPosix = (filePath: string): string =>
	filePath.split(path.sep).join('/');

describe('resolveHostPackageTypes', () => {
	it('resolves rxjs via package.json types / exports.types, not cjs .js', () => {
		const typesPath = resolveHostPackageTypes('rxjs');
		expect(typesPath).toBeDefined();
		expect(typesPath?.endsWith('.d.ts')).toBe(true);
		expect(toPosix(typesPath ?? '')).not.toContain('/dist/cjs/');
		expect(fs.existsSync(typesPath ?? '')).toBe(true);
	});

	it('resolves @langflower/node-sdk declaration entry', () => {
		const typesPath = resolveHostPackageTypes('@langflower/node-sdk');
		expect(typesPath).toBeDefined();
		expect(typesPath?.endsWith('.d.ts')).toBe(true);
		expect(fs.existsSync(typesPath ?? '')).toBe(true);
	});

	it('resolves @rx-evo/stateful-observable declaration entry', () => {
		const typesPath = resolveHostPackageTypes(
			'@rx-evo/stateful-observable',
		);
		expect(typesPath).toBeDefined();
		expect(typesPath?.endsWith('.d.ts')).toBe(true);
		expect(fs.existsSync(typesPath ?? '')).toBe(true);
	});

	it('builds host path mappings for all peers', () => {
		const mappings = hostPathMappings();
		expect(mappings['rxjs']?.[0]).toMatch(/\.d\.ts$/u);
		expect(mappings['@langflower/node-sdk']?.[0]).toMatch(/\.d\.ts$/u);
		expect(mappings['@rx-evo/stateful-observable']?.[0]).toMatch(
			/\.d\.ts$/u,
		);
	});

	it('resolves @types typeRoots from the compiler host tree', () => {
		const roots = resolveHostTypeRoots();
		expect(roots.length).toBeGreaterThan(0);
		expect(fs.existsSync(roots[0] ?? '')).toBe(true);
		expect(fs.existsSync(path.join(roots[0] ?? '', 'node'))).toBe(true);
	});
});

describe('resolveHostPackageEntry', () => {
	it('resolves JS runtime entries that exist on disk', () => {
		for (const name of [
			'@langflower/node-sdk',
			'rxjs',
			'@rx-evo/stateful-observable',
		] as const) {
			const entry = resolveHostPackageEntry(name);
			expect(entry, name).toBeDefined();
			expect(fs.existsSync(entry ?? ''), name).toBe(true);
			expect(entry?.endsWith('.d.ts'), name).toBe(false);
		}
	});

	it('resolves @langflower/node-sdk/llm subpath', () => {
		const entry = resolveHostPackageEntry('@langflower/node-sdk/llm');
		expect(entry).toBeDefined();
		expect(fs.existsSync(entry ?? '')).toBe(true);
	});

	it('detects host peer bare names and subpaths', () => {
		expect(isHostPeerSpecifier('@langflower/node-sdk')).toBe(true);
		expect(isHostPeerSpecifier('@langflower/node-sdk/llm')).toBe(true);
		expect(isHostPeerSpecifier('rxjs')).toBe(true);
		expect(isHostPeerSpecifier('lodash')).toBe(false);
	});
});
