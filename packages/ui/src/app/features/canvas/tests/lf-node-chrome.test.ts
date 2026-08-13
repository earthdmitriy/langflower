// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Component } from '@angular/core';
import {
	NgDiagramModelService,
	NgDiagramNodeResizeAdornmentComponent,
	NgDiagramNodeService,
	NgDiagramSelectionService,
	NgDiagramViewportService,
	type SimpleNode,
} from 'ng-diagram';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasNodeStatusService } from '../../canvas-node-status-folding/canvas-node-status.service';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { NodeHoverService } from '../../../services/node-hover.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfNodeComponent } from '../components/lf-node.component';
import type { LfNodeData } from '../components/lf-node.component';

@Component({
	selector: 'ng-diagram-node-resize-adornment',
	standalone: true,
	template: '<ng-content />',
})
class MockNodeResizeAdornment {}

class MockNgDiagramModelService {
	addEdges(): void {}
	addNodes(): void {}
	deleteEdges(): void {}
	deleteNodes(): void {}
	updateNodes(): void {}
	edges(): any[] {
		return [];
	}
	nodes(): any[] {
		return [];
	}
	ngOnDestroy(): void {}
}

class MockNgDiagramNodeService {
	resizeNode(): void {}
	moveNodesBy(): void {}
	rotateNodeTo(): void {}
	bringToFront(): void {}
	sendToBack(): void {}
}

class MockNgDiagramSelectionService {
	readonly selection = () => ({ nodes: [], edges: [] });
	select(): void {}
	deselect(): void {}
	deselectAll(): void {}
	deleteSelection(): void {}
}

class MockNgDiagramViewportService {
	viewport = () => ({ x: 0, y: 0, scale: 1 });
	scale = () => 1;
	clientToFlowPosition(point: { x: number; y: number }) {
		return point;
	}
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
		'editor.updateNode.requested': new Subject(),
	} as const;
}

type Raw = ReturnType<typeof createRaw>;

function makeNode(id: string, selected = false): SimpleNode<LfNodeData> {
	return {
		id,
		type: 'lf-node',
		position: { x: 0, y: 0 },
		selected,
		data: {
			id,
			type: 'common-constant',
			params: {},
			inputs: {},
			ui: { position: { x: 0, y: 0 }, label: id },
			portsConfig: {
				inputsConfigs: [],
				outputsConfigs: [],
				bypassPorts: {},
			},
		},
	};
}

function outputPending(_runId: string, nodeId: string, edgeIds: string[] = []) {
	return [
		'out',
		nodeId,
		'response',
		'pending',
		undefined,
		0,
		edgeIds,
		null,
	] as const;
}

function outputValue(
	_runId: string,
	nodeId: string,
	options: {
		readonly edgeIds?: string[];
		readonly portId?: string;
		readonly streaming?: boolean;
	} = {},
) {
	const portId = options.portId ?? 'response';
	const edgeIds = options.edgeIds ?? [];
	const feed =
		options.streaming === true
			? ({ role: 'draft' as const, streaming: true as const } as const)
			: null;
	return ['out', nodeId, portId, 'value', 'x', 0, edgeIds, feed] as const;
}

function outputError(_runId: string, nodeId: string, edgeIds: string[] = []) {
	return [
		'out',
		nodeId,
		'response',
		'error',
		undefined,
		0,
		edgeIds,
		null,
	] as const;
}

describe('LfNodeComponent execution chrome (signal-driven DOM)', () => {
	let raw: Raw;
	let fixture: ComponentFixture<LfNodeComponent>;
	let hover: NodeHoverService;

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

		TestBed.overrideProvider(NgDiagramModelService, {
			useFactory: () => new MockNgDiagramModelService(),
		});
		TestBed.overrideProvider(NgDiagramNodeService, {
			useFactory: () => new MockNgDiagramNodeService(),
		});
		TestBed.overrideProvider(NgDiagramSelectionService, {
			useFactory: () => new MockNgDiagramSelectionService(),
		});
		TestBed.overrideProvider(NgDiagramViewportService, {
			useFactory: () => new MockNgDiagramViewportService(),
		});

		await TestBed.configureTestingModule({
			imports: [LfNodeComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw, cached: raw },
				},
				WorkflowExecutionService,
				CanvasNodeStatusService,
				NodeHoverService,
			],
		})
			.overrideComponent(LfNodeComponent, {
				remove: { imports: [NgDiagramNodeResizeAdornmentComponent] },
				add: { imports: [MockNodeResizeAdornment] },
			})
			.compileComponents();

		fixture = TestBed.createComponent(LfNodeComponent);
		fixture.componentRef.setInput('node', makeNode('node-a'));
		fixture.detectChanges();
		hover = TestBed.inject(NodeHoverService);
	});

	function chromeEl(): HTMLElement {
		return fixture.nativeElement.querySelector('.lf-node-chrome')!;
	}

	it('is pending (yellow) while an output is pending', () => {
		raw['runner.port'].next(outputPending('run-1', 'node-a'));
		fixture.detectChanges();

		expect(chromeEl().classList.contains('lf-node-chrome--pending')).toBe(
			true,
		);
	});

	it('is pending on input-received alone', () => {
		raw['runner.port'].next([
			'in',
			'node-a',
			'prompt',
			'value',
			'hi',
			0,
			[],
			null,
		]);
		fixture.detectChanges();

		expect(chromeEl().classList.contains('lf-node-chrome--pending')).toBe(
			true,
		);
	});

	it('stays pending for streaming output value', () => {
		raw['runner.port'].next(
			outputValue('run-1', 'node-a', {
				portId: 'draft',
				streaming: true,
			}),
		);
		fixture.detectChanges();

		expect(chromeEl().classList.contains('lf-node-chrome--pending')).toBe(
			true,
		);
		expect(chromeEl().classList.contains('lf-node-chrome--value')).toBe(
			false,
		);
	});

	it('is error (red) when the output errors', () => {
		raw['runner.port'].next(outputError('run-1', 'node-a'));
		fixture.detectChanges();

		expect(chromeEl().classList.contains('lf-node-chrome--error')).toBe(
			true,
		);
	});

	it('keeps settled chrome on run done', () => {
		raw['runner.port'].next(outputValue('run-1', 'node-a'));
		fixture.detectChanges();
		expect(chromeEl().classList.contains('lf-node-chrome--value')).toBe(
			true,
		);

		raw['runner.done'].next(['done', 'run-1' ]);
		fixture.detectChanges();
		expect(chromeEl().classList.contains('lf-node-chrome--value')).toBe(
			true,
		);
	});

	it('keeps amber after done when only streaming outputs fired', () => {
		raw['runner.port'].next(
			outputValue('run-1', 'node-a', { streaming: true }),
		);
		fixture.detectChanges();
		raw['runner.done'].next(['done', 'run-1' ]);
		fixture.detectChanges();

		expect(chromeEl().classList.contains('lf-node-chrome--pending')).toBe(
			true,
		);
	});

	it('flashes the pulse class on a delivered value, then clears it', () => {
		vi.useFakeTimers();
		try {
			raw['runner.port'].next(outputValue('run-1', 'node-a'));
			fixture.detectChanges();

			expect(chromeEl().classList.contains('lf-node-chrome--pulse')).toBe(
				true,
			);

			vi.advanceTimersByTime(350);
			fixture.detectChanges();

			expect(chromeEl().classList.contains('lf-node-chrome--pulse')).toBe(
				false,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('applies selected class alongside pending (CSS cascade: selected wins)', () => {
		raw['runner.port'].next(outputPending('run-1', 'node-a'));
		fixture.componentRef.setInput('node', makeNode('node-a', true));
		fixture.detectChanges();

		const el = chromeEl();
		expect(el.classList.contains('lf-node-chrome--pending')).toBe(true);
		expect(el.classList.contains('lf-node-chrome--selected')).toBe(true);
	});

	it('applies hovered class alongside value (CSS cascade: hovered wins)', () => {
		raw['runner.port'].next(outputValue('run-1', 'node-a'));
		hover.set('node-a');
		fixture.detectChanges();

		const el = chromeEl();
		expect(el.classList.contains('lf-node-chrome--value')).toBe(true);
		expect(el.classList.contains('lf-node-chrome--hovered')).toBe(true);
	});

	it('emits updateNode.requested with label on Enter commit', () => {
		const spy = vi.spyOn(raw['editor.updateNode.requested'], 'next');
		const node = fixture.componentInstance;

		node.startLabelEdit();
		fixture.detectChanges();
		node.labelDraft.set('renamed');
		node.onLabelKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

		expect(spy).toHaveBeenCalledWith({
			nodeId: 'node-a',
			ui: { label: 'renamed' },
		});
	});

	it('does not emit updateNode on Escape or blur cancel', () => {
		const spy = vi.spyOn(raw['editor.updateNode.requested'], 'next');
		const node = fixture.componentInstance;

		node.startLabelEdit();
		fixture.detectChanges();
		node.labelDraft.set('should-not-commit');
		node.onLabelKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

		expect(spy).not.toHaveBeenCalled();
		expect(node.editingLabel()).toBe(false);

		node.startLabelEdit();
		fixture.detectChanges();
		node.labelDraft.set('also-not-commit');
		node.onLabelBlur();

		expect(spy).not.toHaveBeenCalled();
		expect(node.editingLabel()).toBe(false);
	});
});
