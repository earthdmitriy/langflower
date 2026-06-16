import { describe, expect, it } from 'vitest';
import { allocateWorkflowId, slugifyWorkflowId } from './workflow-id.js';

describe('slugifyWorkflowId', () => {
	it('slugifies display names', () => {
		expect(slugifyWorkflowId('Renamed Flow')).toBe('renamed-flow');
	});

	it('falls back when empty', () => {
		expect(slugifyWorkflowId('   ')).toBe('workflow');
	});
});

describe('allocateWorkflowId', () => {
	it('returns base when free', () => {
		expect(allocateWorkflowId('untitled', [])).toBe('untitled');
	});

	it('appends numeric suffix on collision', () => {
		expect(allocateWorkflowId('example-copy', ['example-copy'])).toBe(
			'example-copy-2',
		);
		expect(
			allocateWorkflowId('example-copy', [
				'example-copy',
				'example-copy-2',
			]),
		).toBe('example-copy-3');
	});
});
