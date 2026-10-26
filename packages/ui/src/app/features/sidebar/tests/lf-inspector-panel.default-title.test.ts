// @vitest-environment jsdom

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { LangflowerConfig } from '@langflower/shared/types/langflower-config';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import { of, Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfInspectorPanelComponent } from '../components/lf-inspector-panel.component';

/**
 * `providerId` / `model` panel items are byte-identical for embed and LLM
 * nodes (`embed-provider/node.ts:13-26` vs the LLM family) — only `requires`
 * tells them apart. These fixtures pin that contract for the empty-option
 * title (P4).
 */
const providerAndModelPanel = [
	{
		field: 'providerId',
		type: 'select',
		label: 'Provider',
		optionsSource: 'langflower.providers',
	},
	{
		field: 'model',
		type: 'select',
		label: 'Model',
		optionsSource: 'langflower.models',
		dependsOn: 'providerId',
	},
] as const;

const definitionWith = (
	requires: readonly string[] | undefined,
): PaletteNodeDefinition =>
	({
		type: 'common-embed-provider',
		displayName: 'Embed provider',
		category: 'Embeddings',
		description: '',
		source: 'system',
		inputsConfigs: [],
		outputsConfigs: [],
		uiSchema: providerAndModelPanel,
		stopsRun: false,
		emitOncePerActivation: false,
		chatEntry: false,
		bypassPorts: {},
		...(requires === undefined ? {} : { requires }),
	}) as unknown as PaletteNodeDefinition;

const config: LangflowerConfig = {
	model: 'openai/gpt-4o-mini',
	embedding: 'openai/text-embedding-3-small',
	provider: {
		openai: {
			name: 'OpenAI',
			models: ['gpt-4o-mini', 'text-embedding-3-small'],
		},
	},
};

/** Every `<option>` label rendered by the panel rows, in DOM order. */
const renderedOptionTitles = (host: HTMLElement): readonly string[] =>
	Array.from(host.querySelectorAll('option')).map((option) =>
		(option.textContent ?? '').trim(),
	);

describe('LfInspectorPanelComponent default empty-option title', () => {
	let fixture: ComponentFixture<LfInspectorPanelComponent>;
	let host: HTMLElement;

	beforeAll(() => {
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	const mount = async (
		definition: PaletteNodeDefinition,
		effectiveConfig: LangflowerConfig = config,
		params: Readonly<Record<string, unknown>> = {
			providerId: 'openai',
			model: '',
		},
	): Promise<void> => {
		TestBed.resetTestingModule();

		const node = {
			id: 'node-a',
			type: definition.type,
			params,
			inputs: {},
			ui: { position: { x: 0, y: 0 }, label: 'node-a' },
			definition,
		};

		await TestBed.configureTestingModule({
			imports: [LfInspectorPanelComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: {
						raw: { 'editor.updateNode.requested': new Subject() },
						cached: {},
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
						selectedNode: signal(node),
						selectedNode$: of(node),
					},
				},
				{
					provide: LangflowerConfigProjectionService,
					useValue: {
						config: signal(effectiveConfig),
						config$: of(effectiveConfig),
					},
				},
				{
					provide: ModelsCatalogProjectionService,
					useValue: { catalogs$: of({}) },
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(LfInspectorPanelComponent);
		fixture.detectChanges();
		host = fixture.nativeElement as HTMLElement;
	};

	beforeEach(() => {
		TestBed.resetTestingModule();
	});

	it('advertises the embedding default on an embed node', async () => {
		await mount(definitionWith(['embed']));

		const titles = renderedOptionTitles(host);

		expect(titles).toContain('Default (openai/text-embedding-3-small)');
		expect(titles).not.toContain('Default (openai/gpt-4o-mini)');
	});

	it('keeps the chat default on an LLM node that also lists embed', async () => {
		// `defineLlmNode` merges author extras into LLM_REQUIRED_CAPABILITIES,
		// so `['chat', …, 'embed']` is legal — chat must still win.
		await mount(
			definitionWith(['chat', 'tools', 'promptContext', 'embed']),
		);

		const titles = renderedOptionTitles(host);

		expect(titles).toContain('Default (openai/gpt-4o-mini)');
		expect(titles).not.toContain('Default (openai/text-embedding-3-small)');
	});

	it('falls back to the chat default when requires is absent', async () => {
		// Hand-built fixtures cast a partial object: `requires` may be undefined.
		await mount(definitionWith(undefined));

		expect(renderedOptionTitles(host)).toContain(
			'Default (openai/gpt-4o-mini)',
		);
	});

	it('falls back to Select… when the embedding default is unset', async () => {
		await mount(
			definitionWith(['embed']),
			{
				model: 'openai/gpt-4o-mini',
				provider: {
					openai: {
						name: 'OpenAI',
						models: ['gpt-4o-mini', 'text-embedding-3-small'],
					},
				},
			},
			{ providerId: 'openai', model: '' },
		);

		const titles = renderedOptionTitles(host);

		expect(titles).toContain('Select…');
		expect(titles.some((title) => title.startsWith('Default ('))).toBe(
			false,
		);
	});
});
