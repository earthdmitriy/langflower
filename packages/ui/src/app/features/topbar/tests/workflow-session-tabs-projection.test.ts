import { describe, expect, it } from 'vitest';
import type {
	WorkflowSessionCurrentSnapshotPayload,
	WorkflowSessionListSnapshotPayload,
	WorkflowSessionSummary,
} from '@langflower/shared/types/workflow-session';
import {
	foldWorkflowSessionTabs,
	initialWorkflowSessionTabsInput,
	projectWorkflowSessionTabs,
	type WorkflowSessionTabsInput,
} from '../types/workflow-session-tabs-projection';

const summary = (
	sessionId: string,
	label: string,
	corrupt?: true,
): WorkflowSessionSummary => ({
	sessionId,
	label,
	updatedAt: '2026-10-14T00:00:00.000Z',
	...(corrupt === true ? { corrupt: true as const } : {}),
});

const list = (
	sessions: readonly WorkflowSessionSummary[],
): WorkflowSessionListSnapshotPayload => ({
	workflowId: 'wf',
	sessions,
});

const current = (
	sessionId: string | null,
	differsFromWorkflow: boolean,
): WorkflowSessionCurrentSnapshotPayload => ({
	workflowId: 'wf',
	sessionId,
	differsFromWorkflow,
	points: [],
});

const project = (patch: Partial<WorkflowSessionTabsInput>) =>
	projectWorkflowSessionTabs({
		...initialWorkflowSessionTabsInput,
		...patch,
	});

describe('projectWorkflowSessionTabs', () => {
	it('marks the bound session tab active', () => {
		const view = project({
			list: list([
				summary('s1', '2026-10-14 #1'),
				summary('s2', '2026-10-14 #2'),
			]),
			current: current('s2', false),
		});

		expect(view.tabs.map((tab) => [tab.sessionId, tab.active])).toEqual([
			['s1', false],
			['s2', true],
		]);
		expect(view.bound).toBe(true);
		expect(view.sessionId).toBe('s2');
		expect(view.controlsDisabled).toBe(false);
	});

	it('disables controls only while navigation is locked', () => {
		const locked = project({
			list: list([summary('s1', '2026-10-14 #1')]),
			current: current('s1', false),
			navigationLocked: true,
		});
		const parked = project({
			list: list([summary('s1', '2026-10-14 #1')]),
			current: current('s1', false),
			navigationLocked: false,
		});

		expect(locked.controlsDisabled).toBe(true);
		expect(parked.controlsDisabled).toBe(false);
	});

	it('marks every tab whose graph differs from the saved workflow', () => {
		const differs = project({
			list: list([
				summary('s1', '2026-10-14 #1'),
				summary('s2', '2026-10-14 #2'),
			]),
			current: current('s2', true),
		});
		const same = project({
			list: list([summary('s1', '2026-10-14 #1')]),
			current: current('s1', false),
		});
		const unbound = project({
			list: list([summary('s1', '2026-10-14 #1')]),
			current: current(null, true),
		});

		expect(differs.tabs.map((tab) => tab.differs)).toEqual([false, true]);
		const closed = project({
			list: list([
				summary('s1', '2026-10-14 #1'),
				{
					...summary('s2', '2026-10-14 #2'),
					differsFromWorkflow: true,
				},
			]),
			current: current('s1', false),
		});
		expect(closed.tabs.map((tab) => tab.differs)).toEqual([false, true]);
		expect(same.tabs[0]?.differs).toBe(false);
		expect(unbound.tabs[0]?.differs).toBe(false);
	});

	it('shows no tabs for an empty list and keeps New available', () => {
		const view = project({
			list: list([]),
			current: current(null, false),
		});

		expect(view.tabs).toEqual([]);
		expect(view.bound).toBe(false);
		expect(view.controlsDisabled).toBe(false);
	});

	it('lists a corrupt session without selecting it', () => {
		const view = project({
			list: list([summary('bad', '2026-10-14 #1', true)]),
			current: current(null, false),
		});

		expect(view.tabs).toEqual([
			{
				sessionId: 'bad',
				label: '2026-10-14 #1',
				active: false,
				corrupt: true,
				differs: false,
			},
		]);
	});

	it('keeps the open session when a later list snapshot arrives', () => {
		const withCurrent = foldWorkflowSessionTabs(
			initialWorkflowSessionTabsInput,
			{ type: 'current', current: current('s1', true) },
		);
		const afterList = foldWorkflowSessionTabs(withCurrent, {
			type: 'list',
			list: list([summary('s1', '2026-10-14 #1')]),
		});

		const view = projectWorkflowSessionTabs(afterList);
		expect(view.sessionId).toBe('s1');
		expect(view.tabs[0]?.active).toBe(true);
		expect(view.tabs[0]?.differs).toBe(true);
	});
});
