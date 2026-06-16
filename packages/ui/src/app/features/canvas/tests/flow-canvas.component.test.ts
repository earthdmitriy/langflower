// @vitest-environment jsdom

import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { EdgeId, NodeId, RuntimeEdge } from '@langflower/runtime';
import type {
	PaletteConfigPayload,
	PaletteNodeDefinition,
	WorkflowNodePersisted,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { FlowCanvasComponent } from '../components/flow-canvas.component';
import { NgDiagramModelService } from 'ng-diagram';

// ---------------------------------------------------------------------------
// Mock NgDiagramModelService
// ---------------------------------------------------------------------------

class MockNgDiagramModelService {
	liveNodes: any[] = [];
	addEdges(_edges: any[]): void {}
	addNodes(_nodes: any[]): void {}
	deleteEdges(_ids: string[]): void {}
	deleteNodes(_ids: string[]): void {}
	updateNodes(_nodes: any[]): void {}
	/** `LfNodeComponent` reads this signal to derive live port rows. */
	edges(): any[] {
		return [];
	}
	/** `NgDiagramSelectionService.selection` reads this signal internally. */
	nodes(): any[] {
		return this.liveNodes;
	}
	ngOnDestroy(): void {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DRAG_MIME = 'application/x-langflower-node-type';

function createRawSubjects() {
	return {
		errors$: new Subject(),
		status$: new Subject(),
		close: vi.fn(),
		'editor.addNode.requested': new Subject(),
		'editor.updateNode.requested': new Subject(),
		'editor.addEdge.requested': new Subject(),
		'editor.paste.requested': new Subject(),
		'editor.removeEdge.requested': new Subject(),
		'editor.removeNode.requested': new Subject(),
		'editor.selectNode.requested': new Subject(),
		'editor.nodeSelected': new Subject(),
		'palette.snapshot': new Subject(),
		'customPalette.snapshot': new Subject(),
		'session.state.snapshot': new Subject(),
		'session.ready': new Subject(),
		'workflow.current.snapshot': new Subject(),
		'editor.addNodes': new Subject(),
		'editor.updateNodes': new Subject(),
		'editor.addEdges': new Subject(),
		'editor.deleteNodes': new Subject(),
		'editor.deleteEdges': new Subject(),
		'editor.viewport.requested': new Subject(),
		'editor.viewport.delta': new Subject(),
		'runner.started': new Subject(),
		'runner.startNode.started': new Subject(),
		'runner.interrupted': new Subject(),
		'runner.done': new Subject(),
		'runner.output-emitted': new Subject(),
		'runner.input-received': new Subject(),
		'viewport.snapshot': new Subject(),
		'runner.snapshot': new Subject(),
		'executionFeed.snapshot': new Subject(),
		'toolConfig.snapshot': new Subject(),
		'editor.dividers.requested': new Subject(),
		'editor.dividers.snapshot': new Subject(),
		'langflower.config.snapshot': new Subject(),
		'langflower.models.catalog.snapshot': new Subject(),
		'workflow.list.snapshot': new Subject(),
		'workflow.currentStatus.snapshot': new Subject(),
	} as const;
}

type RawSubjects = ReturnType<typeof createRawSubjects>;

function makeNode(
	id: string,
	overrides: Partial<WorkflowNodePersisted> = {},
): WorkflowNodePersisted {
	const base: WorkflowNodePersisted = {
		id,
		type: 'common-constant',
		params: {},
		inputs: {},
		ui: {
			position: { x: 100, y: 200 },
			label: id,
		},
	};

	return {
		...base,
		...overrides,
		ui: {
			...base.ui,
			...(overrides.ui ?? {}),
			position: {
				...base.ui.position,
				...((overrides.ui as any)?.position ?? {}),
			},
		},
	};
}

function makeEdge(id: string, source: string, target: string): RuntimeEdge {
	return {
		edgeId: id as EdgeId,
		fromNodeId: source as NodeId,
		fromPort: ['out', 0],
		toNodeId: target as NodeId,
		toPort: ['in', 0],
	};
}

function emptyPalette(): PaletteConfigPayload {
	return { nodes: [] };
}

function paletteWith(
	defs: readonly PaletteNodeDefinition[],
): PaletteConfigPayload {
	return { nodes: [...defs] };
}

function emptyGraph(): WorkflowPersistedGraph {
	return {
		viewport: { x: 0, y: 0, scale: 1 },
		nodes: [],
		edges: [],
	};
}

function graphWith(
	nodes: readonly WorkflowNodePersisted[],
	edges: readonly RuntimeEdge[] = [],
): WorkflowPersistedGraph {
	return {
		viewport: { x: 0, y: 0, scale: 1 },
		nodes: [...nodes],
		edges: [...edges],
	};
}

// ---------------------------------------------------------------------------
// DataTransfer polyfill (jsdom doesn't provide it)
// ---------------------------------------------------------------------------

class DataTransferPolyfill {
	private store = new Map<string, string>();

	setData(type: string, value: string) {
		this.store.set(type, value);
	}

	getData(type: string): string {
		return this.store.get(type) ?? '';
	}

	get types(): readonly string[] {
		return [...this.store.keys()];
	}

	get effectAllowed(): string {
		return 'copy';
	}
}

// ---------------------------------------------------------------------------
// Test Host
// ---------------------------------------------------------------------------

@Component({
	standalone: true,
	imports: [FlowCanvasComponent],
	template: `<lf-flow-canvas
		[graphInput]="graphInput()"
		[palette]="palette()"
	/>`,
})
class TestHostComponent {
	readonly graphInput = signal<WorkflowPersistedGraph>(emptyGraph());
	readonly palette = signal<PaletteConfigPayload>(emptyPalette());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowCanvasComponent', () => {
	let raw: RawSubjects;
	let fixture: ComponentFixture<TestHostComponent>;
	let host: TestHostComponent;
	let canvas: FlowCanvasComponent;
	let modelService: MockNgDiagramModelService;

	beforeAll(() => {
		if (typeof globalThis.ResizeObserver === 'undefined') {
			globalThis.ResizeObserver = class {
				observe() {}
				unobserve() {}
				disconnect() {}
			};
		}
		if (typeof globalThis.DataTransfer === 'undefined') {
			(globalThis as any).DataTransfer = DataTransferPolyfill;
		}
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(async () => {
		TestBed.resetTestingModule();
		raw = createRawSubjects();
		modelService = new MockNgDiagramModelService();

		TestBed.overrideProvider(NgDiagramModelService, {
			useValue: modelService,
		});

		await TestBed.configureTestingModule({
			imports: [TestHostComponent, FlowCanvasComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw, cached: raw },
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(TestHostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();

		const debugEl = fixture.debugElement.children[0];
		canvas = debugEl!.componentInstance;
	});

	it('creates', () => {
		expect(canvas).toBeTruthy();
	});

	it('renders ng-diagram when graph has nodes', () => {
		host.graphInput.set(graphWith([makeNode('n1')]));
		fixture.detectChanges();

		const diagram = fixture.nativeElement.querySelector('ng-diagram');
		expect(diagram).not.toBeNull();
	});

	it('emits addNode.requested on handleDrop', () => {
		const spy = vi.spyOn(raw['editor.addNode.requested'], 'next');

		const dt = new DataTransfer();
		dt.setData(DRAG_MIME, 'common-constant');

		canvas.hostHandlers.handleDrop({
			dataTransfer: dt,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 100,
			clientY: 200,
		} as unknown as DragEvent);

		expect(spy).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'common-constant',
				position: expect.objectContaining({ x: expect.any(Number) }),
			}),
		);
	});

	it('emits updateNode.requested on handleNodeDragEnded', () => {
		const spy = vi.spyOn(raw['editor.updateNode.requested'], 'next');

		canvas.handlers.handleNodeDragEnded({
			nodes: [{ id: 'n1', position: { x: 50, y: 60 } }],
		} as any);

		expect(spy).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledWith({
			nodeId: 'n1',
			position: { x: 50, y: 60 },
		});
	});

	it('emits updateNode.requested (ui) on handleNodeResizeEnded', () => {
		const spy = vi.spyOn(raw['editor.updateNode.requested'], 'next');

		canvas.handlers.handleNodeResizeEnded({
			node: { id: 'n1', size: { width: 200, height: 100 } },
		} as any);

		expect(spy).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledWith({
			nodeId: 'n1',
			ui: { width: 200, height: 100 },
		});
	});

	it('emits addEdge.requested on handleEdgeDrawEnded', () => {
		const spy = vi.spyOn(raw['editor.addEdge.requested'], 'next');

		canvas.handlers.handleEdgeDrawEnded({
			success: true,
			edge: {
				source: 'n1',
				target: 'n2',
				sourcePort: 'out:value',
				targetPort: 'in:value',
			},
		} as any);

		expect(spy).toHaveBeenCalledOnce();
		const emitted = spy.mock.calls[0]![0] as any;
		expect(emitted.fromNodeId).toBe('n1');
		expect(emitted.toNodeId).toBe('n2');
	});

	it('strips optimistic clones and emits paste.requested on clipboardPasted', () => {
		const pasteSpy = vi.spyOn(raw['editor.paste.requested'], 'next');
		// Component-scoped provideNgDiagram() — spy the instance on the canvas
		const modelService = (
			canvas as unknown as { diagramModel: MockNgDiagramModelService }
		).diagramModel;
		const deleteEdgesSpy = vi.spyOn(modelService, 'deleteEdges');
		const deleteNodesSpy = vi.spyOn(modelService, 'deleteNodes');

		canvas.handlers.handleClipboardPasted({
			nodes: [
				{
					id: 'temp-a',
					position: { x: 10, y: 20 },
					size: { width: 180, height: 90 },
					data: {
						id: 'temp-a',
						type: 'common-string',
						params: {},
						inputs: { value: 'x' },
						ui: { position: { x: 10, y: 20 }, label: 'A' },
						portsConfig: {
							inputsConfigs: [],
							outputsConfigs: [],
							bypassPorts: {},
						},
					},
				},
			],
			edges: [],
		} as any);

		expect(deleteEdgesSpy).not.toHaveBeenCalled();
		expect(deleteNodesSpy).toHaveBeenCalledWith(['temp-a']);
		expect(pasteSpy).toHaveBeenCalledOnce();
		expect(pasteSpy).toHaveBeenCalledWith({
			nodes: [
				{
					clientId: 'temp-a',
					type: 'common-string',
					position: { x: 10, y: 20, width: 180, height: 90 },
					params: {},
					inputs: { value: 'x' },
					label: 'A',
				},
			],
			edges: [],
		});
	});

	it('emits removeNode.requested and removeEdge.requested on handleSelectionRemoved', () => {
		const nodeSpy = vi.spyOn(raw['editor.removeNode.requested'], 'next');
		const edgeSpy = vi.spyOn(raw['editor.removeEdge.requested'], 'next');

		canvas.handlers.handleSelectionRemoved({
			deletedNodes: [{ id: 'n1' }],
			deletedEdges: [{ id: 'e1' }],
		} as any);

		expect(nodeSpy).toHaveBeenCalledWith('n1');
		expect(edgeSpy).toHaveBeenCalledWith('e1');
	});

	it('emits editor.selectNode.requested on handleSelectionChanged', () => {
		const spy = vi.spyOn(raw['editor.selectNode.requested'], 'next');

		canvas.handlers.handleSelectionChanged({
			selectedNodes: [{ id: 'n1' }],
			selectedEdges: [],
		} as any);

		expect(spy).toHaveBeenCalledWith({ nodeId: 'n1' });
	});

	it('emits nodeId null on handleSelectionChanged when nothing is selected and no selection was confirmed yet', () => {
		const spy = vi.spyOn(raw['editor.selectNode.requested'], 'next');

		canvas.handlers.handleSelectionChanged({
			selectedNodes: [],
			selectedEdges: [],
		} as any);

		expect(spy).toHaveBeenCalledWith({ nodeId: null });
	});

	it('skips re-sending selectNode.requested for a selection matching the last server-confirmed id (loop guard)', () => {
		raw['session.state.snapshot'].next({
			selectedNode: { id: 'n1' },
		} as any);

		const spy = vi.spyOn(raw['editor.selectNode.requested'], 'next');

		canvas.handlers.handleSelectionChanged({
			selectedNodes: [{ id: 'n1' }],
			selectedEdges: [],
		} as any);

		expect(spy).not.toHaveBeenCalled();
	});

	it('ignores handleDrop when drag data is not palette MIME', () => {
		const spy = vi.spyOn(raw['editor.addNode.requested'], 'next');

		const dt = new DataTransfer();
		dt.setData('text/plain', 'n1');

		canvas.hostHandlers.handleDrop({
			dataTransfer: dt,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			clientX: 100,
			clientY: 200,
		} as unknown as DragEvent);

		expect(spy).not.toHaveBeenCalled();
	});

	it('ignores handleEdgeDrawEnded when success is false', () => {
		const spy = vi.spyOn(raw['editor.addEdge.requested'], 'next');

		canvas.handlers.handleEdgeDrawEnded({
			success: false,
			edge: { source: 'n1', target: 'n2' },
		} as any);

		expect(spy).not.toHaveBeenCalled();
	});

	it('ignores handleSelectionRemoved when deleted arrays are empty', () => {
		const nodeSpy = vi.spyOn(raw['editor.removeNode.requested'], 'next');
		const edgeSpy = vi.spyOn(raw['editor.removeEdge.requested'], 'next');

		canvas.handlers.handleSelectionRemoved({
			deletedNodes: [],
			deletedEdges: [],
		} as any);

		expect(nodeSpy).not.toHaveBeenCalled();
		expect(edgeSpy).not.toHaveBeenCalled();
	});

	// --- Bridge delta reactions ---

	it('adds nodes when editor.addNodes fires', () => {
		host.graphInput.set(graphWith([makeNode('existing')]));
		fixture.detectChanges();

		raw['editor.addNodes'].next([makeNode('added')]);

		expect(canvas.modelAdapter()).toBeTruthy();
	});

	it('updates nodes when editor.updateNodes fires', () => {
		host.graphInput.set(graphWith([makeNode('n1')]));
		fixture.detectChanges();

		raw['editor.updateNodes'].next([
			makeNode('n1', {
				ui: { position: { x: 999, y: 999 }, label: 'updated' },
			}),
		]);

		expect(canvas.modelAdapter()).toBeTruthy();
	});

	it('deletes nodes when editor.deleteNodes fires', () => {
		host.graphInput.set(graphWith([makeNode('n1'), makeNode('n2')]));
		fixture.detectChanges();

		raw['editor.deleteNodes'].next([{ id: 'n1' }]);

		expect(canvas.modelAdapter()).toBeTruthy();
	});

	it('adds edges when editor.addEdges fires', () => {
		host.graphInput.set(
			graphWith(
				[makeNode('n1'), makeNode('n2')],
				[makeEdge('e1', 'n1', 'n2')],
			),
		);
		fixture.detectChanges();

		raw['editor.addEdges'].next([makeEdge('e2', 'n1', 'n2')]);

		expect(canvas.modelAdapter()).toBeTruthy();
	});

	it('deletes edges when editor.deleteEdges fires', () => {
		host.graphInput.set(
			graphWith(
				[makeNode('n1'), makeNode('n2')],
				[makeEdge('e1', 'n1', 'n2')],
			),
		);
		fixture.detectChanges();

		raw['editor.deleteEdges'].next([{ id: 'e1' }]);

		expect(canvas.modelAdapter()).toBeTruthy();
	});

	it('updates viewport when editor.viewport.delta fires', () => {
		host.graphInput.set(graphWith([makeNode('n1')]));
		fixture.detectChanges();

		raw['editor.viewport.delta'].next({ x: 50, y: 60, scale: 1.5 });

		expect(canvas.modelAdapter()).toBeTruthy();
	});

	// --- Palette integration ---

	it('passes palette to persistedNodeToDiagram', () => {
		const nodeDef = {
			type: 'common-constant',
			category: 'core',
			inputsConfigs: [],
			outputsConfigs: [{ name: 'value' }],
			bypassPorts: {},
			uiSchema: [],
			source: 'system',
		} as unknown as PaletteNodeDefinition;

		host.palette.set(paletteWith([nodeDef]));
		host.graphInput.set(
			graphWith([makeNode('n1', { type: 'common-constant' })]),
		);
		fixture.detectChanges();

		const diagram = fixture.nativeElement.querySelector('ng-diagram');
		expect(diagram).not.toBeNull();
	});

	it('keeps modelAdapter identity when only palette changes', () => {
		const nodeDef = {
			type: 'common-constant',
			category: 'core',
			inputsConfigs: [],
			outputsConfigs: [{ name: 'value' }],
			bypassPorts: {},
			uiSchema: [],
			source: 'system',
		} as unknown as PaletteNodeDefinition;

		host.graphInput.set(
			graphWith([makeNode('n1', { type: 'common-constant' })]),
		);
		host.palette.set(emptyPalette());
		fixture.detectChanges();
		const firstAdapter = canvas.modelAdapter();

		// Component-scoped `provideNgDiagram()` owns the live model; seed
		// the TestBed mock so the palette patch path still sees nodes if
		// that override wins, and spy both.
		modelService.liveNodes = [
			{
				id: 'n1',
				data: {
					type: 'common-constant',
					portsConfig: {
						inputsConfigs: [],
						outputsConfigs: [],
						bypassPorts: {},
					},
				},
			},
		];
		const componentModel = (
			canvas as unknown as { diagramModel: NgDiagramModelService }
		).diagramModel;
		const updateSpy = vi.spyOn(componentModel, 'updateNodes');

		host.palette.set(paletteWith([nodeDef]));
		fixture.detectChanges();

		expect(canvas.modelAdapter()).toBe(firstAdapter);
		expect(updateSpy).toHaveBeenCalled();
		const patched = updateSpy.mock.calls[0]?.[0]?.[0] as
			{ data?: { portsConfig?: unknown } } | undefined;
		expect(patched?.data?.portsConfig).toBe(nodeDef);
	});

	// --- Node rendering with ports ---

	it('renders nodes in the diagram DOM', () => {
		host.graphInput.set(
			graphWith([
				makeNode('n1', {
					ui: { position: { x: 10, y: 20 }, label: 'Node One' },
				}),
				makeNode('n2', {
					ui: { position: { x: 200, y: 20 }, label: 'Node Two' },
				}),
			]),
		);
		fixture.detectChanges();

		const content = fixture.nativeElement.textContent;
		expect(content).toContain('Node One');
		expect(content).toContain('Node Two');
	});

	it('renders node labels from persistedNodeToDiagram', () => {
		host.graphInput.set(
			graphWith([
				makeNode('n1', {
					ui: { position: { x: 10, y: 20 }, label: 'My Constant' },
				}),
			]),
		);
		fixture.detectChanges();

		const content = fixture.nativeElement.textContent;
		expect(content).toContain('My Constant');
	});
});
