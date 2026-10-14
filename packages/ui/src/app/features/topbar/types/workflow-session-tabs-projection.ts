import type {
	WorkflowSessionCurrentSnapshotPayload,
	WorkflowSessionListSnapshotPayload,
} from '@langflower/shared/types/workflow-session';

export type WorkflowSessionTabItem = {
	readonly sessionId: string;
	readonly label: string;
	readonly active: boolean;
	readonly corrupt: boolean;
	/** Open tab whose graph is not the saved workflow. */
	readonly differs: boolean;
};

export type WorkflowSessionTabsInput = {
	readonly list: WorkflowSessionListSnapshotPayload | null;
	readonly current: WorkflowSessionCurrentSnapshotPayload | null;
	/** True only while the graph is executing, not during HITL or steering. */
	readonly navigationLocked: boolean;
};

export type WorkflowSessionTabsProjection = {
	readonly tabs: readonly WorkflowSessionTabItem[];
	readonly sessionId: string | null;
	readonly bound: boolean;
	readonly controlsDisabled: boolean;
};

export type WorkflowSessionTabsEvent =
	| {
			readonly type: 'list';
			readonly list: WorkflowSessionListSnapshotPayload;
	  }
	| {
			readonly type: 'current';
			readonly current: WorkflowSessionCurrentSnapshotPayload;
	  }
	| {
			readonly type: 'navigation';
			readonly navigationLocked: boolean;
	  };

export const initialWorkflowSessionTabsInput: WorkflowSessionTabsInput = {
	list: null,
	current: null,
	navigationLocked: false,
};

/**
 * Replace one slice. List and current snapshots do not carry refusal
 * text; keep that fact beside this fold so a following snapshot cannot
 * clear `workflowSession.action.failed`.
 */
export const foldWorkflowSessionTabs = (
	state: WorkflowSessionTabsInput,
	event: WorkflowSessionTabsEvent,
): WorkflowSessionTabsInput => {
	switch (event.type) {
		case 'list':
			return { ...state, list: event.list };
		case 'current':
			return { ...state, current: event.current };
		case 'navigation':
			return { ...state, navigationLocked: event.navigationLocked };
	}
};

export const projectWorkflowSessionTabs = (
	input: WorkflowSessionTabsInput,
): WorkflowSessionTabsProjection => {
	const sessionId = input.current?.sessionId ?? null;
	const sessions = input.list?.sessions ?? [];

	return {
		tabs: sessions.map((session) => ({
			sessionId: session.sessionId,
			label: session.label,
			active: session.sessionId === sessionId,
			corrupt: session.corrupt === true,
			differs:
				session.sessionId === sessionId
					? input.current?.differsFromWorkflow === true
					: session.differsFromWorkflow === true,
		})),
		sessionId,
		bound: sessionId !== null,
		controlsDisabled: input.navigationLocked,
	};
};
