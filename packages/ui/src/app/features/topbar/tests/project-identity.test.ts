import { describe, expect, it } from 'vitest';
import { formatDocumentTitle } from '../utils/project-identity';

describe('formatDocumentTitle', () => {
	it('puts the folder name before the product', () => {
		expect(formatDocumentTitle('demo-project')).toBe(
			'demo-project — Langflower',
		);
	});
});
