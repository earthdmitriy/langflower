// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { WorkflowTopbarComponent } from '../components/workflow-topbar.component';

function createRaw() {
	return {
		'workflow.list.snapshot': new Subject(),
		'workflow.current.snapshot': new Subject(),
		'workflow.currentStatus.snapshot': new Subject(),
		'workflow.load.repaired': new Subject(),
		'workflow.load.requested': new Subject(),
		'workflow.create.requested': new Subject(),
		'workflow.copy.requested': new Subject(),
		'workflow.delete.requested': new Subject(),
		'workflow.renameCurrent.requested': new Subject(),
		'workflow.saveCurrent.requested': new Subject(),
		'palette.snapshot': new Subject(),
		'customPalette.snapshot': new Subject(),
		'executionFeed.snapshot': new Subject(),
		'runner.port': new Subject(),
		'runner.started': new Subject(),
		'runner.startNode.started': new Subject(),
		'runner.done': new Subject(),
		'runner.interrupted': new Subject(),
	} as const;
}

const currentSnapshot = {
	activeWorkflow: {
		workflowId: 'demo',
		metadata: {
			name: 'Demo',
			createdAt: '2026-06-17T00:00:00.000Z',
			updatedAt: '2026-06-17T00:00:00.000Z',
		},
		graph: {
			nodes: [],
			edges: [],
			viewport: { x: 0, y: 0, scale: 1 },
		},
	},
	currentStatus: { status: 'pristine' as const },
};

describe('WorkflowTopbarComponent run lock', () => {
	let raw: ReturnType<typeof createRaw>;
	let fixture: ComponentFixture<WorkflowTopbarComponent>;

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
			imports: [WorkflowTopbarComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw, cached: raw },
				},
				WorkflowExecutionService,
			],
		}).compileComponents();

		fixture = TestBed.createComponent(WorkflowTopbarComponent);
		raw['workflow.current.snapshot'].next(currentSnapshot);
		raw['workflow.list.snapshot'].next({
			workflows: [
				{
					workflowId: 'demo',
					name: 'Demo',
					createdAt: '2026-06-17T00:00:00.000Z',
					updatedAt: '2026-06-17T00:00:00.000Z',
				},
			],
		});
		fixture.detectChanges();
	});

	it('does not emit catalog intents while running', () => {
		const loadSpy = vi.spyOn(raw['workflow.load.requested'], 'next');
		const createSpy = vi.spyOn(raw['workflow.create.requested'], 'next');
		const copySpy = vi.spyOn(raw['workflow.copy.requested'], 'next');
		const deleteSpy = vi.spyOn(raw['workflow.delete.requested'], 'next');
		const renameSpy = vi.spyOn(
			raw['workflow.renameCurrent.requested'],
			'next',
		);

		raw['runner.started'].next('run-1');
		fixture.detectChanges();

		const topbar = fixture.componentInstance;
		expect(topbar.canRename()).toBe(false);
		expect(topbar.canDelete()).toBe(false);

		topbar.loadWorkflow('demo');
		topbar.createWorkflow();
		topbar.copyWorkflow('demo', new Event('click'));
		topbar.startRename();
		topbar.confirmDelete();

		expect(topbar.isRenaming()).toBe(false);
		expect(loadSpy).not.toHaveBeenCalled();
		expect(createSpy).not.toHaveBeenCalled();
		expect(copySpy).not.toHaveBeenCalled();
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(renameSpy).not.toHaveBeenCalled();
	});
});
