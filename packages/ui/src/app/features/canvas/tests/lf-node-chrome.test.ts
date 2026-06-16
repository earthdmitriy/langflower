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
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
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
		'runner.output-emitted': new Subject(),
		'runner.started': new Subject(),
		'runner.startNode.started': new Subject(),
		'runner.input-received': new Subject(),
		'runner.done': new Subject(),
		'runner.interrupted': new Subject(),
		'workflow.current.snapshot': new Subject(),
		'palette.snapshot': new Subject(),
		'customPalette.snapshot': new Subject(),
		'editor.updateNode.requested': new Subject(),
	} as const;
}

type Raw = ReturnType<typeof createRaw>;

function makeNode(id: string): SimpleNode<LfNodeData> {
	return {
		id,
		type: 'lf-node',
		position: { x: 0, y: 0 },
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

function outputPending(runId: string, nodeId: string, edgeIds: string[] = []) {
	return {
		kind: 'output-emitted' as const,
		runId,
		nodeId,
		portId: 'response',
		portIdx: 0,
		edgeIds,
		state: 'pending' as const,
		value: undefined,
	};
}

function outputValue(runId: string, nodeId: string, edgeIds: string[] = []) {
	return {
		kind: 'output-emitted' as const,
		runId,
		nodeId,
		portId: 'response',
		portIdx: 0,
		edgeIds,
		state: 'value' as const,
		value: 'x',
	};
}

function outputError(runId: string, nodeId: string, edgeIds: string[] = []) {
	return {
		kind: 'output-emitted' as const,
		runId,
		nodeId,
		portId: 'response',
		portIdx: 0,
		edgeIds,
		state: 'error' as const,
		value: undefined,
	};
}

describe('LfNodeComponent execution chrome (signal-driven DOM)', () => {
	let raw: Raw;
	let fixture: ComponentFixture<LfNodeComponent>;
	let service: WorkflowExecutionService;

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
		service = TestBed.inject(WorkflowExecutionService);
	});

	function chromeEl(): HTMLElement {
		return fixture.nativeElement.querySelector('.lf-node-chrome')!;
	}

	it('is pending (yellow) while an output is pending', () => {
		raw['runner.output-emitted'].next(outputPending('run-1', 'node-a'));
		fixture.detectChanges();

		expect(service.nodeStatus('node-a')).toBe('pending');
		expect(chromeEl().classList.contains('lf-node-chrome--pending')).toBe(
			true,
		);
	});

	it('is error (red) when the output errors', () => {
		raw['runner.output-emitted'].next(outputError('run-1', 'node-a'));
		fixture.detectChanges();

		expect(service.nodeStatus('node-a')).toBe('error');
		expect(chromeEl().classList.contains('lf-node-chrome--error')).toBe(
			true,
		);
	});

	it('keeps settled chrome on run done', () => {
		raw['runner.output-emitted'].next(outputValue('run-1', 'node-a'));
		fixture.detectChanges();
		expect(service.nodeStatus('node-a')).toBe('value');
		expect(chromeEl().classList.contains('lf-node-chrome--value')).toBe(
			true,
		);

		raw['runner.done'].next({ kind: 'done', runId: 'run-1' });
		fixture.detectChanges();
		expect(service.nodeStatus('node-a')).toBe('value');
		expect(chromeEl().classList.contains('lf-node-chrome--value')).toBe(
			true,
		);
	});

	it('flashes the pulse class on a delivered value, then clears it', () => {
		vi.useFakeTimers();
		try {
			raw['runner.output-emitted'].next(outputValue('run-1', 'node-a'));
			fixture.detectChanges();

			expect(fixture.componentInstance.pulse()).toBe(true);
			expect(chromeEl().classList.contains('lf-node-chrome--pulse')).toBe(
				true,
			);

			vi.advanceTimersByTime(350);
			fixture.detectChanges();

			expect(fixture.componentInstance.pulse()).toBe(false);
			expect(chromeEl().classList.contains('lf-node-chrome--pulse')).toBe(
				false,
			);
		} finally {
			vi.useRealTimers();
		}
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
