// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LfInlineFieldComponent } from './lf-inline-field.component';

describe('lf-inline-field boolean toggle', () => {
	let fixture: ComponentFixture<LfInlineFieldComponent>;
	const emitted: unknown[] = [];

	const switchInput = (): HTMLInputElement => {
		const input = fixture.nativeElement.querySelector(
			'input[role="switch"]',
		);

		if (!(input instanceof HTMLInputElement)) {
			throw new Error('switch input missing');
		}

		return input;
	};

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
			.configureTestingModule({ imports: [LfInlineFieldComponent] })
			.compileComponents();

		fixture = TestBed.createComponent(LfInlineFieldComponent);
		fixture.componentInstance.valueChange.subscribe((value) => {
			emitted.push(value);
		});
		fixture.componentRef.setInput('config', 'boolean');
	});

	afterEach(() => {
		fixture.destroy();
	});

	it('renders a switch reflecting the value with an On/Off label', () => {
		fixture.componentRef.setInput('value', true);
		fixture.detectChanges();

		expect(switchInput().checked).toBe(true);
		expect(fixture.nativeElement.textContent).toContain('On');

		fixture.componentRef.setInput('value', false);
		fixture.detectChanges();

		expect(switchInput().checked).toBe(false);
		expect(fixture.nativeElement.textContent).toContain('Off');
	});

	it('emits the new boolean when toggled and not when disabled', () => {
		fixture.componentRef.setInput('value', false);
		fixture.detectChanges();

		switchInput().click();
		expect(emitted).toEqual([true]);

		fixture.componentRef.setInput('disabled', true);
		fixture.detectChanges();

		expect(switchInput().disabled).toBe(true);
	});
});
