import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PERMISSION_CONFIG,
	clampToolPermission,
	formatPermissionDeniedText,
	isToolAlwaysDenied,
	matchPermissionPattern,
	mergePermissionConfigs,
	mergeProjectAndNodePermissions,
	permissionDetailForCall,
	permissionDetailForMcpCall,
	resolvePermission,
	toolFloorDecision,
	validNodePermissionOptions,
} from './permission.js';

describe('matchPermissionPattern', () => {
	it('matches * and exact strings', () => {
		expect(matchPermissionPattern('*', 'anything')).toBe(true);
		expect(matchPermissionPattern('git status', 'git status')).toBe(true);
		expect(matchPermissionPattern('git status', 'git status --short')).toBe(
			false,
		);
	});

	it('matches command trailing wildcards', () => {
		expect(matchPermissionPattern('git diff*', 'git diff')).toBe(true);
		expect(matchPermissionPattern('git diff*', 'git diff HEAD')).toBe(true);
		expect(matchPermissionPattern('rm *', 'rm -rf /')).toBe(true);
		expect(matchPermissionPattern('npm test', 'npm run test')).toBe(false);
	});

	it('matches path globs', () => {
		expect(matchPermissionPattern('**/*.md', 'docs/a.md')).toBe(true);
		expect(matchPermissionPattern('**/*.md', 'a.txt')).toBe(false);
		expect(matchPermissionPattern('docs/**', 'docs/x/y.ts')).toBe(true);
		expect(matchPermissionPattern('docs/**', 'src/x.ts')).toBe(false);
	});
});

describe('resolvePermission', () => {
	it('applies safe defaults when config is missing', () => {
		expect(resolvePermission(undefined, 'read', 'src/a.ts')).toBe('allow');
		expect(resolvePermission(undefined, 'write', 'src/a.ts')).toBe('allow');
		expect(resolvePermission(undefined, 'edit', 'src/a.ts')).toBe('allow');
		expect(resolvePermission(undefined, 'create', 'src/a.ts')).toBe(
			'allow',
		);
		expect(resolvePermission(undefined, 'delete', 'src/a.ts')).toBe(
			'allow',
		);
		expect(resolvePermission(undefined, 'bash', 'echo hi')).toBe('allow');
	});

	it('uses longest matching pattern; ties prefer deny', () => {
		const config = {
			bash: {
				'*': 'ask',
				'git *': 'allow',
				'git status': 'deny',
			},
		} as const;

		expect(resolvePermission(config, 'bash', 'git status')).toBe('deny');
		expect(resolvePermission(config, 'bash', 'git diff')).toBe('allow');
		expect(resolvePermission(config, 'bash', 'npm test')).toBe('ask');
	});

	it('accepts shorthand tool decision', () => {
		expect(resolvePermission({ bash: 'ask' }, 'bash', 'npm test')).toBe(
			'ask',
		);
	});

	it('merges user rules over defaults', () => {
		expect(
			resolvePermission(
				{ write: { 'docs/**': 'allow', '*': 'deny' } },
				'write',
				'docs/a.md',
			),
		).toBe('allow');
		expect(
			resolvePermission(
				{ write: { 'docs/**': 'allow', '*': 'deny' } },
				'write',
				'src/a.ts',
			),
		).toBe('deny');
		expect(
			resolvePermission({ write: { 'docs/**': 'allow' } }, 'read', 'x'),
		).toBe('allow');
	});
});

describe('permissionDetailForCall', () => {
	it('extracts bash command and file path', () => {
		expect(permissionDetailForCall('bash', { command: 'npm test' })).toBe(
			'npm test',
		);
		expect(permissionDetailForCall('write', { path: 'docs\\a.md' })).toBe(
			'docs/a.md',
		);
		expect(DEFAULT_PERMISSION_CONFIG.bash).toEqual({ '*': 'allow' });
	});
});

describe('permissionDetailForMcpCall', () => {
	it('uses remote name alone when args are empty', () => {
		expect(permissionDetailForMcpCall('echo', {})).toBe('echo');
	});

	it('prefixes path/url details with remote name', () => {
		expect(
			permissionDetailForMcpCall('fetch', { url: 'https://example.com' }),
		).toBe('fetch:https://example.com');
	});

	it('digests remaining args for grant granularity', () => {
		expect(permissionDetailForMcpCall('echo', { message: 'ping' })).toBe(
			'echo:{"message":"ping"}',
		);
	});
});

describe('mergePermissionConfigs', () => {
	it('lets later layers replace per-tool rules', () => {
		const merged = mergePermissionConfigs(
			{ bash: 'deny', write: 'ask' },
			{ bash: 'ask' },
		);

		expect(merged.bash).toBe('ask');
		expect(merged.write).toBe('ask');
	});
});

describe('isToolAlwaysDenied', () => {
	it('treats explicit bash deny as always-deny', () => {
		expect(isToolAlwaysDenied(undefined, 'bash')).toBe(false);
		expect(isToolAlwaysDenied({}, 'bash')).toBe(false);
		expect(isToolAlwaysDenied({ bash: 'deny' }, 'bash')).toBe(true);
		expect(isToolAlwaysDenied({ bash: 'ask' }, 'bash')).toBe(false);
		expect(
			isToolAlwaysDenied(
				{ bash: { '*': 'deny', 'npm *': 'ask' } },
				'bash',
			),
		).toBe(false);
	});

	it('does not mark unknown / wired tools as always-deny', () => {
		expect(isToolAlwaysDenied({}, 'crawl_fetch')).toBe(false);
	});
});

describe('floor helpers', () => {
	it('clamps node choices to the project floor', () => {
		expect(clampToolPermission('ask', 'allow')).toBe('ask');
		expect(clampToolPermission('allow', 'ask')).toBe('ask');
		expect(clampToolPermission('allow', 'deny')).toBe('deny');
		expect(validNodePermissionOptions('allow')).toEqual([
			'deny',
			'ask',
			'allow',
		]);
		expect(validNodePermissionOptions('ask')).toEqual(['deny', 'ask']);
		expect(validNodePermissionOptions('deny')).toEqual([]);
		expect(toolFloorDecision({ bash: 'ask' }, 'bash')).toBe('ask');
	});

	it('merges project floor with node toolPermissions', () => {
		const merged = mergeProjectAndNodePermissions(
			{ bash: 'ask' },
			{ bash: 'allow', read: 'deny' },
		);
		expect(resolvePermission(merged, 'bash', 'ls')).toBe('ask');
		expect(resolvePermission(merged, 'read', 'a.ts')).toBe('deny');
	});
});

describe('formatPermissionDeniedText', () => {
	it('explains how to enable the tool', () => {
		expect(formatPermissionDeniedText('bash', 'ls')).toMatch(
			/toolPermissions|permission\.bash|langflower\.jsonc/i,
		);
	});
});

describe('DEFAULT_PERMISSION_CONFIG', () => {
	it('allows all builtins by default', () => {
		expect(DEFAULT_PERMISSION_CONFIG.bash).toEqual({ '*': 'allow' });
		expect(DEFAULT_PERMISSION_CONFIG.delete).toEqual({ '*': 'allow' });
	});
});
