// @vitest-environment jsdom

import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { EdgeId, NodeId, RuntimeEdge } from '@langflower/runtime';
import type {
	PaletteNodeDefinition,
	WorkflowNodePersisted,
} from '@langflower/shared/langflower';
import {
	initializeModel,
	NgDiagramComponent,
	NgDiagramModelService,
	NgDiagramNodeTemplateMap,
	provideNgDiagram,
} from 'ng-diagram';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
	persistedEdgeToDiagram,
	persistedNodeToDiagram,
} from '../../../services/bridge-diagram.service';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LfNodeComponent } from '../components/lf-node.component';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRawSubjects() {
	return {
		'editor.updateNode.requested': new Subject(),
		'runner.port': new Subject(),
		// Consumed by WorkflowExecutionService, injected by LfNodeComponent
		// for canvas execution chrome.
		'workflow.current.snapshot': new Subject(),
		'executionFeed.snapshot': new Subject(),
		'palette.snapshot': new Subject(),
		'customPalette.snapshot': new Subject(),
		'runner.started': new Subject(),
		'runner.startNode.started': new Subject(),
		'runner.done': new Subject(),
		'runner.interrupted': new Subject(),
	} as const;
}

const mergeDef = {
	type: 'common-merge',
	displayName: 'Merge',
	category: 'Flow',
	uiSchema: [],
	source: 'system',
	emitOncePerActivation: false,
	stopsRun: false,
	bypassPorts: {},
	inputsConfigs: [
		{ name: 'value', wireType: 'any', multi: 'merge' } as const,
	],
	outputsConfigs: [{ portId: 'value', wireType: 'any' }],
} as unknown as PaletteNodeDefinition;

const sourceDef = {
	type: 'test-source',
	displayName: 'Source',
	category: 'Flow',
	uiSchema: [],
	source: 'system',
	emitOncePerActivation: false,
	stopsRun: false,
	bypassPorts: {},
	inputsConfigs: [],
	outputsConfigs: [{ portId: 'out', wireType: 'any' }],
} as unknown as PaletteNodeDefinition;

const bypassDef = {
	type: 'test-bypass',
	displayName: 'Bypass',
	category: 'Flow',
	uiSchema: [],
	source: 'system',
	emitOncePerActivation: false,
	stopsRun: false,
	bypassPorts: { ch: 'dynamic' },
	inputsConfigs: [],
	outputsConfigs: [],
} as unknown as PaletteNodeDefinition;

function makeNode(id: string, type: string): WorkflowNodePersisted {
	return {
		id,
		type,
		params: {},
		inputs: {},
		ui: {
			position: { x: 100, y: 200 },
			label: id,
		},
	};
}

function makeEdge(
	id: string,
	source: string,
	target: string,
	handles: {
		sourceHandle?: string;
		targetHandle?: string;
	} = {},
): RuntimeEdge {
	return {
		edgeId: id as EdgeId,
		fromNodeId: source as NodeId,
		fromPort: [handles.sourceHandle ?? 'out', 0],
		toNodeId: target as NodeId,
		toPort: [handles.targetHandle ?? 'value', 0],
	};
}

/**
 * Ports are no longer stored on node `data` — they are derived live inside
 * `LfNodeComponent` from the diagram's edges signal (see
 * `resolve-diagram-node-ports.ts` usage there). Tests must therefore read the
 * rendered component's `inputPortRows()`/`bypassPortRows()` computed signals
 * directly instead of inspecting `node.data`.
 */
function findLfNode(
	fixture: ComponentFixture<DynamicPortTestHost>,
	nodeId: string,
): LfNodeComponent {
	const match = fixture.debugElement
		.queryAll(By.directive(LfNodeComponent))
		.find(
			(el) =>
				(el.componentInstance as LfNodeComponent).node().id === nodeId,
		);

	if (match === undefined) {
		throw new Error(`lf-node "${nodeId}" is not rendered`);
	}

	return match.componentInstance as LfNodeComponent;
}

function inputPortIds(component: LfNodeComponent): string[] {
	return component.inputPortRows().map((p) => p.portId);
}

function bypassHandles(component: LfNodeComponent): string[] {
	return component.bypassPortRows().map((p) => p.handle);
}

/**
 * Drain the async `FlowCore` command-handler middleware pipeline (see
 * docs/NG_DIAGRAM.md). A single macrotask tick is not always enough — the
 * middleware chain can take a few ticks to resolve before `model.onChange`
 * fires and the `edges()`/`nodes()` signals update — so this yields several
 * times rather than once.
 */
const drainModelUpdate = async (): Promise<void> => {
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setTimeout(r, 0));
	}
};

// ---------------------------------------------------------------------------
// Test host — plain pass-through to NgDiagramModelService, matching the
// simplified editor.addEdges/deleteEdges/updateNodes handlers in
// FlowCanvasComponent. There is no client-side port patching left to test
// here — the point of this suite is that LfNodeComponent's own port rows
// stay correct across live edge/node mutations without any patching.
// ---------------------------------------------------------------------------

@Component({
	standalone: true,
	imports: [NgDiagramComponent],
	providers: [provideNgDiagram()],
	template: `<ng-diagram
		[model]="model"
		[nodeTemplateMap]="nodeTemplateMap"
	/>`,
})
class DynamicPortTestHost {
	readonly modelService = inject(NgDiagramModelService);

	readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
		['lf-node', LfNodeComponent],
	]);

	model = initializeModel({
		nodes: [],
		edges: [],
		metadata: { viewport: { x: 0, y: 0, scale: 1 } },
	});

	addNode(id: string, def: PaletteNodeDefinition): void {
		const node = persistedNodeToDiagram(
			makeNode(id, def.type),
			new Map([[def.type, def]]),
		);
		this.modelService.addNodes([node]);
	}

	addEdges(edges: RuntimeEdge[]): void {
		this.modelService.addEdges(edges.map(persistedEdgeToDiagram));
	}

	removeEdges(edges: RuntimeEdge[]): void {
		this.modelService.deleteEdges(edges.map((e) => e.edgeId));
	}

	/** Simulates a node update unrelated to ports/edges, e.g. a drag. */
	movePosition(id: string, x: number, y: number): void {
		this.modelService.updateNodes([{ id, position: { x, y } }]);
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dynamic port update (reactive derivation in LfNodeComponent)', () => {
	let fixture: ComponentFixture<DynamicPortTestHost>;
	let host: DynamicPortTestHost;

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

		await TestBed.configureTestingModule({
			imports: [DynamicPortTestHost],
			providers: [
				provideNgDiagram(),
				{
					provide: LangflowerBridgeService,
					useValue: (() => {
						const raw = createRawSubjects();
						return { raw, cached: raw };
					})(),
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(DynamicPortTestHost);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('creates test host with ng-diagram', () => {
		const diagram = fixture.nativeElement.querySelector('ng-diagram');
		expect(diagram).not.toBeNull();
	});

	it('grows multi-input ports when an edge is added', async () => {
		host.addNode('n0', sourceDef);
		host.addNode('n1', mergeDef);
		await fixture.whenStable();
		fixture.detectChanges();

		host.addEdges([makeEdge('e1', 'n0', 'n1')]);
		await drainModelUpdate();

		expect(inputPortIds(findLfNode(fixture, 'n1'))).toEqual([
			'in:value',
			'in:value@1',
		]);
	});

	it('shrinks multi-input ports when the last edge is removed', async () => {
		host.addNode('n0', sourceDef);
		host.addNode('n1', mergeDef);
		await fixture.whenStable();
		fixture.detectChanges();

		const edge = makeEdge('e1', 'n0', 'n1');
		host.addEdges([edge]);
		await drainModelUpdate();

		host.removeEdges([edge]);
		await drainModelUpdate();

		expect(inputPortIds(findLfNode(fixture, 'n1'))).toEqual(['in:value']);
	});

	it('grows bypass ports when an edge is added', async () => {
		host.addNode('n0', sourceDef);
		host.addNode('n1', bypassDef);
		await fixture.whenStable();
		fixture.detectChanges();

		host.addEdges([makeEdge('e1', 'n0', 'n1', { targetHandle: 'ch' })]);
		await drainModelUpdate();

		expect(bypassHandles(findLfNode(fixture, 'n1'))).toEqual([
			'ch',
			'ch@1',
		]);
	});

	it('shrinks bypass ports when the last edge is removed', async () => {
		host.addNode('n0', sourceDef);
		host.addNode('n1', bypassDef);
		await fixture.whenStable();
		fixture.detectChanges();

		const edge = makeEdge('e1', 'n0', 'n1', { targetHandle: 'ch' });
		host.addEdges([edge]);
		await drainModelUpdate();

		host.removeEdges([edge]);
		await drainModelUpdate();

		expect(bypassHandles(findLfNode(fixture, 'n1'))).toEqual(['ch']);
	});

	/**
	 * Regression test for the reported race condition: adding an edge to a
	 * bypass/multi port grows the port row, and an unrelated node update
	 * (e.g. dragging the node, which only patches `position`) must NOT wipe
	 * that trailing empty slot. Before this fix, `editor.updateNodes`
	 * recomputed `data.ports` from a stale edge snapshot (`graphInput().edges`)
	 * and reverted the growth applied by the previous `editor.addEdges`
	 * handler — see docs/FOUND_BUGS.md. Ports are now derived live from the
	 * diagram's own edges signal, so there is nothing on `data` left to go
	 * stale.
	 */
	it('keeps the trailing empty bypass slot after an unrelated node update (drag)', async () => {
		host.addNode('n0', sourceDef);
		host.addNode('n1', bypassDef);
		await fixture.whenStable();
		fixture.detectChanges();

		host.addEdges([makeEdge('e1', 'n0', 'n1', { targetHandle: 'ch' })]);
		await drainModelUpdate();

		expect(bypassHandles(findLfNode(fixture, 'n1'))).toEqual([
			'ch',
			'ch@1',
		]);

		host.movePosition('n1', 480, 200);
		await drainModelUpdate();

		expect(bypassHandles(findLfNode(fixture, 'n1'))).toEqual([
			'ch',
			'ch@1',
		]);
	});
});
