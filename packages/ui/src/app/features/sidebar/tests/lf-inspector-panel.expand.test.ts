// @vitest-environment jsdom

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import type { WorkflowPersistedGraph } from '@langflower/shared/types/langflower-workflow';
import { of, Subject } from 'rxjs';
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfInspectorPanelComponent } from '../components/lf-inspector-panel.component';

const definition = {
	type: 'demo-prompt',
	displayName: 'Prompt',
	category: 'Text',
	description: 'A prompt node',
	source: 'system',
	inputsConfigs: [
		{
			portId: 'prompt',
			name: 'Prompt',
			wireType: 'string',
			inline: 'text-multiline',
		},
	],
	outputsConfigs: [],
	uiSchema: [
		{
			field: 'system',
			type: 'json',
			label: 'System',
		},
	],
	stopsRun: false,
	emitOncePerActivation: false,
	chatEntry: false,
	bypassPorts: {},
} as unknown as PaletteNodeDefinition;

const selectedNode = {
	id: 'node-a',
	type: 'demo-prompt',
	params: { system: 'panel text' },
	inputs: { prompt: 'port text' },
	ui: { position: { x: 0, y: 0 }, label: 'node-a' },
	definition,
};

const dialogTextarea = (): HTMLTextAreaElement => {
	const textarea = document
		.querySelector('lf-text-expand-dialog')
		?.querySelector('textarea');

	if (!(textarea instanceof HTMLTextAreaElement)) {
		throw new Error('expand dialog textarea missing');
	}

	return textarea;
};

describe('LfInspectorPanelComponent expand', () => {
	let fixture: ComponentFixture<LfInspectorPanelComponent>;
	const activeGraph = signal<WorkflowPersistedGraph | null>(null);
	let updateNode: Subject<{
		readonly nodeId: string;
		readonly params?: Readonly<Record<string, unknown>>;
		readonly inputs?: Readonly<Record<string, unknown>>;
	}>;

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
		updateNode = new Subject();
		activeGraph.set(null);
		TestBed.resetTestingModule();

		await TestBed.configureTestingModule({
			imports: [LfInspectorPanelComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: {
						raw: {
							'editor.updateNode.requested': updateNode,
							'editor.selectNode.requested': new Subject(),
						},
						cached: {
							'editor.updateNode.requested': new Subject(),
						},
					},
				},
				{
					provide: WorkflowExecutionService,
					useValue: {
						isRunning: signal(false),
						activeGraph,
						latestOutputValue: () => undefined,
					},
				},
				{
					provide: SelectedNodeProjectionService,
					useValue: {
						selectedNode: signal(selectedNode),
						selectedNode$: of(selectedNode),
					},
				},
				{
					provide: LangflowerConfigProjectionService,
					useValue: {
						config: signal({}),
						config$: of({}),
					},
				},
				{
					provide: ModelsCatalogProjectionService,
					useValue: {
						catalogs$: of({}),
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(LfInspectorPanelComponent);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
	});

	afterEach(() => {
		fixture.destroy();
	});

	it('sends params from a panel textarea dialog', () => {
		const spy = vi.spyOn(updateNode, 'next');
		const buttons = fixture.nativeElement.querySelectorAll(
			'button[aria-label="Expand"]',
		);
		expect(buttons).toHaveLength(2);

		buttons[0].click();
		fixture.detectChanges();

		expect(document.body.textContent).toContain('System');
		const modal = dialogTextarea();
		expect(modal.value).toBe('panel text');
		modal.value = 'panel next';
		modal.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

		expect(spy).toHaveBeenCalledWith({
			nodeId: 'node-a',
			params: { system: 'panel next' },
		});
	});

	it('sends inputs from an input-port textarea dialog', () => {
		const spy = vi.spyOn(updateNode, 'next');
		const buttons = fixture.nativeElement.querySelectorAll(
			'button[aria-label="Expand"]',
		);

		buttons[1].click();
		fixture.detectChanges();

		expect(document.body.textContent).toContain('Prompt');
		const modal = dialogTextarea();
		expect(modal.value).toBe('port text');
		modal.value = 'port next';
		modal.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

		expect(spy).toHaveBeenCalledWith({
			nodeId: 'node-a',
			inputs: { prompt: 'port next' },
		});
	});

	it('locks a wired input and hides Expand, while panel fields stay editable', () => {
		activeGraph.set({
			nodes: [],
			edges: [
				{
					toNodeId: 'node-a',
					toPort: ['prompt', 0],
				},
			],
		} as unknown as WorkflowPersistedGraph);
		fixture.detectChanges();

		const buttons = fixture.nativeElement.querySelectorAll(
			'button[aria-label="Expand"]',
		);
		expect(buttons).toHaveLength(1);
		expect(document.body.textContent).toContain('System');

		const textareas = fixture.nativeElement.querySelectorAll('textarea');
		expect(textareas[1].disabled).toBe(true);

		const spy = vi.spyOn(updateNode, 'next');
		fixture.componentInstance.onInputChange('prompt', 'wired overwrite');
		expect(spy).not.toHaveBeenCalled();
	});
});
