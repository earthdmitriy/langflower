import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LangflowerBridgeService } from '../langflower-bridge.service';
import { SelectedNodeProjectionService } from '../selected-node-projection.service';

const sampleNode = {
	id: 'llm-1',
	type: 'common-openai-llm',
	params: {},
	inputs: {},
	definition: {
		type: 'common-openai-llm',
		displayName: 'OpenAI LLM',
		uiSchema: [],
		inputsConfigs: [],
		outputsConfigs: [],
	},
};

const createBridgeSubjects = () => ({
	'session.state.snapshot': new Subject<{
		readonly selectedNode: typeof sampleNode | null;
	}>(),
	'editor.nodeSelected': new Subject<{
		readonly node: typeof sampleNode | null;
	}>(),
});

describe('SelectedNodeProjectionService', () => {
	let subjects: ReturnType<typeof createBridgeSubjects>;
	let service: SelectedNodeProjectionService;

	beforeEach(() => {
		subjects = createBridgeSubjects();
		const injector = Injector.create({
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw: subjects, cached: subjects },
				},
				{ provide: DestroyRef, useValue: { onDestroy: () => {} } },
			],
		});
		service = runInInjectionContext(
			injector,
			() => new SelectedNodeProjectionService(),
		);
	});

	it('starts with no selection', () => {
		expect(service.selectedNode()).toBeNull();
		expect(service.hasSelectedNode()).toBe(false);
	});

	it('keeps the latest node for a late subscriber after editor.nodeSelected', async () => {
		subjects['editor.nodeSelected'].next({ node: sampleNode });

		const late = await firstValueFrom(service.selectedNode$);

		expect(late?.id).toBe('llm-1');
		expect(service.selectedNode()?.id).toBe('llm-1');
		expect(service.hasSelectedNode()).toBe(true);
	});

	it('updates from session.state.snapshot.selectedNode', () => {
		subjects['session.state.snapshot'].next({ selectedNode: sampleNode });

		expect(service.selectedNode()?.id).toBe('llm-1');
		expect(service.selectedNodeId()).toBe('llm-1');
	});

	it('clears selection when nodeSelected sends null', () => {
		subjects['editor.nodeSelected'].next({ node: sampleNode });
		expect(service.hasSelectedNode()).toBe(true);

		subjects['editor.nodeSelected'].next({ node: null });

		expect(service.selectedNode()).toBeNull();
		expect(service.hasSelectedNode()).toBe(false);
	});
});
