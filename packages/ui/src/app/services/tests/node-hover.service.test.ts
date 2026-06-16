import { describe, expect, it } from 'vitest';
import { NodeHoverService } from '../node-hover.service';

describe('NodeHoverService', () => {
	it('starts with no hovered node', () => {
		const service = new NodeHoverService();
		expect(service.hoveredNodeId()).toBeNull();
		expect(service.isHovered('node-a')).toBe(false);
	});

	it('tracks the hovered node and clears it', () => {
		const service = new NodeHoverService();

		service.set('node-a');
		expect(service.hoveredNodeId()).toBe('node-a');
		expect(service.isHovered('node-a')).toBe(true);
		expect(service.isHovered('node-b')).toBe(false);

		service.clear();
		expect(service.hoveredNodeId()).toBeNull();
		expect(service.isHovered('node-a')).toBe(false);
	});

	it('replaces the hovered node when a different one is set', () => {
		const service = new NodeHoverService();

		service.set('node-a');
		service.set('node-b');

		expect(service.hoveredNodeId()).toBe('node-b');
		expect(service.isHovered('node-a')).toBe(false);
	});
});
