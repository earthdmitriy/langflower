// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
	measureNodeContentMinHeightPx,
	NODE_TITLE_FLOOR_PX,
} from '../utils/measure-node-content-min-size.js';

const chromePadY = 24;

describe('measureNodeContentMinHeightPx', () => {
	it('sums non-grow children via offsetHeight', () => {
		const content = document.createElement('div');
		const title = document.createElement('span');
		title.className = 'lf-node-title';
		Object.defineProperty(title, 'offsetHeight', {
			configurable: true,
			get: () => 16,
		});
		const row = document.createElement('div');
		row.className = 'lf-port-row-host';
		Object.defineProperty(row, 'offsetHeight', {
			configurable: true,
			get: () => 24,
		});
		content.append(title, row);

		expect(measureNodeContentMinHeightPx(content, chromePadY, 0)).toBe(
			NODE_TITLE_FLOOR_PX + 24 + chromePadY,
		);
	});

	it('reserves title floor when title offsetHeight is crushed to 0', () => {
		const content = document.createElement('div');
		const title = document.createElement('span');
		title.className = 'lf-node-title';
		Object.defineProperty(title, 'offsetHeight', {
			configurable: true,
			get: () => 0,
		});
		content.append(title);

		expect(measureNodeContentMinHeightPx(content, chromePadY, 0)).toBe(
			NODE_TITLE_FLOOR_PX + chromePadY,
		);
	});

	it('uses multiline floor for grow hosts instead of collapsed offsetHeight', () => {
		const content = document.createElement('div');
		const grow = document.createElement('div');
		grow.className = 'lf-port-row-host lf-port-row-host--grow';
		Object.defineProperty(grow, 'offsetHeight', {
			configurable: true,
			get: () => 10,
		});

		const label = document.createElement('div');
		label.className = 'lf-port-row';
		Object.defineProperty(label, 'offsetHeight', {
			configurable: true,
			get: () => 20,
		});

		const inline = document.createElement('div');
		inline.className = 'lf-port-row__inline';

		grow.append(label, inline);
		content.append(grow);

		vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
			if (el === grow) {
				return {
					getPropertyValue: () => '100px',
				} as unknown as CSSStyleDeclaration;
			}

			if (el === inline) {
				return {
					paddingBottom: '4px',
				} as unknown as CSSStyleDeclaration;
			}

			return {
				getPropertyValue: () => '',
				paddingBottom: '0px',
			} as unknown as CSSStyleDeclaration;
		});

		expect(measureNodeContentMinHeightPx(content, chromePadY, 0)).toBe(
			20 + 100 + 4 + chromePadY,
		);
	});

	it('respects absolute floor when content is tiny', () => {
		const content = document.createElement('div');

		expect(measureNodeContentMinHeightPx(content, chromePadY, 72)).toBe(72);
	});
});
