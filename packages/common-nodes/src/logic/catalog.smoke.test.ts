import { describe, expect, it } from 'vitest';
import { getCommonReactiveNode } from '../catalog.js';

describe('hard harness logic catalog', () => {
	it.each([
		'common-assert',
		'common-if',
		'common-gate',
		'common-compare',
		'common-switch',
	] as const)('registers %s', (type) => {
		const node = getCommonReactiveNode(type);

		expect(node).toBeDefined();
		expect(node?.category).toBe('Logic');
		expect(node?.getInstance).toBeTypeOf('function');
	});

	it('Switch runtime exposes static pass/fail/default outputs', () => {
		const node = getCommonReactiveNode('common-switch');
		const outputs = Object.keys(node?.getInstance().outputs ?? {});

		expect(outputs.sort()).toEqual(['default', 'fail', 'pass']);
	});
});
