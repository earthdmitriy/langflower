import { describe, expect, it } from 'vitest';
import { getCommonReactiveNode } from '../catalog.js';

describe('crawl catalog', () => {
	it.each([
		['common-fetch-url', 'Fetch URL'],
		['common-extract-links', 'Extract Links'],
		['common-save-page', 'Save Page'],
		['common-crawl', 'Crawl'],
	] as const)('registers %s', (type, displayName) => {
		const node = getCommonReactiveNode(type);

		expect(node).toBeDefined();
		expect(node?.category).toBe('Crawl');
		expect(node?.displayName).toBe(displayName);
		expect(node?.getInstance).toBeTypeOf('function');
	});
});
