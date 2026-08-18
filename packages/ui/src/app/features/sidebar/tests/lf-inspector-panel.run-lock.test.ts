// @vitest-environment jsdom

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { of, Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfInspectorPanelComponent } from '../components/lf-inspector-panel.component';

const definition = {
	type: 'common-constant',
	displayName: 'Constant',
	category: 'Primitives',
	description: '',
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
	type: 'common-constant',
	params: { providerId: 'openai', label: 'seed' },
	inputs: { value: 'hello' },
	ui: { position: { x: 0, y: 0 }, label: 'node-a' },
	definition,
};

function createRaw() {
	return {
		'editor.updateNode.requested': new Subject(),
	} as const;
}

describe('LfInspectorPanelComponent run lock', () => {
	let raw: ReturnType<typeof createRaw>;
	let fixture: ComponentFixture<LfInspectorPanelComponent>;
	const isRunning = signal(false);

	beforeAll(() => {
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(async () => {
		TestBed.resetTestingModule();
		raw = createRaw();
		isRunning.set(false);

		await TestBed.configureTestingModule({
			imports: [LfInspectorPanelComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw, cached: raw },
				},
				{
					provide: WorkflowExecutionService,
					useValue: {
						isRunning,
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

	it('emits updateNode.requested when idle', () => {
		const spy = vi.spyOn(raw['editor.updateNode.requested'], 'next');

		fixture.componentInstance.onFieldChange('label', 'next');

		expect(spy).toHaveBeenCalledOnce();
	});

	it('does not emit updateNode.requested while running', () => {
		const spy = vi.spyOn(raw['editor.updateNode.requested'], 'next');
		isRunning.set(true);
		fixture.detectChanges();

		fixture.componentInstance.onFieldChange('label', 'next');
		fixture.componentInstance.onInputChange('value', 'next');
		fixture.componentInstance.onToolPermissionChange('grep', 'deny');

		expect(spy).not.toHaveBeenCalled();
	});
});
