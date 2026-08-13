import type { NodeId, PortTelemetry, RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import type { RuntimeRunnerEvent } from '@langflower/runtime';
import {
	deriveExecutionProgressStatus,
	formatRunSettleLine,
	terminalExecutionProgressStatus,
} from './derive-run-settle-outcome.js';

const output = (state: 'value' | 'error' | 'pending'): RuntimeRunnerEvent =>
	[
		'out',
		'n1' as NodeId,
		'out',
		state,
		state === 'error' ? new Error('boom') : 'ok',
		0,
		[],
		null,
	];

describe('deriveExecutionProgressStatus', () => {
	it('passes through running and stopped', () => {
		expect(deriveExecutionProgressStatus('running', [])).toBe('running');
		expect(
			deriveExecutionProgressStatus('stopped', [output('error')]),
		).toBe('stopped');
	});

	it('maps idle with no errors to completed', () => {
		expect(deriveExecutionProgressStatus('idle', [output('value')])).toBe(
			'completed',
		);
		expect(deriveExecutionProgressStatus('idle', [])).toBe('completed');
	});

	it('maps idle with only errors to failed', () => {
		expect(deriveExecutionProgressStatus('idle', [output('error')])).toBe(
			'failed',
		);
	});

	it('maps idle with mixed value and error to completed_with_errors', () => {
		expect(
			deriveExecutionProgressStatus('idle', [
				output('value'),
				output('error'),
			]),
		).toBe('completed_with_errors');
	});
});

describe('terminalExecutionProgressStatus + formatRunSettleLine', () => {
	it('narrows the three terminal statuses and formats CLI lines', () => {
		expect(terminalExecutionProgressStatus('completed')).toBe('completed');
		expect(terminalExecutionProgressStatus('failed')).toBe('failed');
		expect(terminalExecutionProgressStatus('completed_with_errors')).toBe(
			'completed_with_errors',
		);
		expect(terminalExecutionProgressStatus('running')).toBeNull();
		expect(terminalExecutionProgressStatus('stopped')).toBeNull();

		expect(formatRunSettleLine('completed')).toBe('Run settled: work done');
		expect(formatRunSettleLine('failed')).toBe(
			'Run settled: failed with error',
		);
		expect(formatRunSettleLine('completed_with_errors')).toBe(
			'Run settled: completed with errors',
		);
	});
});
