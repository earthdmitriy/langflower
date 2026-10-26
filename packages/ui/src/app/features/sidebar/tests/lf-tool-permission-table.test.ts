// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	LfToolPermissionTableComponent,
	type ToolPermissionTableRow,
} from '../components/lf-tool-permission-table.component';

const rows: readonly ToolPermissionTableRow[] = [
	{
		toolId: 'read',
		title: 'read',
		description: 'Read a file under the project root.',
		decision: 'allow',
		options: ['deny', 'ask', 'allow'],
	},
	{
		toolId: 'bash',
		title: 'bash',
		decision: 'ask',
		options: ['deny', 'ask', 'allow'],
	},
];

describe('LfToolPermissionTableComponent locked state', () => {
	let fixture: ComponentFixture<LfToolPermissionTableComponent>;
	const emitted: unknown[] = [];

	const radios = (): HTMLInputElement[] =>
		Array.from(
			fixture.nativeElement.querySelectorAll('input[type="radio"]'),
		);

	beforeAll(() => {
		try {
			TestBed.initTestEnvironment(
				BrowserTestingModule,
				platformBrowserTesting(),
			);
		} catch {
			/* already initialized */
		}
	});

	beforeEach(async () => {
		emitted.length = 0;
		await TestBed.resetTestingModule()
			.configureTestingModule({
				imports: [LfToolPermissionTableComponent],
			})
			.compileComponents();

		fixture = TestBed.createComponent(LfToolPermissionTableComponent);
		fixture.componentInstance.decisionChange.subscribe((change) => {
			emitted.push(change);
		});
		fixture.componentRef.setInput('rows', rows);
		fixture.componentRef.setInput('disabled', true);
		fixture.detectChanges();
	});

	afterEach(() => {
		fixture.destroy();
	});

	it('keeps the current decision visibly checked while locked', () => {
		const checked = radios()
			.filter((radio) => radio.checked)
			.map((radio) => radio.getAttribute('aria-label'));

		expect(checked).toEqual(['read: allow', 'bash: ask']);
		expect(radios().every((radio) => !radio.disabled)).toBe(true);
		expect(radios()[0]?.getAttribute('aria-disabled')).toBe('true');
	});

	it('is unreachable by pointer and Tab while locked, and ignores picks', () => {
		expect(
			radios().every(
				(radio) =>
					radio.classList.contains('pointer-events-none') &&
					radio.getAttribute('tabindex') === '-1',
			),
		).toBe(true);

		fixture.componentInstance.onPick('read', 'deny');
		expect(emitted).toEqual([]);
	});

	it('emits and is interactive when unlocked', () => {
		fixture.componentRef.setInput('disabled', false);
		fixture.detectChanges();

		expect(radios()[0]?.classList.contains('pointer-events-none')).toBe(
			false,
		);
		expect(radios()[0]?.hasAttribute('tabindex')).toBe(false);

		radios()[0]?.click();

		expect(emitted).toEqual([{ toolId: 'read', decision: 'deny' }]);
	});

	it('renders a ? tip with the agent-facing description only when known', () => {
		const tips = fixture.nativeElement.querySelectorAll('lf-hover-tip');

		expect(tips).toHaveLength(1);
		expect(
			tips[0]?.querySelector('button')?.getAttribute('aria-label'),
		).toBe('read tool description');

		const tooltip = tips[0]?.querySelector('[role="tooltip"]');
		const text = tooltip?.textContent ?? '';

		expect(text).toContain('Tool description for agent');
		expect(text).toContain('Read a file under the project root.');
		expect(text.indexOf('Tool description for agent')).toBeLessThan(
			text.indexOf('Read a file'),
		);
	});
});
