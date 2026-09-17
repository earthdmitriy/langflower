import type { NodeId, PortTelemetry } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import type { CliProgressEvent } from './format-last-event-line.js';
import {
	createLastEventReporter,
	LAST_EVENT_THROTTLE_MS,
} from './last-event-reporter.js';

const portProgress = (response: PortTelemetry[3]): CliProgressEvent => ({
	type: 'port',
	event: ['out', 'coder' as NodeId, 'draft', response, 0, [], null],
});

describe('createLastEventReporter', () => {
	it('emits formatted lines and skips inactive', () => {
		const lines: string[] = [];
		let clock = 0;
		const reporter = createLastEventReporter((line) => lines.push(line), {
			now: () => clock,
		});

		reporter.emit(portProgress({ pending: true }));
		reporter.emit(portProgress({ inactive: true }));
		clock += LAST_EVENT_THROTTLE_MS;
		reporter.emit(portProgress({ value: 'hello' }));

		expect(lines).toEqual([
			'Last event: coder · draft · pending',
			'Last event: coder · draft · value · hello',
		]);
	});

	it('throttles same identity under LAST_EVENT_THROTTLE_MS', () => {
		const lines: string[] = [];
		let clock = 0;
		const reporter = createLastEventReporter((line) => lines.push(line), {
			now: () => clock,
		});

		reporter.emit(portProgress({ value: 'a' }));
		clock += LAST_EVENT_THROTTLE_MS - 1;
		reporter.emit(portProgress({ value: 'b' }));
		clock += 1;
		reporter.emit(portProgress({ value: 'c' }));

		expect(lines).toEqual([
			'Last event: coder · draft · value · a',
			'Last event: coder · draft · value · c',
		]);
	});

	it('reset allows the same line after a settled run', () => {
		const lines: string[] = [];
		const reporter = createLastEventReporter((line) => lines.push(line), {
			now: () => 0,
		});

		reporter.emit(portProgress({ value: 'hello' }));
		reporter.reset();
		reporter.emit(portProgress({ value: 'hello' }));

		expect(lines).toEqual([
			'Last event: coder · draft · value · hello',
			'Last event: coder · draft · value · hello',
		]);
	});
});
