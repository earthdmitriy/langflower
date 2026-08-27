import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SQLITE_PATH,
	resolveSqlitePath,
	resolveUnderProject,
} from './paths.ts';

describe('resolveUnderProject', () => {
	it('rejects paths that escape the project', () => {
		expect(() => resolveUnderProject('/proj', '../outside')).toThrow(
			/escapes projectDir/,
		);
	});

	it('resolves sqlite default under the project', () => {
		const resolved = resolveSqlitePath('/proj', '');
		expect(resolved).toBe(path.resolve('/proj', DEFAULT_SQLITE_PATH));
	});
});
