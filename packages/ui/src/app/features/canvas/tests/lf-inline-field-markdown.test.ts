// @vitest-environment jsdom

import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { NgDiagramPortComponent } from 'ng-diagram';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfNodePortRowComponent } from '../components/lf-node-port-row.component';

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

describe('lf-inline-field markdown', () => {
	let fixture: ComponentFixture<LfNodePortRowComponent>;

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
		await TestBed.resetTestingModule()
			.configureTestingModule({
				imports: [LfNodePortRowComponent],
				providers: [
					{
						provide: LangflowerBridgeService,
						useValue: { raw: createRaw(), cached: createRaw() },
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
		fixture.componentRef.setInput('side', 'in');
		fixture.componentRef.setInput('nodeId', 'hint-1');
		fixture.componentRef.setInput('portId', 'in:note');
		fixture.componentRef.setInput('runtimePortId', 'note');
		fixture.componentRef.setInput('label', 'Note');
		fixture.componentRef.setInput('wireType', 'string');
		fixture.componentRef.setInput('hidden', true);
		fixture.componentRef.setInput('inline', 'markdown');
	});

	it('idles as rendered markdown from the authored value', () => {
		fixture.componentRef.setInput('value', '**hello**');
		fixture.detectChanges();

		const preview = fixture.nativeElement.querySelector(
			'.lf-inline-preview',
		) as HTMLElement | null;
		expect(preview).not.toBeNull();
		expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
		expect(preview?.innerHTML).toContain('<strong>hello</strong>');
	});

	it('shows a clickable empty placeholder when idle', () => {
		fixture.componentRef.setInput('value', '');
		fixture.detectChanges();

		expect(fixture.nativeElement.textContent).toContain('Write a hint…');
	});

	it('opens a textarea on click and returns to preview on blur', () => {
		fixture.componentRef.setInput('value', '**hello**');
		fixture.detectChanges();

		const preview = fixture.nativeElement.querySelector(
			'.lf-inline-preview',
		) as HTMLElement;
		preview.click();
		fixture.detectChanges();

		const textarea = fixture.nativeElement.querySelector(
			'textarea',
		) as HTMLTextAreaElement | null;
		expect(textarea).not.toBeNull();
		expect(textarea?.value).toBe('**hello**');

		textarea?.dispatchEvent(new Event('blur'));
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
		expect(
			fixture.nativeElement.querySelector('.lf-inline-preview')
				?.innerHTML,
		).toContain('<strong>hello</strong>');
	});

	it('stays in markdown preview when disabled', () => {
		fixture.componentRef.setInput('value', '**hello**');
		fixture.componentRef.setInput('disabled', true);
		fixture.detectChanges();

		const preview = fixture.nativeElement.querySelector(
			'.lf-inline-preview',
		) as HTMLElement;
		preview.click();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
		expect(preview.innerHTML).toContain('<strong>hello</strong>');
	});
});
