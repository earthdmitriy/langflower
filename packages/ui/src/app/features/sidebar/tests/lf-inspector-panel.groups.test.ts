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
		{ field: 'system', type: 'string', label: 'System' },
		{
			field: 'timeout',
			type: 'number',
			label: 'Timeout',
			group: { label: 'Recovery', collapsed: true },
		},
		{
			field: 'tools',
			type: 'string',
			label: 'Tool name',
			group: { label: 'Tools' },
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

describe('LfInspectorPanelComponent groups', () => {
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

	it('renders General open, collapsed groups closed, and keeps fields in the DOM', () => {
		const details = Array.from<HTMLDetailsElement>(
			fixture.nativeElement.querySelectorAll('details'),
		);

		expect(
			details.map((d) => [
				d.querySelector('summary')?.textContent?.trim(),
				d.open,
			]),
		).toEqual([
			['General', true],
			['Recovery', false],
			['Tools', true],
		]);
		expect(details[1]?.textContent).toContain('Timeout');
	});

	it('still routes edits from a field inside a group', () => {
		const spy = vi.spyOn(updateNode, 'next');

		fixture.componentInstance.onFieldChange('timeout', 5);

		expect(spy).toHaveBeenCalledWith({
			nodeId: 'node-a',
			params: { system: 'panel text', timeout: 5 },
		});
	});
});
