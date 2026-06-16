import { describe, expect, it } from 'vitest';
import { matchAnyGlob, matchGlob } from './match-glob.js';

describe('matchGlob', () => {
	it('matches workflow.* actions', () => {
		expect(matchGlob('workflow.*', 'workflow.load.requested')).toBe(true);
		expect(matchGlob('workflow.*', 'editor.addNode.requested')).toBe(false);
	});

	it('matchAnyGlob respects exclude list usage', () => {
		expect(
			matchAnyGlob(['workflow.*', 'runner.*'], 'runner.start.requested'),
		).toBe(true);
		expect(matchAnyGlob(['editor.*'], 'runner.start.requested')).toBe(
			false,
		);
	});
});
