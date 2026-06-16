export type ExecutionProgressStatus =
	'running' | 'completed' | 'completed_with_errors' | 'failed' | 'stopped';

export type SessionReadyPayload = {
	readonly version: number;
};
