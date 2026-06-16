import { describe, expect, it } from 'vitest';
import type { PortMeta } from './port-meta.js';

describe('PortMeta', () => {
	it('constructs input port meta', () => {
		const meta: PortMeta = {
			dir: 'in',
			name: 'lines',
			wireType: 'string',
			mode: 'merge',
		};

		expect(meta.dir).toBe('in');
		expect(meta.name).toBe('lines');
		expect(meta.wireType).toBe('string');
		expect(meta.mode).toBe('merge');
	});

	it('constructs output port meta', () => {
		const meta: PortMeta = {
			dir: 'out',
			name: 'text',
			wireType: 'string',
		};

		expect(meta.dir).toBe('out');
		expect(meta.name).toBe('text');
		expect(meta.wireType).toBe('string');
		expect(meta.mode).toBeUndefined();
	});

	it('constructs dynamic passthrough output meta', () => {
		const meta: PortMeta = {
			dir: 'out',
			name: 'value',
			wireType: 'dynamic',
			fromInput: 'source',
		};

		expect(meta.dir).toBe('out');
		expect(meta.name).toBe('value');
		expect(meta.wireType).toBe('dynamic');
		expect(meta.fromInput).toBe('source');
	});
});
