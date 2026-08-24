// @vitest-environment jsdom

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { of, Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfInspectorPanelComponent } from '../components/lf-inspector-panel.component';

const definition = {
	type: 'common-string',
	displayName: 'String',
	category: 'Primitives',
	description: `
		Put a short constant string on the canvas.

		Typical uses:
		- A file path
		- A prompt fragment
	`,
	source: 'system',
	inputsConfigs: [{ portId: 'value', name: 'value', type: 'string' }],
	outputsConfigs: [],
	uiSchema: [],
	stopsRun: false,
	emitOncePerActivation: false,
	chatEntry: false,
	bypassPorts: {},
} as unknown as PaletteNodeDefinition;

const selectedNode = {
	id: 'node-a',
	type: 'common-string',
	params: {},
	inputs: { value: 'hello' },
	ui: { position: { x: 0, y: 0 }, label: 'node-a' },
	definition,
};

describe('LfInspectorPanelComponent description', () => {
	let fixture: ComponentFixture<LfInspectorPanelComponent>;

	beforeAll(() => {
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(async () => {
		TestBed.resetTestingModule();

		await TestBed.configureTestingModule({
			imports: [LfInspectorPanelComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: {
						raw: {
							'editor.updateNode.requested': new Subject(),
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
						activeGraph: signal(null),
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
	});

	it('renders markdown description under the title', () => {
		const html = fixture.nativeElement as HTMLElement;

		expect(html.querySelector('.prose')?.innerHTML).toContain('<ul>');
		expect(html.textContent).toContain('A file path');
	});
});
