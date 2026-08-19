import { describe, expect, it } from 'vitest';
import { getCommonReactiveNode } from '../catalog.js';

describe('embeddings catalog', () => {
	it.each([
		['common-embed-text', 'Embed text'],
		['common-embed-similarity', 'Embed similarity'],
		['common-embed-provider', 'Embed provider'],
	] as const)('registers %s', (type, displayName) => {
		const node = getCommonReactiveNode(type);

		expect(node).toBeDefined();
		expect(node?.category).toBe('Embeddings');
		expect(node?.displayName).toBe(displayName);
		expect(node?.getInstance).toBeTypeOf('function');
	});
});
