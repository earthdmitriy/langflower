// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { portTipLayout } from '../components/lf-port-tip.directive';

const viewport = { width: 1000, height: 800 };
const tip = { width: 200, height: 80, titleCenterY: 12 };

describe('portTipLayout', () => {
	it('places an input tip left of the circle with the title on the label line', () => {
		const layout = portTipLayout({
			side: 'in',
			anchor: { left: 400, right: 408, top: 296, bottom: 304 },
			labelCenterY: 300,
			tip,
			viewport,
		});

		expect(layout.left).toBe(400 - 10 - 200);
		expect(layout.top).toBe(300 - 12);
		expect(layout.arrowTop).toBe(300 - layout.top);
	});

	it('places an output tip right of the circle', () => {
		const layout = portTipLayout({
			side: 'out',
			anchor: { left: 600, right: 608, top: 296, bottom: 304 },
			labelCenterY: 300,
			tip,
			viewport,
		});

		expect(layout.left).toBe(618);
	});

	it('clamps to the viewport and keeps the arrow on the tip', () => {
		const layout = portTipLayout({
			side: 'in',
			anchor: { left: 50, right: 58, top: 2, bottom: 10 },
			labelCenterY: 6,
			tip,
			viewport,
		});

		expect(layout.left).toBe(8);
		expect(layout.top).toBe(8);
		expect(layout.arrowTop).toBeGreaterThanOrEqual(10);
	});
});

describe('LfPortTipDirective DOM', () => {
	it('shows title + description on hover and removes on leave', async () => {
		const { Component } = await import('@angular/core');
		const { TestBed } = await import('@angular/core/testing');
		const { BrowserTestingModule, platformBrowserTesting } =
			await import('@angular/platform-browser/testing');
		const { LfPortTipDirective } =
			await import('../components/lf-port-tip.directive');

		try {
			TestBed.initTestEnvironment(
				BrowserTestingModule,
				platformBrowserTesting(),
			);
		} catch {
			/* already initialized */
		}

		@Component({
			standalone: true,
			imports: [LfPortTipDirective],
			template: `<div
				lfPortTip="in"
				tipTitle="text · string"
				[tipDescription]="desc"
			>
				<span class="lf-port-row__content">text</span>
			</div>`,
		})
		class Host {
			desc: string | undefined = 'Prompt body';
		}

		const fixture = TestBed.createComponent(Host);
		fixture.detectChanges();
		const label = fixture.nativeElement.querySelector(
			'.lf-port-row__content',
		) as HTMLElement;

		label.dispatchEvent(new Event('pointerover', { bubbles: true }));
		const tip = document.body.querySelector('.lf-port-tip');
		expect(tip?.querySelector('.lf-port-tip__title')?.textContent).toBe(
			'text · string',
		);
		expect(tip?.querySelector('.lf-port-tip__body')?.textContent).toBe(
			'Prompt body',
		);

		fixture.nativeElement.firstElementChild.dispatchEvent(
			new Event('pointerleave'),
		);
		expect(document.body.querySelector('.lf-port-tip')).toBeNull();
	});
});
