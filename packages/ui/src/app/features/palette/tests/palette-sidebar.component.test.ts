// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { PaletteSidebarComponent } from '../components/palette-sidebar.component';

const sampleNode = {
	type: 'common-string',
	displayName: 'String',
	category: 'Primitives',
	description: '',
	source: 'system',
	inputsConfigs: [],
	outputsConfigs: [],
	uiSchema: [],
	stopsRun: false,
	emitOncePerActivation: false,
	chatEntry: false,
	bypassPorts: {},
} as unknown as PaletteNodeDefinition;

function createRaw() {
	return {
		'palette.snapshot': new Subject(),
		'customPalette.snapshot': new Subject(),
		'executionFeed.snapshot': new Subject(),
		'workflow.current.snapshot': new Subject(),
		'runner.port': new Subject(),
		'runner.started': new Subject(),
		'runner.startNode.started': new Subject(),
		'runner.done': new Subject(),
		'runner.interrupted': new Subject(),
	} as const;
}

describe('PaletteSidebarComponent run lock', () => {
	let raw: ReturnType<typeof createRaw>;
	let fixture: ComponentFixture<PaletteSidebarComponent>;

	beforeAll(() => {
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(async () => {
		TestBed.resetTestingModule();
		raw = createRaw();

		await TestBed.configureTestingModule({
			imports: [PaletteSidebarComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw, cached: raw },
				},
				WorkflowExecutionService,
			],
		}).compileComponents();

		fixture = TestBed.createComponent(PaletteSidebarComponent);
		raw['palette.snapshot'].next({ nodes: [sampleNode] });
		fixture.detectChanges();
	});

	it('does not start a palette drag while running', () => {
		raw['runner.started'].next('run-1');
		fixture.detectChanges();

		const setData = vi.fn();
		const preventDefault = vi.fn();
		const event = {
			preventDefault,
			dataTransfer: {
				setData,
				effectAllowed: 'copy',
			},
		} as unknown as DragEvent;

		fixture.componentInstance.startPaletteDrag(sampleNode, event);

		expect(preventDefault).toHaveBeenCalledOnce();
		expect(setData).not.toHaveBeenCalled();
	});
});
