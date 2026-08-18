import type {
	WorkflowCurrentSnapshotPayload,
	WorkflowListEntry,
} from '@langflower/shared/langflower';

export type WorkflowTopbarState = {
	readonly workflows: readonly WorkflowListEntry[];
	readonly activeWorkflow: WorkflowCurrentSnapshotPayload['activeWorkflow'];
	readonly currentStatus: WorkflowCurrentSnapshotPayload['currentStatus']['status'];
};

export const initialWorkflowTopbarState: WorkflowTopbarState = {
	workflows: [],
	activeWorkflow: null,
	currentStatus: 'pristine',
};

export function workflowTopbarWithList(
	state: WorkflowTopbarState,
	workflows: readonly WorkflowListEntry[],
): WorkflowTopbarState {
	return {
		...state,
		workflows,
	};
}

export function workflowTopbarWithCurrentSnapshot(
	state: WorkflowTopbarState,
	snapshot: WorkflowCurrentSnapshotPayload,
): WorkflowTopbarState {
	return {
		...state,
		activeWorkflow: snapshot.activeWorkflow,
		currentStatus: snapshot.currentStatus.status,
	};
}

export function workflowTopbarWithCurrentStatus(
	state: WorkflowTopbarState,
	status: WorkflowTopbarState['currentStatus'],
): WorkflowTopbarState {
	return {
		...state,
		currentStatus: status,
	};
}

const STOP_RUN_TO_CHANGE_WORKFLOWS = 'Stop the run to change workflows';

export const workflowChangeControlTip = (
	isRunning: boolean,
	idleTip: string,
): string => (isRunning ? STOP_RUN_TO_CHANGE_WORKFLOWS : idleTip);
