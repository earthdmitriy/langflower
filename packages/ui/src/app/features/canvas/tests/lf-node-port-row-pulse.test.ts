// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Component } from '@angular/core';
import { NgDiagramPortComponent } from 'ng-diagram';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfNodePortRowComponent } from '../components/lf-node-port-row.component';
import { PULSE_MS } from '../utils/value-pulse-active.js';

@Component({
	selector: 'ng-diagram-port',
	standalone: true,
	template: '',
})
class MockPort {}

function createRaw() {
	return {
		'executionFeed.snapshot': new Subject(),
		'runner.port': new Subject(),
		'runner.started': new Subject(),
		'runner.startNode.started': new Subject(),
		'runner.done': new Subject(),
		'runner.interrupted': new Subject(),
		'workflow.current.snapshot': new Subject(),
		'palette.snapshot': new Subject(),
		'customPalette.snapshot': new Subject(),
	} as const;
}

describe('LfNodePortRowComponent pulse', () => {
	let fixture: ComponentFixture<LfNodePortRowComponent>;
	let raw: ReturnType<typeof createRaw>;

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
		raw = createRaw();
		await TestBed.resetTestingModule()
			.configureTestingModule({
				imports: [LfNodePortRowComponent],
				providers: [
					{
						provide: LangflowerBridgeService,
						useValue: { raw, cached: raw },
					},
					WorkflowExecutionService,
				],
			})
			.overrideComponent(LfNodePortRowComponent, {
				remove: { imports: [NgDiagramPortComponent] },
				add: { imports: [MockPort] },
			})
			.compileComponents();

		fixture = TestBed.createComponent(LfNodePortRowComponent);
		fixture.componentRef.setInput('side', 'out');
		fixture.componentRef.setInput('nodeId', 'node-a');
		fixture.componentRef.setInput('portId', 'out:response');
		fixture.componentRef.setInput('runtimePortId', 'response');
		fixture.componentRef.setInput('label', 'response');
		fixture.componentRef.setInput('wireType', 'string');
		fixture.detectChanges();
	});

	it('pulses the out anchor on output-emitted value, then clears', () => {
		vi.useFakeTimers();
		try {
			raw['runner.port'].next([
				'out',
				'node-a',
				'response',
				'value',
				'ok',
				0,
				[],
				null,
			]);
			fixture.detectChanges();

			expect(fixture.componentInstance.pulse()).toBe(true);
			const anchor = fixture.nativeElement.querySelector(
				'.lf-port-anchor--out',
			) as HTMLElement;
			expect(anchor.classList.contains('lf-port-anchor--pulse')).toBe(
				true,
			);

			vi.advanceTimersByTime(PULSE_MS + 50);
			fixture.detectChanges();

			expect(fixture.componentInstance.pulse()).toBe(false);
			expect(anchor.classList.contains('lf-port-anchor--pulse')).toBe(
				false,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('pulses the in anchor on input-received value', () => {
		vi.useFakeTimers();
		try {
			fixture.componentRef.setInput('side', 'in');
			fixture.componentRef.setInput('portId', 'in:packet');
			fixture.componentRef.setInput('runtimePortId', 'packet');
			fixture.detectChanges();

			raw['runner.port'].next([
				'in',
				'node-a',
				'packet',
				'value',
				'claim',
				0,
				[],
				null,
			]);
			fixture.detectChanges();

			expect(fixture.componentInstance.pulse()).toBe(true);
			const anchor = fixture.nativeElement.querySelector(
				'.lf-port-anchor--in',
			) as HTMLElement;
			expect(anchor.classList.contains('lf-port-anchor--pulse')).toBe(
				true,
			);

			vi.advanceTimersByTime(PULSE_MS + 50);
			fixture.detectChanges();
			expect(fixture.componentInstance.pulse()).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('ignores events for other ports', () => {
		raw['runner.port'].next([
			'out',
			'node-a',
			'other',
			'value',
			'x',
			0,
			[],
			null,
		]);
		fixture.detectChanges();
		expect(fixture.componentInstance.pulse()).toBe(false);
	});
});
