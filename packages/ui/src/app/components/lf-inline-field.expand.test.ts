// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { stringMultilineNode } from '../../../../common-nodes/src/primitives/string-multiline/node.js';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import { NgDiagramPortComponent } from 'ng-diagram';
import { Component } from '@angular/core';
import { Subject } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LfNodePortRowComponent } from '../features/canvas/components/lf-node-port-row.component';
import { PaletteNodePreviewComponent } from '../features/palette/components/palette-node-preview.component';
import { LangflowerBridgeService } from '../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../services/workflow-execution.service';
import { LfInlineFieldComponent } from './lf-inline-field.component';

@Component({
	selector: 'ng-diagram-port',
	standalone: true,
	template: '',
})
class MockPort {}

const createRaw = () =>
	({
		'executionFeed.snapshot': new Subject(),
		'runner.port': new Subject(),
		'runner.started': new Subject(),
		'runner.startNode.started': new Subject(),
		'runner.done': new Subject(),
		'runner.interrupted': new Subject(),
		'workflow.current.snapshot': new Subject(),
		'palette.snapshot': new Subject(),
		'customPalette.snapshot': new Subject(),
	}) as const;

const expandButton = (root: ParentNode): HTMLButtonElement | null =>
	root.querySelector('button[aria-label="Expand"]');

const dialogTextarea = (): HTMLTextAreaElement => {
	const dialog = document.querySelector('lf-text-expand-dialog');
	const textarea = dialog?.querySelector('textarea');

	if (!(textarea instanceof HTMLTextAreaElement)) {
		throw new Error('expand dialog textarea missing');
	}

	return textarea;
};

describe('lf-inline-field expand', () => {
	let fixture: ComponentFixture<LfInlineFieldComponent>;
	const emitted: unknown[] = [];

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
				imports: [LfInlineFieldComponent],
			})
			.compileComponents();

		fixture = TestBed.createComponent(LfInlineFieldComponent);
		fixture.componentInstance.valueChange.subscribe((value) => {
			emitted.push(value);
		});
	});

	afterEach(() => {
		fixture.destroy();
	});

	it('hides Expand on single-line, preview, and palette stubs', () => {
		fixture.componentRef.setInput('config', 'text');
		fixture.detectChanges();
		expect(expandButton(fixture.nativeElement)).toBeNull();

		fixture.componentRef.setInput('config', 'preview');
		fixture.detectChanges();
		expect(expandButton(fixture.nativeElement)).toBeNull();

		fixture.componentRef.setInput('config', 'text-multiline');
		fixture.componentRef.setInput('expandable', false);
		fixture.detectChanges();
		expect(expandButton(fixture.nativeElement)).toBeNull();
	});

	it('opens a separate textarea for multiline and markdown', () => {
		fixture.componentRef.setInput('config', 'text-multiline');
		fixture.componentRef.setInput('value', 'system prompt');
		fixture.componentRef.setInput('expandLabel', 'System');
		fixture.detectChanges();

		expect(expandButton(fixture.nativeElement)).not.toBeNull();
		expect(fixture.nativeElement.querySelectorAll('textarea')).toHaveLength(
			1,
		);

		expandButton(fixture.nativeElement)?.click();
		fixture.detectChanges();

		const modal = dialogTextarea();
		expect(modal.value).toBe('system prompt');
		expect(modal.closest('[role="dialog"]')?.className).toContain(
			'max-w-[700px]',
		);
		expect(document.body.textContent).toContain('System');
		expect(fixture.nativeElement.querySelectorAll('textarea')).toHaveLength(
			1,
		);

		fixture.componentInstance.expanded.set(false);
		fixture.detectChanges();
		fixture.componentRef.setInput('config', 'markdown');
		fixture.componentRef.setInput('value', '**hello**');
		fixture.detectChanges();

		expect(expandButton(fixture.nativeElement)).not.toBeNull();
		expect(fixture.nativeElement.querySelector('textarea')).toBeNull();

		expandButton(fixture.nativeElement)?.click();
		fixture.detectChanges();
		expect(dialogTextarea().value).toBe('**hello**');
		expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
	});

	it('emits keyup and change immediately and follows the value input', () => {
		fixture.componentRef.setInput('config', 'text-multiline');
		fixture.componentRef.setInput('value', 'before');
		fixture.detectChanges();
		expandButton(fixture.nativeElement)?.click();
		fixture.detectChanges();

		const modal = dialogTextarea();
		modal.value = 'after';
		modal.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
		expect(emitted).toEqual(['after']);

		modal.value = 'changed';
		modal.dispatchEvent(new Event('change'));
		expect(emitted).toEqual(['after', 'changed']);

		fixture.componentRef.setInput('value', 'from-server');
		fixture.detectChanges();
		expect(dialogTextarea().value).toBe('from-server');
	});

	it('does not emit when disabled, and Escape closes without an emit', () => {
		fixture.componentRef.setInput('config', 'text-multiline');
		fixture.componentRef.setInput('value', 'locked');
		fixture.componentRef.setInput('disabled', true);
		fixture.detectChanges();
		expandButton(fixture.nativeElement)?.click();
		fixture.detectChanges();

		const modal = dialogTextarea();
		expect(modal.disabled).toBe(true);
		modal.value = 'nope';
		modal.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
		modal.dispatchEvent(new Event('change'));
		expect(emitted).toEqual([]);

		document.documentElement.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Escape',
				bubbles: true,
				cancelable: true,
			}),
		);
		fixture.detectChanges();

		expect(document.querySelector('lf-text-expand-dialog')).toBeNull();
		expect(emitted).toEqual([]);
	});
});

describe('canvas port row expand', () => {
	let fixture: ComponentFixture<LfNodePortRowComponent>;

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
		fixture.componentRef.setInput('nodeId', 'node-1');
		fixture.componentRef.setInput('portId', 'in:value');
		fixture.componentRef.setInput('runtimePortId', 'value');
		fixture.componentRef.setInput('label', 'value');
		fixture.componentRef.setInput('wireType', 'string');
		fixture.componentRef.setInput('inline', 'text-multiline');
		fixture.componentRef.setInput('value', 'canvas');
	});

	afterEach(() => {
		fixture.destroy();
	});

	it('forwards dialog keyup through the port valueChange output', () => {
		const emitted: unknown[] = [];
		fixture.componentInstance.valueChange.subscribe((value) => {
			emitted.push(value);
		});
		fixture.detectChanges();

		expandButton(fixture.nativeElement)?.click();
		fixture.detectChanges();

		expect(document.body.textContent).toContain('value');
		const modal = dialogTextarea();
		modal.value = 'from-canvas';
		modal.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

		expect(emitted).toEqual(['from-canvas']);
	});

	it('hides Expand when the input port is wired', () => {
		fixture.componentRef.setInput('expandable', false);
		fixture.detectChanges();

		expect(expandButton(fixture.nativeElement)).toBeNull();
		expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
	});
});

describe('palette preview expand', () => {
	let fixture: ComponentFixture<PaletteNodePreviewComponent>;

	beforeEach(async () => {
		await TestBed.resetTestingModule()
			.configureTestingModule({
				imports: [PaletteNodePreviewComponent],
			})
			.compileComponents();

		fixture = TestBed.createComponent(PaletteNodePreviewComponent);
	});

	afterEach(() => {
		fixture.destroy();
	});

	it('does not offer Expand on a multiline catalog stub', () => {
		const { getInstance: _ignored, ...definition } = stringMultilineNode;
		fixture.componentRef.setInput('node', {
			...definition,
			source: 'system',
		} as unknown as PaletteNodeDefinition);
		fixture.detectChanges();

		expect(expandButton(fixture.nativeElement)).toBeNull();
	});
});
