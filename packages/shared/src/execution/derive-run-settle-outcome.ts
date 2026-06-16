import type {
	RuntimeRunnerEvent,
	RuntimeRunnerStatus,
} from '@langflower/runtime';
import type { ExecutionProgressStatus } from '../types/langflower-server.js';

/** Terminal settle values of {@link ExecutionProgressStatus}. */
export type TerminalExecutionProgressStatus = Extract<
	ExecutionProgressStatus,
	'completed' | 'failed' | 'completed_with_errors'
>;

/**
 * Derive coarse execution progress from runner status + the recorded feed.
 *
 * - `running` / `stopped` pass through from the runner gate.
 * - After natural settle (`idle`): port `error` frames decide between
 *   `completed`, `completed_with_errors`, and `failed`.
 */
export const deriveExecutionProgressStatus = (
	runnerStatus: RuntimeRunnerStatus,
	events: readonly RuntimeRunnerEvent[],
): ExecutionProgressStatus => {
	if (runnerStatus === 'running') {
		return 'running';
	}
	if (runnerStatus === 'stopped') {
		return 'stopped';
	}

	const portEvents = events.filter(
		(
			event,
		): event is Extract<
			RuntimeRunnerEvent,
			{ readonly kind: 'output-emitted' | 'input-received' }
		> => event.kind === 'output-emitted' || event.kind === 'input-received',
	);
	const hasError = portEvents.some((event) => event.state === 'error');
	const hasValue = portEvents.some((event) => event.state === 'value');

	if (hasError && hasValue) {
		return 'completed_with_errors';
	}
	if (hasError) {
		return 'failed';
	}
	return 'completed';
};

/** Narrow to a terminal progress status, or null if the run has not settled. */
export const terminalExecutionProgressStatus = (
	status: ExecutionProgressStatus,
): TerminalExecutionProgressStatus | null => {
	switch (status) {
		case 'completed':
		case 'failed':
		case 'completed_with_errors':
			return status;
		default:
			return null;
	}
};

/** One dedicated human-readable stdout line for a settled run. */
export const formatRunSettleLine = (
	status: TerminalExecutionProgressStatus,
): string => {
	switch (status) {
		case 'completed':
			return 'Run settled: work done';
		case 'failed':
			return 'Run settled: failed with error';
		case 'completed_with_errors':
			return 'Run settled: completed with errors';
	}
};
