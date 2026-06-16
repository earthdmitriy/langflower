import { describe, expect, it } from 'vitest';
import { getCommonReactiveNode } from '../../catalog.js';

describe('router node', () => {
	it('registers bypass-only runtime template', () => {
		const node = getCommonReactiveNode('common-router');

		expect(node?.bypassPorts).toEqual({ ch: 'dynamic' });
		expect(Reflect.ownKeys(node?.getInstance().inputs ?? {})).toHaveLength(
			1,
		);
		expect(node?.getInstance().outputs).toEqual({});
	});
});
