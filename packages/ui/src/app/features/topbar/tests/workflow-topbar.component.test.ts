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
		'workflowSession.list.snapshot': new Subject(),
		'workflowSession.current.snapshot': new Subject(),
		'workflowSession.action.failed': new Subject(),
		'workflowSession.create.requested': new Subject(),
		'workflowSession.select.requested': new Subject(),
		'workflowSession.delete.requested': new Subject(),
		'workflowSession.replaceSnapshotFromWorkflow.requested': new Subject(),
		'workflowSession.writeSnapshotToWorkflow.requested': new Subject(),
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
		expect(topbar.renameTip()).toBe('Stop the run to change workflows');

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

	it('emits workflowSession.create.requested from New session', () => {
		const createSpy = vi.spyOn(
			raw['workflowSession.create.requested'],
			'next',
		);
		const button = fixture.nativeElement.querySelector(
			'[aria-label="New session"]',
		) as HTMLButtonElement | null;

		expect(button).toBeInstanceOf(HTMLButtonElement);
		button?.click();

		expect(createSpy).toHaveBeenCalledWith({});
	});

	it('shows Save only while the workflow file is dirty', () => {
		expect(
			fixture.nativeElement.querySelector('[aria-label="Save workflow"]'),
		).toBeNull();
		const actions = fixture.nativeElement.querySelector(
			'[aria-label="Workflow actions"]',
		) as HTMLButtonElement | null;
		const fileTab = fixture.nativeElement.querySelector(
			'[aria-pressed="true"]',
		);
		expect(actions).toBeInstanceOf(HTMLButtonElement);
		expect(
			fileTab !== null &&
				actions !== null &&
				(actions.compareDocumentPosition(fileTab) &
					Node.DOCUMENT_POSITION_FOLLOWING) !==
					0,
		).toBe(true);
		const createSession = fixture.nativeElement.querySelector(
			'[aria-label="New session"]',
		);
		const tablist = fixture.nativeElement.querySelector('[role="tablist"]');
		expect(createSession?.closest('[role="tablist"]')).toBeNull();
		expect(
			tablist !== null &&
				createSession !== null &&
				(tablist.compareDocumentPosition(createSession) &
					Node.DOCUMENT_POSITION_FOLLOWING) !==
					0,
		).toBe(true);
		expect(
			createSession
				?.closest('lf-hover-tip')
				?.parentElement?.classList.contains('sticky'),
		).toBe(true);

		raw['workflow.currentStatus.snapshot'].next({ status: 'dirty' });
		fixture.detectChanges();

		const save = fixture.nativeElement.querySelector(
			'[aria-label="Save workflow"]',
		) as HTMLButtonElement | null;
		expect(save).toBeInstanceOf(HTMLButtonElement);
		expect(
			fixture.nativeElement.querySelector('.bg-amber-400'),
		).not.toBeNull();

		const saveSpy = vi.spyOn(raw['workflow.saveCurrent.requested'], 'next');
		save?.click();
		expect(saveSpy).toHaveBeenCalledWith({});
	});

	it('opens rename from a double-click on the workflow tab', () => {
		const tab = fixture.nativeElement.querySelector(
			'[aria-pressed="true"]',
		) as HTMLButtonElement | null;
		expect(tab?.textContent).toContain('Demo');

		tab?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		fixture.detectChanges();

		expect(fixture.componentInstance.isRenaming()).toBe(true);
		expect(
			fixture.nativeElement.querySelector(
				'[aria-label="Rename workflow"]',
			),
		).toBeInstanceOf(HTMLInputElement);
	});

	it('hides workflow edits and returns to the file while a session is bound', () => {
		raw['workflow.currentStatus.snapshot'].next({ status: 'dirty' });
		raw['workflowSession.current.snapshot'].next({
			workflowId: 'demo',
			sessionId: 'session-1',
			differsFromWorkflow: false,
			points: [],
		});
		fixture.detectChanges();

		const topbar = fixture.componentInstance;
		expect(topbar.canSave()).toBe(false);
		expect(topbar.canRename()).toBe(false);
		expect(topbar.canDelete()).toBe(false);
		expect(topbar.renameTip()).toBe('Return to the workflow first');
		expect(topbar.deleteTip()).toBe('Return to the workflow first');
		expect(
			fixture.nativeElement.querySelector('[aria-label="Save workflow"]'),
		).toBeNull();
		expect(
			fixture.nativeElement.querySelector(
				'[aria-label="Workflow actions"]',
			),
		).toBeNull();

		const saveSpy = vi.spyOn(raw['workflow.saveCurrent.requested'], 'next');
		const renameSpy = vi.spyOn(
			raw['workflow.renameCurrent.requested'],
			'next',
		);
		const deleteSpy = vi.spyOn(raw['workflow.delete.requested'], 'next');
		const selectSpy = vi.spyOn(
			raw['workflowSession.select.requested'],
			'next',
		);
		topbar.saveCurrent();
		topbar.startRename();
		topbar.confirmDelete();

		const tab = fixture.nativeElement.querySelector(
			'[aria-pressed="false"]',
		) as HTMLButtonElement | null;
		tab?.click();

		expect(topbar.isRenaming()).toBe(false);
		expect(saveSpy).not.toHaveBeenCalled();
		expect(renameSpy).not.toHaveBeenCalled();
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(selectSpy).toHaveBeenCalledWith({ sessionId: null });
	});

	it('keeps a session refusal after the following snapshots', () => {
		raw['workflowSession.action.failed'].next({
			code: 'RUN_ACTIVE',
			message: 'Cannot change workflow sessions while a run is active',
		});
		raw['workflowSession.list.snapshot'].next({
			workflowId: 'demo',
			sessions: [],
		});
		raw['workflowSession.current.snapshot'].next({
			workflowId: 'demo',
			sessionId: null,
			differsFromWorkflow: false,
			points: [],
		});
		fixture.detectChanges();

		expect(fixture.nativeElement.textContent).toContain(
			'Cannot change workflow sessions while a run is active',
		);
	});

	it('marks the open session when its graph differs', () => {
		raw['workflowSession.list.snapshot'].next({
			workflowId: 'demo',
			sessions: [
				{
					sessionId: 'session-1',
					label: '2026-10-14 #1',
					updatedAt: '2026-10-14T00:00:00.000Z',
				},
				{
					sessionId: 'session-2',
					label: '2026-10-14 #2',
					updatedAt: '2026-10-14T00:00:00.000Z',
					differsFromWorkflow: true,
				},
			],
		});
		raw['workflowSession.current.snapshot'].next({
			workflowId: 'demo',
			sessionId: 'session-1',
			differsFromWorkflow: true,
			points: [],
		});
		fixture.detectChanges();

		expect(fixture.nativeElement.textContent).not.toContain(
			'Load workflow into session',
		);
		expect(fixture.nativeElement.textContent).not.toContain(
			'Save session graph as workflow',
		);

		const activeTab = (
			[
				...fixture.nativeElement.querySelectorAll('button'),
			] as HTMLButtonElement[]
		).find((button) => button.textContent?.includes('2026-10-14 #1'));
		const activeGrid = activeTab?.closest('.grid');
		expect(activeGrid?.className).toContain('h-full');
		expect(activeGrid?.className).not.toContain('self-end');
		const activePlate = [...(activeGrid?.children ?? [])].find(
			(child) => child.getAttribute('aria-hidden') === 'true',
		);
		expect(activePlate?.className).toContain('bg-zinc-100');
		expect(activePlate?.className).toContain('dark:bg-zinc-950');
		expect(activePlate?.className).toContain('border-b-0');
		expect(activePlate?.className).not.toContain('-mb-px');
		const remove = (
			[
				...fixture.nativeElement.querySelectorAll('button'),
			] as HTMLButtonElement[]
		).find((button) =>
			button.getAttribute('aria-label')?.includes('Delete session'),
		);
		expect(remove?.querySelector('svg')).toBeInstanceOf(SVGElement);
		expect(remove?.className).toContain('text-zinc-400');
		expect(remove?.className).toContain('hover:text-rose-600');
		expect(
			activeTab?.querySelector('.translate-y-px')?.className,
		).toContain('bg-rose-400/70');
		expect(activeTab?.closest('lf-hover-tip')?.textContent).toContain(
			'The workflow in this session differs from the current workflow.',
		);
		const closedTab = (
			[
				...fixture.nativeElement.querySelectorAll('button'),
			] as HTMLButtonElement[]
		).find((button) => button.textContent?.includes('2026-10-14 #2'));
		expect(
			closedTab?.querySelector('.translate-y-px')?.className,
		).toContain('bg-rose-400/70');
		expect(closedTab?.closest('.grid')?.className).toContain('top-1');
		expect(closedTab?.closest('.grid')?.className).not.toContain(
			'translate-y',
		);
	});

	it('confirms deletion of a session that is not open', () => {
		raw['workflowSession.list.snapshot'].next({
			workflowId: 'demo',
			sessions: [
				{
					sessionId: 'session-old',
					label: '2026-10-15 #1',
					updatedAt: '2026-10-15T00:00:00.000Z',
					corrupt: true,
				},
				{
					sessionId: 'session-1',
					label: '2026-10-16 #1',
					updatedAt: '2026-10-16T00:00:00.000Z',
				},
			],
		});
		raw['workflowSession.current.snapshot'].next({
			workflowId: 'demo',
			sessionId: 'session-1',
			differsFromWorkflow: false,
			points: [],
		});
		fixture.detectChanges();

		const remove = (
			[
				...fixture.nativeElement.querySelectorAll('button'),
			] as HTMLButtonElement[]
		).find(
			(button) =>
				button.getAttribute('aria-label') ===
				'Delete session 2026-10-15 #1',
		);
		remove?.click();
		fixture.detectChanges();

		const dialog = fixture.nativeElement.querySelector(
			'[role="alertdialog"]',
		) as HTMLElement | null;
		expect(dialog?.getAttribute('aria-modal')).toBe('true');
		expect(dialog?.textContent).toContain('2026-10-15 #1');

		const deleteSpy = vi.spyOn(
			raw['workflowSession.delete.requested'],
			'next',
		);
		const buttons = [
			...fixture.nativeElement.querySelectorAll('button'),
		] as HTMLButtonElement[];
		buttons
			.find((button) => button.textContent?.trim() === 'Cancel')
			?.click();
		fixture.detectChanges();
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(
			fixture.nativeElement.querySelector('[role="alertdialog"]'),
		).toBeNull();

		remove?.click();
		fixture.detectChanges();
		(
			[
				...fixture.nativeElement.querySelectorAll('button'),
			] as HTMLButtonElement[]
		)
			.find((button) => button.textContent?.trim() === 'Delete')
			?.click();

		expect(deleteSpy).toHaveBeenCalledWith({
			sessionId: 'session-old',
		});
	});
});
