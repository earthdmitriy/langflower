import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
	PULSE_MS,
	valuePulseActive$,
	valuePulseCommands$,
} from '../utils/value-pulse-active.js';

describe('valuePulseCommands$', () => {
	it('emits pulseOn then pulseOff after PULSE_MS on value', () => {
		vi.useFakeTimers();
		try {
			const events$ = new Subject<{ state: string }>();
			const seen: string[] = [];
			const sub = valuePulseCommands$(events$).subscribe((cmd) => {
				seen.push(cmd);
			});

			events$.next({ state: 'pending' });
			expect(seen).toEqual([]);

			events$.next({ state: 'value' });
			expect(seen).toEqual(['pulseOn']);

			vi.advanceTimersByTime(PULSE_MS);
			expect(seen).toEqual(['pulseOn', 'pulseOff']);

			sub.unsubscribe();
		} finally {
			vi.useRealTimers();
		}
	});

	it('restarts the window when another value arrives early', () => {
		vi.useFakeTimers();
		try {
			const events$ = new Subject<{ state: string }>();
			const seen: string[] = [];
			const sub = valuePulseCommands$(events$).subscribe((cmd) => {
				seen.push(cmd);
			});

			events$.next({ state: 'value' });
			vi.advanceTimersByTime(PULSE_MS / 2);
			events$.next({ state: 'value' });
			expect(seen).toEqual(['pulseOn', 'pulseOn']);

			vi.advanceTimersByTime(PULSE_MS / 2);
			expect(seen).toEqual(['pulseOn', 'pulseOn']);

			vi.advanceTimersByTime(PULSE_MS / 2);
			expect(seen).toEqual(['pulseOn', 'pulseOn', 'pulseOff']);

			sub.unsubscribe();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('valuePulseActive$', () => {
	it('projects commands to boolean and starts false', () => {
		vi.useFakeTimers();
		try {
			const events$ = new Subject<{ state: string }>();
			const seen: boolean[] = [];
			const sub = valuePulseActive$(events$).subscribe((active) => {
				seen.push(active);
			});

			expect(seen).toEqual([false]);

			events$.next({ state: 'value' });
			expect(seen).toEqual([false, true]);

			vi.advanceTimersByTime(PULSE_MS);
			expect(seen).toEqual([false, true, false]);

			sub.unsubscribe();
		} finally {
			vi.useRealTimers();
		}
	});
});
