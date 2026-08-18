// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Component, input, signal } from '@angular/core';
import {
	NgDiagramBaseEdgeComponent,
	NgDiagramModelService,
	type Edge,
	type Node,
} from 'ng-diagram';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import {
	BACK_EDGE_DASHARRAY,
	LfEdgeChromeComponent,
} from '../components/lf-edge-chrome.component';

/**
 * The real `ng-diagram-base-edge` needs the full ng-diagram flow context; for a
 * chrome-only unit test we only need the host to accept the `edge` binding and
 * stay out of the way. The wire chrome classes are on the `lf-edge` host
 * element itself (asserted below), so the inner path is irrelevant here.
 */
@Component({
	selector: 'ng-diagram-base-edge',
	standalone: true,
	template: '',
})
class MockBaseEdge {
	readonly edge = input.required<Edge<object>>();
	readonly strokeDasharray = input<string | undefined>(undefined);
}

class MockNgDiagramModelService {
	readonly nodes = signal<Node[]>([]);
	readonly edges = signal<Edge<object>[]>([]);
}

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

type Raw = ReturnType<typeof createRaw>;

function makeEdge(
	id: string,
	selected = false,
	positions?: {
		readonly sourcePosition: { readonly x: number; readonly y: number };
		readonly targetPosition: { readonly x: number; readonly y: number };
	},
): Edge<object> {
	return {
		id,
		source: 'n1',
		target: 'n2',
		sourcePort: 'out:a',
		targetPort: 'in:b',
		selected,
		data: {},
		...positions,
	};
}

function outputPending(_runId: string, edgeIds: string[]) {
	return [
		'out',
		'n1',
		'response',
		{ pending: true },
		0,
		edgeIds,
		null,
	] as const;
}

function outputValue(_runId: string, edgeIds: string[]) {
	return ['out', 'n1', 'response', { value: 'x' }, 0, edgeIds, null] as const;
}

describe('LfEdgeChromeComponent execution chrome (signal-driven DOM)', () => {
	let raw: Raw;
	let fixture: ComponentFixture<LfEdgeChromeComponent>;
	let service: WorkflowExecutionService;
	let model: MockNgDiagramModelService;

	beforeAll(() => {
		if (typeof globalThis.ResizeObserver === 'undefined') {
			globalThis.ResizeObserver = class {
				observe() {}
				unobserve() {}
				disconnect() {}
			};
		}
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(async () => {
		TestBed.resetTestingModule();
		raw = createRaw();
		model = new MockNgDiagramModelService();

		await TestBed.configureTestingModule({
			imports: [LfEdgeChromeComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw, cached: raw },
				},
				{ provide: NgDiagramModelService, useValue: model },
				WorkflowExecutionService,
			],
		})
			.overrideComponent(LfEdgeChromeComponent, {
				remove: { imports: [NgDiagramBaseEdgeComponent] },
				add: { imports: [MockBaseEdge] },
			})
			.compileComponents();

		fixture = TestBed.createComponent(LfEdgeChromeComponent);
		fixture.componentRef.setInput('edge', makeEdge('edge-1'));
		fixture.detectChanges();
		service = TestBed.inject(WorkflowExecutionService);
	});

	it('is pending (dark yellow) while the source output is pending', () => {
		raw['runner.port'].next(outputPending('run-1', ['edge-1']));
		fixture.detectChanges();

		expect(service.wireStatus('edge-1')).toEqual({ pending: true });
		expect(
			fixture.nativeElement.classList.contains('lf-edge--pending'),
		).toBe(true);
		expect(
			getComputedStyle(fixture.nativeElement)
				.getPropertyValue('--edge-stroke')
				.trim(),
		).toMatch(/rgb\(202[,\s]+138[,\s]+4\)/);
	});

	it('is value (green) once the source emits a value', () => {
		raw['runner.port'].next(outputValue('run-1', ['edge-1']));
		fixture.detectChanges();

		expect(service.wireStatus('edge-1')).toEqual({ value: 'x' });
		expect(fixture.nativeElement.classList.contains('lf-edge--value')).toBe(
			true,
		);
		expect(
			getComputedStyle(fixture.nativeElement)
				.getPropertyValue('--edge-stroke')
				.trim(),
		).toMatch(/rgb\(16[,\s]+185[,\s]+129\)/);
	});

	it('keeps settled chrome on run done', () => {
		raw['runner.port'].next(outputPending('run-1', ['edge-1']));
		fixture.detectChanges();
		expect(service.wireStatus('edge-1')).toEqual({ pending: true });

		raw['runner.done'].next(['done', 'run-1']);
		fixture.detectChanges();

		expect(service.wireStatus('edge-1')).toEqual({ pending: true });
		expect(
			fixture.nativeElement.classList.contains('lf-edge--pending'),
		).toBe(true);
	});

	it('flashes the pulse class on a delivered value, then clears it', () => {
		vi.useFakeTimers();
		try {
			raw['runner.port'].next(outputValue('run-1', ['edge-1']));
			fixture.detectChanges();

			expect(fixture.componentInstance.pulse()).toBe(true);
			expect(
				fixture.nativeElement.classList.contains('lf-edge--pulse'),
			).toBe(true);

			vi.advanceTimersByTime(350);
			fixture.detectChanges();

			expect(fixture.componentInstance.pulse()).toBe(false);
			expect(
				fixture.nativeElement.classList.contains('lf-edge--pulse'),
			).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('applies lf-edge--selected when edge.selected is true', () => {
		fixture.componentRef.setInput('edge', makeEdge('edge-1', true));
		fixture.detectChanges();

		expect(
			fixture.nativeElement.classList.contains('lf-edge--selected'),
		).toBe(true);
	});

	it('enables pointer-events on the host so path hover can reach lf-edge', () => {
		expect(getComputedStyle(fixture.nativeElement).pointerEvents).toBe(
			'all',
		);
	});

	it('marks the lower loop leg as back-edge and dashes when sizes are missing', () => {
		model.edges.set([
			makeEdge('edge-1'),
			{
				id: 'edge-rev',
				source: 'n2',
				target: 'n1',
				sourcePort: 'out:b',
				targetPort: 'in:a',
				data: {},
			},
		]);
		fixture.componentRef.setInput(
			'edge',
			makeEdge('edge-1', false, {
				sourcePosition: { x: 400, y: 200 },
				targetPosition: { x: 100, y: 80 },
			}),
		);
		fixture.detectChanges();

		expect(fixture.componentInstance.isBack()).toBe(true);
		expect(fixture.nativeElement.classList.contains('lf-edge--back')).toBe(
			true,
		);
		expect(fixture.componentInstance.dash()).toBe(BACK_EDGE_DASHARRAY);
	});

	it('clears dash when lower-source back-edge node sizes are known', () => {
		// n1 (source) below n2 (target), two-node loop
		model.nodes.set([
			{
				id: 'n1',
				position: { x: 180, y: 240 },
				size: { width: 160, height: 100 },
				data: {},
			},
			{
				id: 'n2',
				position: { x: 200, y: 0 },
				size: { width: 180, height: 200 },
				data: {},
			},
		]);
		model.edges.set([
			makeEdge('edge-1'),
			{
				id: 'edge-rev',
				source: 'n2',
				target: 'n1',
				sourcePort: 'out:b',
				targetPort: 'in:a',
				data: {},
			},
		]);
		fixture.componentRef.setInput(
			'edge',
			makeEdge('edge-1', false, {
				sourcePosition: { x: 340, y: 320 },
				targetPosition: { x: 200, y: 40 },
			}),
		);
		fixture.detectChanges();

		expect(fixture.componentInstance.isBack()).toBe(true);
		expect(fixture.componentInstance.dash()).toBeUndefined();
	});

	it('does not treat one-way upward wires as back-edges', () => {
		model.edges.set([makeEdge('edge-1')]);
		fixture.componentRef.setInput(
			'edge',
			makeEdge('edge-1', false, {
				sourcePosition: { x: 400, y: 200 },
				targetPosition: { x: 100, y: 80 },
			}),
		);
		fixture.detectChanges();

		expect(fixture.componentInstance.isBack()).toBe(false);
		expect(fixture.nativeElement.classList.contains('lf-edge--back')).toBe(
			false,
		);
		expect(fixture.componentInstance.dash()).toBeUndefined();
	});

	it('does not treat upper→lower forward wires as back-edges', () => {
		model.edges.set([
			makeEdge('edge-1'),
			{
				id: 'edge-rev',
				source: 'n2',
				target: 'n1',
				sourcePort: 'out:b',
				targetPort: 'in:a',
				data: {},
			},
		]);
		fixture.componentRef.setInput(
			'edge',
			makeEdge('edge-1', false, {
				sourcePosition: { x: 100, y: 80 },
				targetPosition: { x: 400, y: 200 },
			}),
		);
		fixture.detectChanges();

		expect(fixture.componentInstance.isBack()).toBe(false);
		expect(fixture.nativeElement.classList.contains('lf-edge--back')).toBe(
			false,
		);
		expect(fixture.componentInstance.dash()).toBeUndefined();
	});

	it('re-evaluates isBack when source/target vertical order changes', () => {
		model.nodes.set([
			{
				id: 'n1',
				position: { x: 180, y: 240 },
				size: { width: 160, height: 100 },
				data: {},
			},
			{
				id: 'n2',
				position: { x: 200, y: 0 },
				size: { width: 180, height: 200 },
				data: {},
			},
		]);
		model.edges.set([
			makeEdge('edge-1'),
			{
				id: 'edge-rev',
				source: 'n2',
				target: 'n1',
				sourcePort: 'out:b',
				targetPort: 'in:a',
				data: {},
			},
		]);
		fixture.componentRef.setInput(
			'edge',
			makeEdge('edge-1', false, {
				sourcePosition: { x: 340, y: 320 },
				targetPosition: { x: 200, y: 40 },
			}),
		);
		fixture.detectChanges();
		expect(fixture.componentInstance.isBack()).toBe(true);

		// Swap vertical order: source n1 now above target n2
		model.nodes.set([
			{
				id: 'n1',
				position: { x: 200, y: 0 },
				size: { width: 160, height: 100 },
				data: {},
			},
			{
				id: 'n2',
				position: { x: 180, y: 240 },
				size: { width: 160, height: 100 },
				data: {},
			},
		]);
		fixture.detectChanges();
		expect(fixture.componentInstance.isBack()).toBe(false);
		expect(fixture.nativeElement.classList.contains('lf-edge--back')).toBe(
			false,
		);
	});

	it('does not treat stacked forward wires (upper→lower) as back-edges', () => {
		model.nodes.set([
			{
				id: 'n1',
				position: { x: 200, y: 0 },
				size: { width: 180, height: 200 },
				data: {},
			},
			{
				id: 'n2',
				position: { x: 180, y: 240 },
				size: { width: 160, height: 100 },
				data: {},
			},
		]);
		fixture.componentRef.setInput(
			'edge',
			makeEdge('edge-1', false, {
				sourcePosition: { x: 380, y: 100 },
				targetPosition: { x: 180, y: 260 },
			}),
		);
		fixture.detectChanges();

		expect(fixture.componentInstance.isBack()).toBe(false);
		expect(fixture.componentInstance.dash()).toBeUndefined();
	});
});
